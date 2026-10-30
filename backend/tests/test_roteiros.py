"""Suíte de /api/v1/roteiros e /api/v1/telemetria: concorrência, validação, rotas, altimetria,
custos, streaming SSE, GPX, histórico e métricas. Provedores simulados no conftest."""

import asyncio
import json
from xml.etree import ElementTree as ET

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import obter_http_client
from app.main import criar_app
from app.routers import roteiros
from app.schemas.roteiros import VeiculoCombustao, VeiculoEletrico
from app.services.altimetria_service import calcular_desnivel, calcular_penalizacao
from app.services.custos_service import calcular_custos, pedagio_estimado
from app.services.gemini_service import guia_contingencia, limpar_formato_texto, montar_prompt
from app.services.postos_service import calcular_paradas
from app.services.sessao_service import RegistroSessoes
from tests.conftest import ROTEIRO_PADRAO, provedores_simulados

PLANEJAR = "/api/v1/roteiros/planejar"


def planejar(client: TestClient, headers: dict[str, str], **mudancas) -> httpx.Response:
    return client.post(PLANEJAR, json={**ROTEIRO_PADRAO, **mudancas}, headers=headers)


# ---------------------------------------------------------------------------
# /planejar
# ---------------------------------------------------------------------------


def test_planejar_orquestra_os_provedores(client: TestClient, visitante: dict[str, str]) -> None:
    r = planejar(client, visitante)
    assert r.status_code == 200
    roteiro = r.json()

    assert roteiro["origem"]["nome"] == "Teresina - PI" and roteiro["origem"]["encontrado"]
    assert roteiro["destino"]["uf"] == "CE"
    assert roteiro["clima"]["temperatura_c"] == 31.4
    assert roteiro["rota"]["disponivel"] and roteiro["rota"]["distancia_km"] > 400
    assert len(roteiro["rota"]["geometria"]) > 2
    assert (
        "📍 IDENTIDADE" in roteiro["guia"] and roteiro["guia_fallback"] is True
    )  # sem chave Gemini
    assert {"Pedra Furada", "Peixe com tapioca"} <= {a["nome"] for a in roteiro["atrativos"]}
    assert set(roteiro["provedores"]) == {"geocoding", "clima", "rota", "gemini"}
    assert float(r.headers["X-Process-Time"]) < 1000


def test_planejar_exige_sessao(client: TestClient) -> None:
    assert client.post(PLANEJAR, json=ROTEIRO_PADRAO).status_code == 401


@pytest.mark.parametrize(
    "campo, valor",
    [
        ("origem_uf", "XX"),
        ("destino_uf", "Piauí"),
        ("origem_cidade", "1234"),
        ("destino_cidade", "<script></script>"),
        ("dias_estadia", 6),
        ("passageiros", 9),
        ("estilo_viagem", "luxo"),
    ],
)
def test_planejar_valida_com_422(
    client: TestClient, visitante: dict[str, str], campo: str, valor: object
) -> None:
    r = planejar(client, visitante, **{campo: valor})
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"][-1] == campo


def test_planejar_normaliza_uf_minuscula_e_sanitiza_cidade(
    client: TestClient, visitante: dict[str, str]
) -> None:
    r = planejar(client, visitante, origem_uf="pi", origem_cidade="  <b>Teresina</b> ")
    assert r.status_code == 200
    assert r.json()["origem"]["nome"] == "Teresina - PI"


def test_planejar_bloqueia_requisicao_duplicada_com_409(
    client: TestClient, visitante: dict[str, str]
) -> None:
    chave = f"{visitante['X-User-Id']}:teresina_pi->jijoca de jericoacoara_ce"
    roteiros.REQUISICOES_ATIVAS.add(chave)
    r = planejar(client, visitante)
    assert r.status_code == 409
    assert "em andamento" in r.json()["detail"]
    roteiros.REQUISICOES_ATIVAS.discard(chave)
    assert planejar(client, visitante).status_code == 200


def test_planejar_concorrente_de_verdade_devolve_um_200_e_um_409() -> None:
    """Dois cliques simultâneos: o asyncio.Lock deixa só um passar."""

    async def provedores_lentos(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.2)
        return provedores_simulados(request)

    async def cenario() -> list[int]:
        app = criar_app()
        externo = httpx.AsyncClient(transport=httpx.MockTransport(provedores_lentos))
        app.dependency_overrides[obter_http_client] = lambda: externo
        app.state.sessoes = RegistroSessoes(ttl_visitante=__import__("datetime").timedelta(hours=2))
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://teste"
        ) as c:
            uid = (await c.post("/api/v1/auth/visitante")).json()["usuario"]["user_id"]
            respostas = await asyncio.gather(
                *(
                    c.post(PLANEJAR, json=ROTEIRO_PADRAO, headers={"X-User-Id": uid})
                    for _ in range(2)
                )
            )
        return sorted(r.status_code for r in respostas)

    assert asyncio.run(cenario()) == [200, 409]


def test_planejar_com_provedores_fora_do_ar_degrada_sem_erro(
    visitante_fora_do_ar: TestClient,
) -> None:
    client, headers = visitante_fora_do_ar
    for _ in range(4):  # abre os circuitos de clima e rota (limite de 3 falhas)
        r = planejar(client, headers)
        assert r.status_code == 200
    roteiro = r.json()
    assert roteiro["clima"]["disponivel"] is False
    assert roteiro["rota"]["disponivel"] is False
    assert roteiro["origem"]["encontrado"] is False and roteiro["origem"]["lat"] == pytest.approx(
        -5.089
    )
    assert roteiro["provedores"]["rota"]["fallback"] is True

    estados = {
        b["nome"]: b["estado"] for b in client.get("/api/v1/telemetria/circuit-breakers").json()
    }
    assert estados["rota"] == "aberto" and estados["clima"] == "aberto"


@pytest.fixture
def visitante_fora_do_ar() -> tuple[TestClient, dict[str, str]]:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            return provedores_simulados(request)
        raise httpx.ConnectError("provedor fora do ar", request=request)

    app = criar_app()
    externo = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    app.dependency_overrides[obter_http_client] = lambda: externo
    with TestClient(app) as c:
        uid = c.post("/api/v1/auth/visitante").json()["usuario"]["user_id"]
        yield c, {"X-User-Id": uid}


def test_ilha_sem_estrada_responde_sem_rota(client: TestClient, visitante: dict[str, str]) -> None:
    r = planejar(client, visitante, destino_cidade="Fernando de Noronha", destino_uf="PE")
    assert r.status_code == 200
    assert r.json()["rota"]["disponivel"] is False
    assert "voos ou barcos" in r.json()["rota"]["resumo"]
    # Ilha não é falha do OSRM: o circuito continua fechado.
    estados = {
        b["nome"]: b["estado"] for b in client.get("/api/v1/telemetria/circuit-breakers").json()
    }
    assert estados["rota"] == "fechado"


# ---------------------------------------------------------------------------
# Histórico, visitas, exclusão, compartilhamento, GPX
# ---------------------------------------------------------------------------


def test_historico_isolado_por_usuario(
    client: TestClient, visitante: dict[str, str], usuario_google: dict[str, str]
) -> None:
    planejar(client, visitante)
    planejar(client, usuario_google, destino_cidade="Fortaleza")

    do_visitante = client.get("/api/v1/roteiros/minhas-viagens", headers=visitante).json()
    do_google = client.get("/api/v1/roteiros/minhas-viagens", headers=usuario_google).json()
    assert [v["destino"]["cidade"] for v in do_visitante] == ["Jijoca de Jericoacoara"]
    assert [v["destino"]["cidade"] for v in do_google] == ["Fortaleza"]


def test_marcar_visita_e_excluir(client: TestClient, usuario_google: dict[str, str]) -> None:
    roteiro = planejar(client, usuario_google).json()
    atrativo = roteiro["atrativos"][0]["id"]
    url = f"/api/v1/roteiros/{roteiro['id']}"

    r = client.patch(
        f"{url}/visitas", json={"atrativo_id": atrativo, "visitado": True}, headers=usuario_google
    )
    assert r.status_code == 200
    assert r.json()["atrativos"][0]["visitado"] is True
    assert (
        client.patch(
            f"{url}/visitas",
            json={"atrativo_id": "nao-existe", "visitado": True},
            headers=usuario_google,
        ).status_code
        == 404
    )

    assert client.delete(url, headers=usuario_google).status_code == 204
    assert client.delete(url, headers=usuario_google).status_code == 404
    assert client.get("/api/v1/roteiros/minhas-viagens", headers=usuario_google).json() == []


def test_nao_mexe_no_roteiro_de_outro_usuario(
    client: TestClient, visitante: dict[str, str], usuario_google: dict[str, str]
) -> None:
    roteiro = planejar(client, usuario_google).json()
    assert client.delete(f"/api/v1/roteiros/{roteiro['id']}", headers=visitante).status_code == 404


def test_compartilhar_agenda_em_segundo_plano(
    client: TestClient, visitante: dict[str, str]
) -> None:
    roteiro = planejar(client, visitante).json()
    r = client.post(
        f"/api/v1/roteiros/{roteiro['id']}/compartilhar",
        json={"canal": "whatsapp"},
        headers=visitante,
    )
    assert r.status_code == 202
    assert r.json()["link_whatsapp"].startswith("https://wa.me/?text=Roteiro%20Teresina")


def test_exportar_gpx_11_valido(client: TestClient, visitante: dict[str, str]) -> None:
    roteiro = planejar(client, visitante).json()
    r = client.post(
        "/api/v1/roteiros/exportar/gpx", json={"roteiro_id": roteiro["id"]}, headers=visitante
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/gpx+xml")
    assert (
        'filename="roteiro-teresina-jijoca-de-jericoacoara.gpx"' in r.headers["content-disposition"]
    )

    ns = {"g": "http://www.topografix.com/GPX/1/1"}
    gpx = ET.fromstring(r.content)
    assert gpx.get("version") == "1.1"
    assert [w.findtext("g:name", namespaces=ns) for w in gpx.findall("g:wpt", ns)] == [
        "Origem: Teresina - PI",
        "Destino: Jijoca de Jericoacoara - CE",
    ]
    assert len(gpx.findall("g:trk/g:trkseg/g:trkpt", ns)) == len(roteiro["rota"]["geometria"])


# ---------------------------------------------------------------------------
# Mapa, altimetria, autonomia e custos
# ---------------------------------------------------------------------------

MAPA = {
    "origem": {"lat": -5.089, "lon": -42.802},
    "destino": {"lat": -2.796, "lon": -40.512},
    "origem_uf": "PI",
    "destino_uf": "CE",
    "passageiros": 4,
}


def test_mapa_rota_com_alternativas_relevo_paradas_e_custos(
    client: TestClient, visitante: dict[str, str]
) -> None:
    r = client.post("/api/v1/roteiros/mapa-rota", json=MAPA, headers=visitante)
    assert r.status_code == 200
    rotas = r.json()["rotas"]
    assert [x["rotulo"] for x in rotas] == [
        "Sugestão 01 · Menor tempo",
        "Sugestão 02 · Mais econômica",
    ]
    assert rotas[1]["rota"]["distancia_km"] < rotas[0]["rota"]["distancia_km"]

    alt = rotas[0]["altimetria"]
    assert alt["disponivel"] and alt["altitude_max_m"] > 700 and alt["ganho_m"] > 600
    assert alt["penalizacao_pct"] > 0
    assert rotas[0]["custos"]["passageiros"] == 4


def test_mapa_rota_eletrico_marca_eletropostos(
    client: TestClient, visitante: dict[str, str]
) -> None:
    corpo = {
        **MAPA,
        "veiculo": {
            "propulsao": "eletrico",
            "eficiencia_km_kwh": 6,
            "bateria_kwh": 30,
            "preco_kwh": 1,
        },
    }
    rota = client.post("/api/v1/roteiros/mapa-rota", json=corpo, headers=visitante).json()["rotas"][
        0
    ]
    paradas = rota["autonomia"]["paradas"]
    assert paradas and {p["tipo"] for p in paradas} == {"eletroposto"}
    assert rota["custos"]["unidade"] == "kWh"


def test_desnivel_ignora_ruido_e_soma_subidas_e_descidas() -> None:
    assert calcular_desnivel([100, 101, 150, 149, 120, 300]) == (230.0, 30.0)


def test_penalizacao_do_relevo_tem_limites() -> None:
    assert calcular_penalizacao(1000, 0, 100, "combustao") == 5.0
    assert calcular_penalizacao(0, 1000, 100, "eletrico") == -3.5
    assert calcular_penalizacao(100000, 0, 10, "combustao") == 25.0
    assert calcular_penalizacao(500, 500, 0, "combustao") == 0.0


def test_paradas_respeitam_a_reserva_de_18_por_cento() -> None:
    geometria = [(0.0, i * 0.1) for i in range(101)]  # ~1113 km em linha reta no equador
    autonomia = calcular_paradas(
        geometria, VeiculoCombustao(consumo_km_l=10, tanque_litros=50, preco_litro=6)
    )
    assert autonomia.autonomia_nominal_km == 500
    assert len(autonomia.paradas) == 2
    for parada in autonomia.paradas:
        assert parada.nivel_chegada_pct >= 18
        assert parada.tipo == "posto"


def test_penalizacao_reduz_a_autonomia() -> None:
    plano = calcular_paradas(
        [(0, 0), (0, 1)], VeiculoEletrico(bateria_kwh=60, eficiencia_km_kwh=6), 20
    )
    assert plano.autonomia_ajustada_km == 300.0


def test_custos_combustao_com_rateio_e_emissoes() -> None:
    custos = calcular_custos(
        600, VeiculoCombustao(consumo_km_l=12, preco_litro=6), "PI", "CE", passageiros=4
    )
    assert custos.quantidade_energia == 50.0 and custos.custo_energia == 300.0
    assert custos.custo_pedagio == pedagio_estimado(600, "PI", "CE") == 18.0
    assert custos.custo_total == 318.0 and custos.por_passageiro == 79.5
    assert custos.emissoes_kg_co2 == 115.5


def test_endpoint_custos_valida_entrada(client: TestClient) -> None:
    ok = client.post(
        "/api/v1/roteiros/custos", json={"distancia_km": 100, "origem_uf": "SP", "destino_uf": "RJ"}
    )
    assert ok.status_code == 200 and ok.json()["custo_pedagio"] == 12.0
    assert (
        client.post(
            "/api/v1/roteiros/custos",
            json={"distancia_km": -1, "origem_uf": "SP", "destino_uf": "RJ"},
        ).status_code
        == 422
    )


# ---------------------------------------------------------------------------
# Guia por IA e streaming SSE
# ---------------------------------------------------------------------------


def test_prompt_segue_a_diretriz_de_concisao() -> None:
    prompt = montar_prompt("Teresina - PI", 1, "cultural", None, ["Encontro dos Rios"], ["Cajuína"])
    assert "no máximo 20 palavras" in prompt and "Manhã, Tarde e Noite" in prompt
    assert "Encontro dos Rios" in prompt and "clima indisponível" in prompt


def test_limpeza_remove_markdown_e_saudacao() -> None:
    texto = "Olá! Claro, aqui vai:\n**📍 IDENTIDADE:** cidade *linda*\n\n\n\n# Fim"
    assert limpar_formato_texto(texto) == "📍 IDENTIDADE: cidade linda\n\n Fim"


def test_guia_de_contingencia_tem_um_dia_por_linha() -> None:
    guia = guia_contingencia("Parnaíba - PI", 3, None, ["Delta"], ["Caranguejo"])
    assert guia.count("\nDia ") == 3 and "Caranguejo" in guia


def test_stream_guia_envia_eventos_sse_ate_done(client: TestClient) -> None:
    corpo = {
        "destino": "Teresina - PI",
        "dias_estadia": 2,
        "atrativos": ["Encontro dos Rios"],
        "gastronomia": ["Cajuína"],
    }
    with client.stream("POST", "/api/v1/roteiros/stream-guia", json=corpo) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        assert r.headers["cache-control"] == "no-cache"
        eventos = [json.loads(linha[6:]) for linha in r.iter_lines() if linha.startswith("data: ")]

    assert len(eventos) > 2
    assert eventos[-1] == {"chunk": "", "done": True}
    assert all(e["done"] is False for e in eventos[:-1])
    assert "📍 IDENTIDADE" in "".join(e["chunk"] for e in eventos)


def test_stream_guia_com_gemini_real_simulado(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Com chave configurada, os fragmentos vêm do SDK do Gemini (aqui substituído)."""
    from app.core.config import obter_settings
    from app.services import gemini_service

    class Pedaco:
        def __init__(self, texto: str) -> None:
            self.text = texto

    class Modelos:
        async def generate_content_stream(self, **_: object):
            async def fluxo():
                for parte in ["📍 IDENTIDADE: ", "**Terra** do sol."]:
                    yield Pedaco(parte)

            return fluxo()

    class Cliente:
        aio = type("Aio", (), {"models": Modelos()})()

    monkeypatch.setenv("GEMINI_API_KEY", "chave-teste")
    obter_settings.cache_clear()
    monkeypatch.setattr(gemini_service, "_cliente", lambda: Cliente())

    with client.stream(
        "POST", "/api/v1/roteiros/stream-guia", json={"destino": "Teresina - PI"}
    ) as r:
        chunks = [
            json.loads(linha[6:])["chunk"] for linha in r.iter_lines() if linha.startswith("data: ")
        ]
    assert chunks == ["📍 IDENTIDADE: ", "Terra do sol.", ""]


# ---------------------------------------------------------------------------
# Telemetria e Prometheus
# ---------------------------------------------------------------------------


def test_telemetria_conta_roteiros_e_mostra_provedores(
    client: TestClient, visitante: dict[str, str]
) -> None:
    planejar(client, visitante)
    t = client.get("/api/v1/telemetria").json()
    assert t["roteiros_gerados"] == 1 and t["total_roteiros_salvos"] == 1
    assert t["provedores_ativos"] == t["provedores_total"] == 5
    assert t["sessoes_ativas"]["visitante"] == 1
    assert t["latencia_media_ms"] is not None and "/api/v1/roteiros/planejar" in t["por_rota"]


def test_auditoria_em_segundo_plano(client: TestClient) -> None:
    r = client.post(
        "/api/v1/telemetria/auditoria", json={"acao": "exportou_gpx", "detalhes": {"km": 612}}
    )
    assert r.status_code == 202
    eventos = client.get("/api/v1/telemetria/auditoria").json()
    assert eventos[-1]["acao"] == "exportou_gpx" and "recebido_em" in eventos[-1]


def test_metrics_no_formato_prometheus(client: TestClient, visitante: dict[str, str]) -> None:
    planejar(client, visitante)
    r = client.get("/metrics")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/plain")
    texto = r.text
    assert "# TYPE guia_requisicoes_total counter" in texto
    assert "guia_roteiros_gerados_total 1" in texto
    assert 'guia_circuit_breaker_aberto{provedor="rota"} 0' in texto
    assert 'guia_sessoes_ativas{tipo="visitante"} 1' in texto


def test_planejar_aceita_varios_perfis(client: TestClient, visitante: dict[str, str]) -> None:
    r = planejar(client, visitante, perfis=["cultural", "gastronomico"])
    assert r.status_code == 200
    assert r.json()["perfis"] == ["cultural", "gastronomico"]
    assert planejar(client, visitante, perfis=["luxo"]).status_code == 422
    # Sem a lista, o perfil é o estilo_viagem (compatível com clientes antigos).
    assert planejar(client, visitante, destino_cidade="Fortaleza").json()["perfis"] == ["ecoturismo"]
