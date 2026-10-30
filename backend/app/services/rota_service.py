"""Roteamento OSRM assíncrono: geometria do traçado, distância, duração e rotas alternativas."""

from dataclasses import dataclass

import httpx

from app.core.cache import cache
from app.core.config import obter_settings
from app.schemas.roteiros import RotaInfo

TTL_ROTA = 3600
# O OSRM "arrasta" (snap) um ponto sem estrada até a rodovia mais próxima. Acima de 2 km de
# arrasto (ex.: Fernando de Noronha, ilhas) a rota não faz sentido: tratamos como sem estrada.
LIMITE_SNAP_M = 2000
MAX_PONTOS_MAPA = 300


class SemRotaRodoviaria(LookupError):
    """Não existe ligação por estrada entre os pontos (ilha, travessia)."""


@dataclass(frozen=True)
class RotaCalculada:
    distancia_km: float
    duracao_min: float
    geometria: list[tuple[float, float]]  # [lat, lon] completa, para altimetria e paradas


def reduzir_pontos(pontos: list[tuple[float, float]], maximo: int) -> list[tuple[float, float]]:
    """Amostra uniforme mantendo o primeiro e o último ponto."""
    if len(pontos) <= maximo:
        return pontos
    passo = (len(pontos) - 1) / (maximo - 1)
    return [pontos[round(i * passo)] for i in range(maximo)]


def formatar_duracao(minutos: float) -> str:
    horas, resto = divmod(round(minutos), 60)
    return f"{horas}h {resto:02d}min" if horas else f"{resto}min"


def para_rota_info(rota: RotaCalculada) -> RotaInfo:
    return RotaInfo(
        disponivel=True,
        distancia_km=rota.distancia_km,
        duracao_min=rota.duracao_min,
        resumo=f"{rota.distancia_km:.0f} km · {formatar_duracao(rota.duracao_min)} de carro",
        geometria=reduzir_pontos(rota.geometria, MAX_PONTOS_MAPA),
    )


def rota_fallback() -> RotaInfo:
    return RotaInfo(
        disponivel=False, resumo="Sem rota rodoviária direta. Considere voos ou barcos."
    )


async def calcular_rotas_osrm_async(
    client: httpx.AsyncClient,
    lat_o: float,
    lon_o: float,
    lat_d: float,
    lon_d: float,
    alternativas: bool = False,
) -> list[RotaCalculada]:
    """Rotas de carro do OSRM, da mais rápida para a mais lenta. Lança exceção se não houver."""
    chave = (
        "rota",
        round(lat_o, 3),
        round(lon_o, 3),
        round(lat_d, 3),
        round(lon_d, 3),
        alternativas,
    )
    if (em_cache := cache.obter(chave)) is not None:
        return em_cache

    config = obter_settings()
    # Atenção: o OSRM espera "longitude,latitude", ao contrário do resto do projeto.
    resposta = await client.get(
        f"{config.osrm_url}/{lon_o},{lat_o};{lon_d},{lat_d}",
        params={
            "overview": "full",
            "geometries": "geojson",
            "alternatives": "true" if alternativas else "false",
        },
        timeout=config.rota_timeout_segundos,
    )
    resposta.raise_for_status()
    dados = resposta.json()
    if dados.get("code") != "Ok" or not dados.get("routes"):
        raise SemRotaRodoviaria(dados.get("message", "OSRM sem rota"))
    if any(p.get("distance", 0.0) > LIMITE_SNAP_M for p in dados.get("waypoints", [])):
        raise SemRotaRodoviaria("ponto a mais de 2 km da estrada mais próxima")

    rotas = [
        RotaCalculada(
            distancia_km=round(r["distance"] / 1000, 1),
            duracao_min=round(r["duration"] / 60, 1),
            geometria=[(lat, lon) for lon, lat in r["geometry"]["coordinates"]],
        )
        for r in dados["routes"]
    ]
    cache.definir(chave, rotas, TTL_ROTA)
    return rotas


async def calcular_rota_osrm_async(
    client: httpx.AsyncClient,
    lat_o: float,
    lon_o: float,
    lat_d: float,
    lon_d: float,
    preferencia_rota: str = "rapida",
) -> RotaCalculada:
    """Uma rota: a mais rápida, ou a mais curta (mais econômica) entre as alternativas."""
    if preferencia_rota == "economica":
        rotas = await calcular_rotas_osrm_async(
            client, lat_o, lon_o, lat_d, lon_d, alternativas=True
        )
        return min(rotas, key=lambda r: r.distancia_km)
    rotas = await calcular_rotas_osrm_async(client, lat_o, lon_o, lat_d, lon_d)
    return rotas[0]
