"""Fixtures do pytest: TestClient, ambiente isolado e provedores externos simulados (sem internet)."""

import math
from collections.abc import Callable, Iterator
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.cache import cache
from app.core.circuit_breaker import resetar_breakers
from app.core.config import obter_settings
from app.core.dependencies import obter_http_client
from app.core.metricas import metricas
from app.main import criar_app
from app.routers import roteiros
from app.services import storage_service

CLIENT_ID_TESTE = "cliente-teste.apps.googleusercontent.com"

TOKENS_GOOGLE = {
    "token-valido": {
        "aud": CLIENT_ID_TESTE,
        "iss": "https://accounts.google.com",
        "sub": "109876543214321",
        "name": "Ana Souza",
        "email": "ana@exemplo.com",
        "picture": "https://lh3.googleusercontent.com/a/foto",
    },
    "token-outro-app": {
        "aud": "outro-app.apps.googleusercontent.com",
        "iss": "https://accounts.google.com",
        "sub": "1",
        "name": "Intruso",
    },
}

# Cidades que o geocoding simulado conhece: nome → (estado como a API devolve, lat, lon)
CIDADES = {
    "Teresina": ("Piauí", -5.089, -42.802),
    "Piripiri": ("Piauí", -4.272, -41.777),
    "Parnaíba": ("Piauí", -2.905, -41.776),
    "Jijoca de Jericoacoara": ("Ceará", -2.796, -40.512),
    "Fortaleza": ("Ceará", -3.717, -38.543),
    "Fernando de Noronha": ("Pernambuco", -3.854, -32.424),
}


def _distancia_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    )
    return 2 * 6371 * math.asin(math.sqrt(a))


def _rota_osrm(request: httpx.Request) -> httpx.Response:
    trecho = request.url.path.rsplit("/", 1)[-1]
    (lon_o, lat_o), (lon_d, lat_d) = (map(float, p.split(",")) for p in trecho.split(";"))
    # Fernando de Noronha não tem estrada: o OSRM "arrasta" o ponto por centenas de km.
    if lon_o > -33 or lon_d > -33:
        return httpx.Response(200, json={"code": "Ok", "routes": [{"distance": 9e5, "duration": 4e4, "geometry": {"coordinates": [[lon_o, lat_o], [lon_d, lat_d]]}}], "waypoints": [{"distance": 360000.0}, {"distance": 10.0}]})  # fmt: skip

    def rota(desvio: float, fator: float) -> dict:
        pontos = []
        for i in range(41):
            t = i / 40
            pontos.append(
                [
                    lon_o + (lon_d - lon_o) * t + desvio * math.sin(math.pi * t),
                    lat_o + (lat_d - lat_o) * t,
                ]
            )
        km = _distancia_km(lat_o, lon_o, lat_d, lon_d) * fator
        return {
            "distance": km * 1000,
            "duration": km / 80 * 3600,
            "geometry": {"coordinates": pontos},
        }

    rotas = [rota(0.0, 1.25)]
    if request.url.params.get("alternatives") == "true":
        rotas.append(rota(0.3, 1.18))  # mais lenta porém mais curta
        rotas[1]["duration"] = rotas[0]["duration"] * 1.15
    return httpx.Response(
        200,
        json={"code": "Ok", "routes": rotas, "waypoints": [{"distance": 12.0}, {"distance": 20.0}]},
    )


def provedores_simulados(request: httpx.Request) -> httpx.Response:
    host = request.url.host
    if host == "oauth2.googleapis.com":
        dados = TOKENS_GOOGLE.get(request.url.params.get("id_token", ""))
        return (
            httpx.Response(200, json=dados)
            if dados
            else httpx.Response(400, json={"error": "invalid_token"})
        )
    if host == "geocoding-api.open-meteo.com":
        nome = request.url.params.get("name", "")
        if nome in CIDADES:
            estado, lat, lon = CIDADES[nome]
            resultado = {
                "name": nome,
                "latitude": lat,
                "longitude": lon,
                "admin1": estado,
                "country_code": "BR",
            }
            return httpx.Response(200, json={"results": [resultado]})
        return httpx.Response(200, json={"generationtime_ms": 0.1})
    if host == "api.open-meteo.com":
        atual = {"temperature_2m": 31.4, "apparent_temperature": 34.0, "relative_humidity_2m": 55,
                 "wind_speed_10m": 14.2, "weather_code": 1}  # fmt: skip
        return httpx.Response(200, json={"current": atual})
    if host == "router.project-osrm.org":
        return _rota_osrm(request)
    if host == "api.open-elevation.com":
        locais = __import__("json").loads(request.content)["locations"]
        n = len(locais)
        # Serra no meio do caminho: sobe até ~800 m e desce.
        return httpx.Response(200, json={"results": [{"elevation": 70 + 700 * math.sin(math.pi * i / (n - 1))} for i in range(n)]})  # fmt: skip
    return httpx.Response(404)


@pytest.fixture(autouse=True)
def ambiente_isolado(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[None]:
    """Cada teste roda sem ler o .env real, com estado limpo e o JSON numa pasta temporária."""
    monkeypatch.chdir(tmp_path)
    for var in ("GOOGLE_CLIENT_ID", "GEMINI_API_KEY", "CORS_ORIGINS", "VISITANTE_TTL_HORAS"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CLIENT_ID_TESTE)
    monkeypatch.setenv("VIAGENS_ARQUIVO", str(tmp_path / "viagens.json"))
    obter_settings.cache_clear()
    cache.limpar()
    resetar_breakers()
    metricas.resetar()
    storage_service.limpar_memoria_visitantes()
    roteiros.REQUISICOES_ATIVAS.clear()
    yield
    obter_settings.cache_clear()


@pytest.fixture
def transporte_http() -> Callable[[httpx.Request], httpx.Response]:
    """Handler das chamadas externas. Um teste pode trocá-lo (ex.: Google fora do ar)."""
    return provedores_simulados


@pytest.fixture
def client(transporte_http: Callable[[httpx.Request], httpx.Response]) -> Iterator[TestClient]:
    app = criar_app()
    falso = httpx.AsyncClient(transport=httpx.MockTransport(transporte_http))
    app.dependency_overrides[obter_http_client] = lambda: falso
    with TestClient(app) as c:
        yield c


@pytest.fixture
def token_longo(monkeypatch: pytest.MonkeyPatch) -> str:
    """Token simulado com tamanho de JWT real (o schema exige no mínimo 20 caracteres)."""
    token = "token-valido-" + "x" * 40
    monkeypatch.setitem(TOKENS_GOOGLE, token, TOKENS_GOOGLE["token-valido"])
    return token


@pytest.fixture
def visitante(client: TestClient) -> dict[str, str]:
    """Headers de uma sessão de visitante recém-criada."""
    uid = client.post("/api/v1/auth/visitante").json()["usuario"]["user_id"]
    return {"X-User-Id": uid}


@pytest.fixture
def usuario_google(client: TestClient, token_longo: str) -> dict[str, str]:
    """Headers de uma sessão Google (viagens vão para o JSON)."""
    uid = client.post("/api/v1/auth/google", json={"credential": token_longo}).json()["usuario"][
        "user_id"
    ]
    return {"X-User-Id": uid}


ROTEIRO_PADRAO = {
    "origem_cidade": "Teresina",
    "origem_uf": "PI",
    "destino_cidade": "Jijoca de Jericoacoara",
    "destino_uf": "CE",
    "dias_estadia": 2,
    "estilo_viagem": "ecoturismo",
    "passageiros": 4,
}
