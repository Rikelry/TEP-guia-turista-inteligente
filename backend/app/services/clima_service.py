"""Integração assíncrona com o Open-Meteo (geocodificação e clima) via httpx.AsyncClient compartilhado.

As funções lançam exceção quando o provedor falha; o router as chama pelo CircuitBreaker, que
devolve o fallback (coordenadas da capital, clima "Indisponível") sem derrubar a requisição.
"""

import httpx

from app.core.cache import cache
from app.core.catalogo import buscar_destino, normalizar
from app.core.config import carregar_estados, obter_settings
from app.schemas.roteiros import ClimaInfo, LocalInfo

# Coordenadas aproximadas das capitais: fallback quando a cidade não é encontrada.
CAPITAIS: dict[str, tuple[float, float]] = {
    "AC": (-9.975, -67.824), "AL": (-9.649, -35.708), "AP": (0.034, -51.070),
    "AM": (-3.119, -60.021), "BA": (-12.977, -38.501), "CE": (-3.717, -38.543),
    "DF": (-15.779, -47.929), "ES": (-20.315, -40.312), "GO": (-16.686, -49.264),
    "MA": (-2.530, -44.306), "MT": (-15.601, -56.097), "MS": (-20.469, -54.620),
    "MG": (-19.917, -43.935), "PA": (-1.456, -48.490), "PB": (-7.115, -34.861),
    "PR": (-25.429, -49.271), "PE": (-8.048, -34.877), "PI": (-5.089, -42.801),
    "RJ": (-22.907, -43.173), "RN": (-5.795, -35.209), "RS": (-30.034, -51.218),
    "RO": (-8.762, -63.904), "RR": (2.820, -60.673), "SC": (-27.596, -48.549),
    "SP": (-23.550, -46.633), "SE": (-10.911, -37.073), "TO": (-10.184, -48.334),
}  # fmt: skip

# Códigos de tempo WMO usados pelo Open-Meteo.
CONDICOES_WMO: dict[int, str] = {
    0: "Céu limpo", 1: "Predominantemente limpo", 2: "Parcialmente nublado", 3: "Nublado",
    45: "Neblina", 48: "Neblina com geada", 51: "Garoa fraca", 53: "Garoa", 55: "Garoa forte",
    61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte", 80: "Pancadas de chuva fracas",
    81: "Pancadas de chuva", 82: "Pancadas de chuva fortes", 95: "Trovoadas",
    96: "Trovoadas com granizo", 99: "Trovoadas fortes com granizo",
}  # fmt: skip

TTL_GEOCODING = 24 * 3600
TTL_CLIMA = 10 * 60


def sigla_uf(admin1: str) -> str:
    """Converte o estado devolvido pela API ('Piauí' ou 'PI') na sigla oficial ('PI'); '' se não achar."""
    texto = (admin1 or "").strip()
    if len(texto) == 2 and texto.upper() in carregar_estados():
        return texto.upper()
    alvo = normalizar(texto)
    for sigla, nome in carregar_estados().items():
        if normalizar(nome) == alvo:
            return sigla
    return ""


def local_fallback(cidade: str, uf: str) -> LocalInfo:
    """Cidade do catálogo, senão a capital do estado: o roteiro continua mesmo sem geocodificação."""
    destino = buscar_destino(cidade, uf)
    if destino:
        lat, lon = destino.lat, destino.lon
    else:
        lat, lon = CAPITAIS.get(uf, (0.0, 0.0))
    return LocalInfo(
        cidade=cidade, uf=uf, nome=f"{cidade} - {uf}", lat=lat, lon=lon, encontrado=False
    )


async def buscar_coordenadas_async(client: httpx.AsyncClient, cidade: str, uf: str) -> LocalInfo:
    """Geocodifica a cidade no Open-Meteo (só Brasil) escolhendo o resultado da UF informada.

    Lança LookupError se a cidade não existir naquela UF (o breaker usa o fallback).
    """
    chave = ("geocoding", normalizar(cidade), uf)
    if (em_cache := cache.obter(chave)) is not None:
        return em_cache

    config = obter_settings()
    resposta = await client.get(
        config.geocoding_url,
        params={"name": cidade, "count": 10, "language": "pt", "countryCode": "BR"},
        timeout=config.http_timeout_segundos,
    )
    resposta.raise_for_status()
    for item in resposta.json().get("results") or []:
        if item.get("country_code", "BR") == "BR" and sigla_uf(item.get("admin1", "")) == uf:
            local = LocalInfo(
                cidade=item.get("name", cidade),
                uf=uf,
                nome=f"{item.get('name', cidade)} - {uf}",
                lat=float(item["latitude"]),
                lon=float(item["longitude"]),
                encontrado=True,
            )
            cache.definir(chave, local, TTL_GEOCODING)
            return local
    raise LookupError(f"{cidade}-{uf} não encontrada no Open-Meteo")


def clima_fallback() -> ClimaInfo:
    return ClimaInfo(disponivel=False)


async def obter_clima_async(client: httpx.AsyncClient, lat: float, lon: float) -> ClimaInfo:
    """Clima atual no destino (temperatura, sensação térmica, umidade, vento e condição)."""
    chave = ("clima", round(lat, 2), round(lon, 2))
    if (em_cache := cache.obter(chave)) is not None:
        return em_cache

    config = obter_settings()
    resposta = await client.get(
        config.clima_url,
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
            "wind_speed_10m,weather_code",
            "timezone": "America/Sao_Paulo",
        },
        timeout=config.http_timeout_segundos,
    )
    resposta.raise_for_status()
    atual = resposta.json()["current"]
    clima = ClimaInfo(
        disponivel=True,
        temperatura_c=atual["temperature_2m"],
        sensacao_c=atual.get("apparent_temperature"),
        umidade_pct=atual.get("relative_humidity_2m"),
        vento_kmh=atual.get("wind_speed_10m"),
        condicao=CONDICOES_WMO.get(int(atual.get("weather_code", -1)), "Tempo variável"),
    )
    cache.definir(chave, clima, TTL_CLIMA)
    return clima
