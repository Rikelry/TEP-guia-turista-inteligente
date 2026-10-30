"""Configurações do servidor com Pydantic-Settings: variáveis de ambiente, .env e CORS."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "static" / "data"
ESTADOS_FILE = DATA_DIR / "estados_brasil.json"


class Settings(BaseSettings):
    """Valores lidos do ambiente (ou do arquivo .env). Os nomes são case-insensitive."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_nome: str = "Guia do Turista Inteligente API"
    app_versao: str = "2.0.0"

    # Client ID OAuth do Google Identity Services. Vazio desliga o login com Google (HTTP 503).
    google_client_id: str = ""
    gemini_api_key: str = ""
    gemini_modelo: str = "gemini-3.6-flash"

    # Origens da SPA liberadas no CORS. No .env: CORS_ORIGINS=http://localhost:5173,http://localhost:3000
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:3000"]
    )

    visitante_ttl_horas: float = Field(default=2.0, gt=0, le=24)

    # Provedores externos
    geocoding_url: str = "https://geocoding-api.open-meteo.com/v1/search"
    clima_url: str = "https://api.open-meteo.com/v1/forecast"
    osrm_url: str = "https://router.project-osrm.org/route/v1/driving"
    elevacao_url: str = "https://api.open-elevation.com/api/v1/lookup"

    # Timeouts por provedor (segundos)
    http_timeout_segundos: float = Field(default=4.0, gt=0, le=30)
    rota_timeout_segundos: float = Field(default=6.0, gt=0, le=30)
    gemini_timeout_segundos: float = Field(default=6.0, gt=0, le=60)

    # Circuit breaker: falhas seguidas até abrir e segundos até tentar de novo
    breaker_limite_falhas: int = Field(default=3, ge=1, le=20)
    breaker_tempo_reset_segundos: float = Field(default=30.0, gt=0, le=600)

    # Persistência das viagens de usuários Google (visitantes ficam só em memória)
    viagens_arquivo: Path = DATA_DIR / "viagens.json"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def separar_origens(cls, valor: object) -> object:
        """Aceita a lista em texto separado por vírgulas, como vem do .env."""
        if isinstance(valor, str):
            return [origem.strip().rstrip("/") for origem in valor.split(",") if origem.strip()]
        return valor

    @field_validator("google_client_id", "gemini_api_key")
    @classmethod
    def remover_espacos(cls, valor: str) -> str:
        return valor.strip()


@lru_cache
def obter_settings() -> Settings:
    """Instância única das configurações (lida uma vez por processo)."""
    return Settings()


@lru_cache
def carregar_estados() -> dict[str, str]:
    """As 27 UFs do Brasil ({"PI": "Piauí", ...}) lidas de static/data/estados_brasil.json."""
    with ESTADOS_FILE.open(encoding="utf-8") as arquivo:
        return json.load(arquivo)
