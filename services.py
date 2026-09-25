# Serviços de integração com APIs externas (Google OAuth, Open-Meteo e OSRM)

from typing import Any

import httpx

from config import ESTADOS_BRASIL, GOOGLE_CLIENT_ID

# ==============================================================================
# 👤 RESPONSABILIDADE DO ALUNO 1: APIs REST, Autenticação JWT e Geocodificação
# ==============================================================================


def verificar_token_google(client: httpx.Client, token: str) -> dict[str, Any] | None:
    """Valida o token JWT no endpoint oficial 'https://oauth2.googleapis.com/tokeninfo'.

    Verifica se o token foi emitido para o GOOGLE_CLIENT_ID configurado no projeto
    e retorna o payload do usuário (sub, name, email, picture) ou None se for inválido.
    """
    try:
        resposta = client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": token},
            timeout=4.0,
        )
        if resposta.status_code != 200:
            return None

        dados = resposta.json()

        if dados.get("aud") != GOOGLE_CLIENT_ID:
            return None

        return {
            "sub": dados.get("sub"),
            "name": dados.get("name"),
            "email": dados.get("email"),
            "picture": dados.get("picture"),
        }
    except httpx.HTTPError:
        return None


def obter_sigla_uf(admin1: str, uf_informada: str = "") -> str:
    """Converte o estado retornado pela API (admin1) para a sigla oficial de 2 letras (ex: 'PI').

    Caso a API retorne um nome completo (ex: 'Piauí'), normaliza para 'PI'.
    """
    if not admin1:
        return uf_informada.upper() if uf_informada else ""

    # Se já vier como sigla de 2 letras, retorna direto
    if len(admin1.strip()) == 2:
        return admin1.strip().upper()

    admin1_normalizado = admin1.strip().lower()

    # Busca no catálogo de estados (ESTADOS_BRASIL vindo do config.py)
    for estado in ESTADOS_BRASIL:
        # Cobre tanto formato de dict {"sigla": "PI", "nome": "Piauí"}
        # quanto dict simples {"PI": "Piauí"}
        if isinstance(estado, dict):
            nome = estado.get("nome", "")
            sigla = estado.get("sigla", "")
            if nome.lower() == admin1_normalizado:
                return sigla.upper()

    if isinstance(ESTADOS_BRASIL, dict):
        for sigla, nome in ESTADOS_BRASIL.items():
            if str(nome).lower() == admin1_normalizado:
                return str(sigla).upper()

    # Fallback: usa a UF informada pelo usuário se não achou correspondência
    if uf_informada:
        return uf_informada.upper()

    return ""


def buscar_coordenadas(
    client: httpx.Client, cidade: str, uf: str = ""
) -> tuple[float, float, str]:
    """Consulta o Open-Meteo Geocoding com filtro Brasil (country_codes=BR) e timeout=4.0s.

    Retorna a tupla (latitude, longitude, uf_oficial_detectada). Caso a busca falhe,
    aplica fallback para as coordenadas aproximadas da capital da UF informada.
    """
    try:
        resposta = client.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={
                "name": cidade,
                "count": 5,
                "language": "pt",
                "country_codes": "BR",
            },
            timeout=4.0,
        )
        resposta.raise_for_status()
        dados = resposta.json()

        resultados = dados.get("results")
        if not resultados:
            return _fallback_coordenadas(uf)

        primeiro = resultados[0]
        latitude = primeiro.get("latitude", 0.0)
        longitude = primeiro.get("longitude", 0.0)
        admin1 = primeiro.get("admin1", "")

        uf_detectada = obter_sigla_uf(admin1, uf)

        return (latitude, longitude, uf_detectada)

    except (httpx.HTTPError, KeyError, IndexError):
        return _fallback_coordenadas(uf)


def _fallback_coordenadas(uf: str) -> tuple[float, float, str]:
    """Fallback com coordenadas aproximadas das capitais dos estados brasileiros."""
    capitais = {
        "AC": (-9.975, -67.824), "AL": (-9.649, -35.708), "AP": (0.034, -51.070),
        "AM": (-3.119, -60.021), "BA": (-12.977, -38.501), "CE": (-3.717, -38.543),
        "DF": (-15.779, -47.929), "ES": (-20.315, -40.312), "GO": (-16.686, -49.264),
        "MA": (-2.530, -44.306), "MT": (-15.601, -56.097), "MS": (-20.469, -54.620),
        "MG": (-19.917, -43.935), "PA": (-1.456, -48.490), "PB": (-7.115, -34.861),
        "PR": (-25.429, -49.271), "PE": (-8.048, -34.877), "PI": (-5.089, -42.801),
        "RJ": (-22.907, -43.173), "RN": (-5.795, -35.209), "RS": (-30.034, -51.218),
        "RO": (-8.762, -63.904), "RR": (2.820, -60.673), "SC": (-27.596, -48.549),
        "SP": (-23.550, -46.633), "SE": (-10.911, -37.073), "TO": (-10.184, -48.334),
    }
    lat, lon = capitais.get(uf.upper(), (0.0, 0.0))
    return (lat, lon, uf.upper())


# ==============================================================================
# 👤 RESPONSABILIDADE DO ALUNO 2: Telemetria Climática e Roteamento Rodoviário
# ==============================================================================


def obter_clima(client: httpx.Client, lat: float, lon: float) -> dict[str, str]:
    """Consulta o Open-Meteo Forecast e retorna temperatura (°C), umidade (%) e vento (km/h).

    Caso coordenadas sejam inválidas (0.0, 0.0) ou ocorra timeout (4.0s),
    retorna dicionário de contingência com valores 'N/D'.
    """
    if lat == 0.0 and lon == 0.0:
        return _fallback_clima()

    try:
        resposta = client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,wind_speed_10m",
            },
            timeout=4.0,
        )
        resposta.raise_for_status()
        dados = resposta.json()

        atual = dados.get("current")
        if not atual:
            return _fallback_clima()

        temperatura = atual.get("temperature_2m")
        umidade = atual.get("relative_humidity_2m")
        vento = atual.get("wind_speed_10m")

        if temperatura is None or umidade is None or vento is None:
            return _fallback_clima()

        return {
            "temperatura": f"{temperatura} °C",
            "umidade": f"{umidade}%",
            "vento": f"{vento} km/h",
        }

    except (httpx.HTTPError, KeyError):
        return _fallback_clima()


def _fallback_clima() -> dict[str, str]:
    """Fallback de contingência quando o clima não pode ser consultado."""
    return {"temperatura": "N/D", "umidade": "N/D", "vento": "N/D"}


def obter_percurso(
    client: httpx.Client, lat_o: float, lon_o: float, lat_d: float, lon_d: float
) -> dict[str, str]:
    """Consulta o OSRM e calcula distância em km e duração de viagem de carro.

    Em caso de trajetos sem estradas (ex: ilhas) ou timeout (6.0s),
    retorna dicionário com fallback descritivo ('Sem rota direta' / 'Considere voos ou barcos').
    """
    try:
        resposta = client.get(
            f"https://router.project-osrm.org/route/v1/driving/"
            f"{lon_o},{lat_o};{lon_d},{lat_d}",
            params={"overview": "false"},
            timeout=6.0,
        )
        resposta.raise_for_status()
        dados = resposta.json()

        if dados.get("code") != "Ok":
            return _fallback_percurso()

        rotas = dados.get("routes")
        waypoints = dados.get("waypoints")
        if not rotas or not waypoints:
            return _fallback_percurso()

        # Sem estrada real ligando os pontos (ex: ilhas), o OSRM "arrasta" a
        # coordenada para a via mais próxima, ainda que a decenas de km de
        # distância. Snap acima de 2km indica que não há rota rodoviária real.
        if any(ponto.get("distance", 0.0) > 2000 for ponto in waypoints):
            return _fallback_percurso()

        rota = rotas[0]
        distancia_km = round(rota.get("distance", 0.0) / 1000, 1)
        duracao_min = round(rota.get("duration", 0.0) / 60)
        horas, minutos = divmod(int(duracao_min), 60)

        return {
            "distancia": f"{distancia_km} km",
            "tempo": f"{horas}h {minutos}min de carro",
            "modal": "carro",
        }

    except (httpx.HTTPError, KeyError, IndexError):
        return _fallback_percurso()


def _fallback_percurso() -> dict[str, str]:
    """Fallback descritivo para trajetos sem estrada (ex: ilhas) ou falha na consulta ao OSRM."""
    return {
        "distancia": "Sem rota direta",
        "tempo": "Considere voos ou barcos",
        "modal": "indisponível",
    }
