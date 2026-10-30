"""Testes do núcleo: cache, circuit breaker, catálogo, serviços de geocodificação, clima e rota,
persistência atômica e métricas."""

import asyncio
import json
import time
from pathlib import Path

import httpx
import pytest

from app.core.cache import CacheTTL
from app.core.catalogo import atrativos_do_destino, buscar_destino, haversine_km
from app.core.circuit_breaker import CircuitBreaker, EstadoCircuito
from app.core.metricas import Metricas
from app.services import storage_service
from app.services.clima_service import buscar_coordenadas_async, obter_clima_async, sigla_uf
from app.services.rota_service import (
    SemRotaRodoviaria,
    calcular_rota_osrm_async,
    formatar_duracao,
    reduzir_pontos,
)
from tests.conftest import provedores_simulados


def cliente_simulado(handler=provedores_simulados) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ---------------------------------------------------------------------------
# Cache com TTL
# ---------------------------------------------------------------------------


def test_cache_expira_pelo_ttl() -> None:
    c = CacheTTL()
    c.definir("k", 1, ttl=0.05)
    assert c.obter("k") == 1
    time.sleep(0.06)
    assert c.obter("k", "vazio") == "vazio"
    assert (c.acertos, c.falhas) == (1, 1)


def test_cache_respeita_o_limite_de_itens() -> None:
    c = CacheTTL(max_itens=2)
    c.definir("a", 1, ttl=10)
    c.definir("b", 2, ttl=20)
    c.definir("c", 3, ttl=30)
    assert len(c) == 2
    assert c.obter("a") is None  # o que vencia primeiro saiu


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------


def test_circuit_breaker_abre_usa_fallback_e_fecha_depois_do_reset() -> None:
    async def cenario() -> None:
        breaker = CircuitBreaker("teste", limite_falhas=2, tempo_reset=0.05)
        chamadas = 0

        async def falha() -> str:
            nonlocal chamadas
            chamadas += 1
            raise httpx.ConnectTimeout("timeout")

        async def ok() -> str:
            return "real"

        assert await breaker.chamar(falha, lambda: "fallback") == ("fallback", True)
        assert breaker.estado is EstadoCircuito.FECHADO
        await breaker.chamar(falha, lambda: "fallback")
        assert breaker.estado is EstadoCircuito.ABERTO

        # Aberto: nem chama o provedor, responde o fallback na hora.
        assert await breaker.chamar(falha, lambda: "fallback") == ("fallback", True)
        assert chamadas == 2

        await asyncio.sleep(0.06)
        assert await breaker.chamar(ok, lambda: "fallback") == ("real", False)
        assert breaker.estado is EstadoCircuito.FECHADO
        assert breaker.status()["total_fallbacks"] == 3

    asyncio.run(cenario())


def test_circuit_breaker_meio_aberto_reabre_na_primeira_falha() -> None:
    async def cenario() -> None:
        breaker = CircuitBreaker("teste", limite_falhas=1, tempo_reset=0.01)

        async def falha() -> None:
            raise ValueError("ruim")

        await breaker.chamar(falha, lambda: None)
        await asyncio.sleep(0.02)
        await breaker.chamar(falha, lambda: None)
        assert breaker.estado is EstadoCircuito.ABERTO
        assert breaker.ultimo_erro == "ValueError: ruim"

    asyncio.run(cenario())


# ---------------------------------------------------------------------------
# Catálogo
# ---------------------------------------------------------------------------


def test_catalogo_ignora_acentos_e_tem_fallback_generico() -> None:
    assert buscar_destino("sao luis", "ma") is not None
    atrativos, gastronomia = atrativos_do_destino("Cidade Inventada", "PI")
    assert "Cidade Inventada" in atrativos[0].nome and gastronomia


def test_haversine_teresina_fortaleza() -> None:
    assert 480 < haversine_km(-5.089, -42.802, -3.717, -38.543) < 510


# ---------------------------------------------------------------------------
# Geocodificação e clima
# ---------------------------------------------------------------------------


def test_sigla_uf_aceita_nome_com_ou_sem_acento() -> None:
    assert sigla_uf("Piauí") == "PI"
    assert sigla_uf("piaui") == "PI"
    assert sigla_uf("CE") == "CE"
    assert sigla_uf("Atlântida") == ""


def test_geocodificacao_filtra_pela_uf_e_usa_cache() -> None:
    chamadas = 0

    def contar(request: httpx.Request) -> httpx.Response:
        nonlocal chamadas
        chamadas += 1
        return provedores_simulados(request)

    async def cenario() -> None:
        async with cliente_simulado(contar) as client:
            local = await buscar_coordenadas_async(client, "Teresina", "PI")
            assert (local.lat, local.lon, local.encontrado) == (-5.089, -42.802, True)
            await buscar_coordenadas_async(client, "Teresina", "PI")
            with pytest.raises(LookupError):
                await buscar_coordenadas_async(client, "Teresina", "CE")

    asyncio.run(cenario())
    assert chamadas == 2  # a segunda consulta de Teresina-PI veio do cache


def test_clima_traduz_o_codigo_wmo() -> None:
    async def cenario() -> None:
        async with cliente_simulado() as client:
            clima = await obter_clima_async(client, -2.79, -40.51)
            assert clima.disponivel and clima.temperatura_c == 31.4
            assert clima.condicao == "Predominantemente limpo"

    asyncio.run(cenario())


# ---------------------------------------------------------------------------
# Rota
# ---------------------------------------------------------------------------


def test_rota_osrm_converte_unidades_e_ordem_lat_lon() -> None:
    async def cenario() -> None:
        async with cliente_simulado() as client:
            rota = await calcular_rota_osrm_async(client, -5.089, -42.802, -3.717, -38.543)
            assert 590 < rota.distancia_km < 640
            assert rota.geometria[0] == pytest.approx((-5.089, -42.802))

    asyncio.run(cenario())


def test_rota_economica_escolhe_a_mais_curta() -> None:
    async def cenario() -> None:
        async with cliente_simulado() as client:
            rapida = await calcular_rota_osrm_async(client, -5.089, -42.802, -3.717, -38.543)
            economica = await calcular_rota_osrm_async(
                client, -5.089, -42.802, -3.717, -38.543, preferencia_rota="economica"
            )
            assert economica.distancia_km < rapida.distancia_km

    asyncio.run(cenario())


def test_ilha_sem_estrada_e_detectada_pelo_snap() -> None:
    async def cenario() -> None:
        async with cliente_simulado() as client:
            with pytest.raises(SemRotaRodoviaria):
                await calcular_rota_osrm_async(client, -8.05, -34.88, -3.854, -32.424)

    asyncio.run(cenario())


def test_utilitarios_de_rota() -> None:
    pontos = [(float(i), 0.0) for i in range(1000)]
    reduzidos = reduzir_pontos(pontos, 10)
    assert len(reduzidos) == 10 and reduzidos[0] == pontos[0] and reduzidos[-1] == pontos[-1]
    assert formatar_duracao(125) == "2h 05min"
    assert formatar_duracao(45) == "45min"


# ---------------------------------------------------------------------------
# Persistência
# ---------------------------------------------------------------------------


def test_storage_isola_usuarios_e_grava_json_valido(tmp_path: Path) -> None:
    async def cenario() -> None:
        await storage_service.salvar_nova_viagem("ana", {"id": "r1", "atrativos": []}, True)
        await storage_service.salvar_nova_viagem("bia", {"id": "r2", "atrativos": []}, True)
        assert [r["id"] for r in await storage_service.listar_viagens("ana", True)] == ["r1"]
        assert await storage_service.remover_viagem("ana", "r2", True) is False  # não é dela
        assert await storage_service.contar_roteiros() == 2

    asyncio.run(cenario())
    dados = json.loads((tmp_path / "viagens.json").read_text(encoding="utf-8"))
    assert dados["total_usuarios"] == 2 and dados["total_roteiros"] == 2
    assert not list(tmp_path.glob(".viagens-*.tmp"))  # sem temporários esquecidos


def test_storage_de_visitante_fica_so_em_memoria(tmp_path: Path) -> None:
    async def cenario() -> None:
        await storage_service.salvar_nova_viagem("visitante-1", {"id": "r1"}, False)
        assert len(await storage_service.listar_viagens("visitante-1", False)) == 1
        await storage_service.descartar_visitante("visitante-1")
        assert await storage_service.listar_viagens("visitante-1", False) == []

    asyncio.run(cenario())
    assert not (tmp_path / "viagens.json").exists()


def test_storage_recupera_de_json_corrompido(tmp_path: Path) -> None:
    (tmp_path / "viagens.json").write_text("{ quebrado", encoding="utf-8")
    assert asyncio.run(storage_service.listar_viagens("ana", True)) == []
    assert list(tmp_path.glob("viagens.corrompido-*.json"))


def test_storage_aguenta_gravacoes_concorrentes() -> None:
    async def cenario() -> None:
        await asyncio.gather(
            *(storage_service.salvar_nova_viagem("ana", {"id": f"r{i}"}, True) for i in range(20))
        )
        assert len(await storage_service.listar_viagens("ana", True)) == 20

    asyncio.run(cenario())


# ---------------------------------------------------------------------------
# Métricas
# ---------------------------------------------------------------------------


def test_metricas_contam_status_e_latencia() -> None:
    m = Metricas()
    m.entrar()
    m.sair("/healthz", 200, 10.0)
    m.entrar()
    m.sair("/api/v1/roteiros/planejar", 409, 30.0)
    s = m.snapshot()
    assert s["requisicoes_total"] == 2 and s["conexoes_ativas"] == 0
    assert s["latencia_media_ms"] == 20.0 and s["conflitos_409"] == 1
    assert s["por_status"] == {"200": 1, "409": 1}
