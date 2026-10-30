"""Perfil topográfico da rota, ganho e perda de elevação e penalização no consumo.

Amostra pontos ao longo do traçado do OSRM, consulta a altitude de todos numa única chamada
à Open-Elevation e calcula quanto a serra aumenta (ou a descida reduz) o consumo nominal.
"""

import httpx

from app.core.cache import cache
from app.core.config import obter_settings
from app.schemas.roteiros import AltimetriaInfo
from app.services.rota_service import reduzir_pontos

PONTOS_AMOSTRA = 60
TTL_ELEVACAO = 24 * 3600
# Ruído do modelo de elevação: variações menores que isto entre amostras são ignoradas.
LIMIAR_RUIDO_M = 3.0

# Modelo simplificado de impacto do relevo no consumo (por metro de desnível a cada km):
# subir custa energia; descer devolve uma parte (mais no elétrico, que regenera na frenagem).
FATOR_SUBIDA = 0.5
FATOR_DESCIDA = {"combustao": 0.2, "eletrico": 0.35}
PENALIZACAO_MIN, PENALIZACAO_MAX = -10.0, 25.0


def altimetria_fallback() -> AltimetriaInfo:
    return AltimetriaInfo(disponivel=False)


def calcular_desnivel(perfil: list[float]) -> tuple[float, float]:
    """(ganho_m, perda_m) somando só variações acima do ruído do modelo de elevação."""
    ganho = perda = 0.0
    referencia = perfil[0]
    for altitude in perfil[1:]:
        delta = altitude - referencia
        if abs(delta) >= LIMIAR_RUIDO_M:
            if delta > 0:
                ganho += delta
            else:
                perda -= delta
            referencia = altitude
    return round(ganho, 1), round(perda, 1)


def calcular_penalizacao(
    ganho_m: float, perda_m: float, distancia_km: float, propulsao: str
) -> float:
    """Variação percentual do consumo causada pelo relevo (positiva = gasta mais)."""
    if distancia_km <= 0:
        return 0.0
    pct = (ganho_m * FATOR_SUBIDA - perda_m * FATOR_DESCIDA.get(propulsao, 0.2)) / distancia_km
    return round(max(PENALIZACAO_MIN, min(PENALIZACAO_MAX, pct)), 1)


def montar_altimetria(perfil: list[float], distancia_km: float, propulsao: str) -> AltimetriaInfo:
    ganho, perda = calcular_desnivel(perfil)
    return AltimetriaInfo(
        disponivel=True,
        ganho_m=ganho,
        perda_m=perda,
        altitude_max_m=round(max(perfil), 1),
        altitude_min_m=round(min(perfil), 1),
        desnivel_liquido_m=round(perfil[-1] - perfil[0], 1),
        penalizacao_pct=calcular_penalizacao(ganho, perda, distancia_km, propulsao),
        perfil=[round(a, 1) for a in perfil],
    )


async def obter_perfil_altimetrico_async(
    client: httpx.AsyncClient, geometria: list[tuple[float, float]]
) -> list[float]:
    """Altitudes (m) de pontos amostrados ao longo do traçado, numa única chamada."""
    if len(geometria) < 2:
        raise ValueError("geometria insuficiente para o perfil de relevo")
    amostra = reduzir_pontos(geometria, PONTOS_AMOSTRA)
    chave = ("elevacao", tuple((round(a, 3), round(b, 3)) for a, b in amostra))
    if (em_cache := cache.obter(chave)) is not None:
        return em_cache

    config = obter_settings()
    resposta = await client.post(
        config.elevacao_url,
        json={"locations": [{"latitude": lat, "longitude": lon} for lat, lon in amostra]},
        timeout=config.rota_timeout_segundos,
    )
    resposta.raise_for_status()
    perfil = [float(r["elevation"]) for r in resposta.json()["results"]]
    if len(perfil) != len(amostra):
        raise ValueError("Open-Elevation devolveu quantidade de pontos diferente da enviada")
    cache.definir(chave, perfil, TTL_ELEVACAO)
    return perfil
