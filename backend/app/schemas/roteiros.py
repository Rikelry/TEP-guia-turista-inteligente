"""Contratos Pydantic v2 estritos dos roteiros.

A validação roda no pydantic-core (Rust): entrada fora destes limites vira HTTP 422
Unprocessable Entity antes de chegar ao endpoint, sem código manual de checagem.
"""

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config import carregar_estados

EstiloViagem = Literal["cultural", "gastronomico", "ecoturismo", "familia", "romantico"]
PreferenciaRota = Literal["rapida", "economica"]

Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]

_PADRAO_CIDADE = re.compile(r"^[^\W\d_][^\W\d_\s.'-]*(?:[\s.'-]+[^\W\d_]+)*\.?$")


def sanitizar_cidade(valor: str) -> str:
    """Remove tags HTML e caracteres de controle e junta espaços. Recusa números e símbolos."""
    texto = re.sub(r"<[^>]*>", "", valor)
    texto = re.sub(r"[\x00-\x1f\x7f]", "", texto)
    texto = re.sub(r"\s+", " ", texto).strip()
    if not 2 <= len(texto) <= 80:
        raise ValueError("a cidade deve ter de 2 a 80 caracteres")
    if not _PADRAO_CIDADE.match(texto):
        raise ValueError("use só letras, espaços, hífen e apóstrofo no nome da cidade")
    return texto


def validar_uf(valor: str) -> str:
    sigla = valor.strip().upper()
    if sigla not in carregar_estados():
        raise ValueError(f"'{valor}' não é uma UF brasileira; use a sigla de 2 letras, como PI")
    return sigla


class _Estrito(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---------------------------------------------------------------------------
# Veículo
# ---------------------------------------------------------------------------


class VeiculoCombustao(_Estrito):
    propulsao: Literal["combustao"] = "combustao"
    consumo_km_l: Annotated[float, Field(gt=0, le=50, description="Consumo médio (km/l)")] = 12.0
    tanque_litros: Annotated[float, Field(gt=0, le=200)] = 50.0
    preco_litro: Annotated[float, Field(gt=0, le=20)] = 6.20


class VeiculoEletrico(_Estrito):
    propulsao: Literal["eletrico"] = "eletrico"
    eficiencia_km_kwh: Annotated[float, Field(gt=0, le=15, description="Eficiência (km/kWh)")] = 6.5
    bateria_kwh: Annotated[float, Field(gt=0, le=250)] = 60.0
    preco_kwh: Annotated[float, Field(ge=0, le=10)] = 1.20


Veiculo = Annotated[VeiculoCombustao | VeiculoEletrico, Field(discriminator="propulsao")]


# ---------------------------------------------------------------------------
# Pedidos
# ---------------------------------------------------------------------------


class RoteiroRequest(_Estrito):
    """Corpo de POST /api/v1/roteiros/planejar."""

    origem_cidade: str
    origem_uf: str
    destino_cidade: str
    destino_uf: str
    dias_estadia: Annotated[int, Field(ge=1, le=5)] = 3
    estilo_viagem: EstiloViagem = "cultural"
    preferencia_rota: PreferenciaRota = "rapida"
    passageiros: Annotated[int, Field(ge=1, le=8)] = 1
    veiculo: Veiculo = Field(default_factory=VeiculoCombustao)

    @field_validator("origem_cidade", "destino_cidade")
    @classmethod
    def checar_cidade(cls, valor: str) -> str:
        return sanitizar_cidade(valor)

    @field_validator("origem_uf", "destino_uf")
    @classmethod
    def checar_uf(cls, valor: str) -> str:
        return validar_uf(valor)


class Coordenada(_Estrito):
    lat: Latitude
    lon: Longitude


class MapaRotaRequest(_Estrito):
    """Corpo de POST /api/v1/roteiros/mapa-rota."""

    origem: Coordenada
    destino: Coordenada
    origem_uf: str
    destino_uf: str
    veiculo: Veiculo = Field(default_factory=VeiculoCombustao)
    passageiros: Annotated[int, Field(ge=1, le=8)] = 1
    alternativas: bool = True

    @field_validator("origem_uf", "destino_uf")
    @classmethod
    def checar_uf(cls, valor: str) -> str:
        return validar_uf(valor)


class CustosRequest(_Estrito):
    """Corpo de POST /api/v1/roteiros/custos."""

    distancia_km: Annotated[float, Field(gt=0, le=10000)]
    origem_uf: str
    destino_uf: str
    veiculo: Veiculo = Field(default_factory=VeiculoCombustao)
    passageiros: Annotated[int, Field(ge=1, le=8)] = 1
    penalizacao_pct: Annotated[float, Field(ge=-30, le=50)] = 0.0

    @field_validator("origem_uf", "destino_uf")
    @classmethod
    def checar_uf(cls, valor: str) -> str:
        return validar_uf(valor)


class ClimaInfo(BaseModel):
    disponivel: bool
    temperatura_c: float | None = None
    sensacao_c: float | None = None
    umidade_pct: float | None = None
    vento_kmh: float | None = None
    condicao: str = "Indisponível"


class GuiaStreamRequest(_Estrito):
    """Corpo de POST /api/v1/roteiros/stream-guia."""

    destino: Annotated[str, Field(min_length=2, max_length=120)]
    dias_estadia: Annotated[int, Field(ge=1, le=5)] = 3
    estilo_viagem: EstiloViagem = "cultural"
    clima_info: ClimaInfo | None = None
    atrativos: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=10)] = []
    gastronomia: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=10)] = []


class VisitaUpdate(_Estrito):
    """Corpo de PATCH /api/v1/roteiros/{roteiro_id}/visitas."""

    atrativo_id: Annotated[str, Field(min_length=1, max_length=120)]
    visitado: bool


class CompartilharRequest(_Estrito):
    canal: Literal["whatsapp", "email"] = "whatsapp"
    destinatario: Annotated[str, Field(max_length=120)] | None = None


class GpxRequest(_Estrito):
    roteiro_id: Annotated[str, Field(min_length=1, max_length=64)]


# ---------------------------------------------------------------------------
# Respostas
# ---------------------------------------------------------------------------


class LocalInfo(BaseModel):
    cidade: str
    uf: str
    nome: str
    lat: float
    lon: float
    encontrado: bool


class RotaInfo(BaseModel):
    disponivel: bool
    distancia_km: float | None = None
    duracao_min: float | None = None
    resumo: str
    # Pontos [lat, lon] do traçado (já reduzidos para o mapa).
    geometria: list[tuple[float, float]] = []


class AltimetriaInfo(BaseModel):
    disponivel: bool
    ganho_m: float = 0.0
    perda_m: float = 0.0
    altitude_max_m: float | None = None
    altitude_min_m: float | None = None
    desnivel_liquido_m: float = 0.0
    penalizacao_pct: float = 0.0
    perfil: list[float] = []


class Parada(BaseModel):
    ordem: int
    tipo: Literal["posto", "eletroposto"]
    km: float
    lat: float
    lon: float
    nivel_chegada_pct: float


class AutonomiaInfo(BaseModel):
    autonomia_nominal_km: float
    autonomia_ajustada_km: float
    reserva_pct: float
    paradas: list[Parada]


class CustosInfo(BaseModel):
    propulsao: Literal["combustao", "eletrico"]
    quantidade_energia: float
    unidade: Literal["litros", "kWh"]
    custo_energia: float
    custo_pedagio: float
    custo_total: float
    passageiros: int
    por_passageiro: float
    emissoes_kg_co2: float
    observacao: str


class RotaAlternativa(BaseModel):
    indice: int
    rotulo: str
    rota: RotaInfo
    altimetria: AltimetriaInfo
    autonomia: AutonomiaInfo
    custos: CustosInfo


class MapaRotaResponse(BaseModel):
    rotas: list[RotaAlternativa]


class AtrativoItem(BaseModel):
    id: str
    nome: str
    descricao: str
    tipo: Literal["atrativo", "gastronomia"]
    visitado: bool = False


class ProvedorTelemetria(BaseModel):
    tempo_ms: float
    fallback: bool


class RoteiroResponse(BaseModel):
    id: str
    criado_em: datetime
    origem: LocalInfo
    destino: LocalInfo
    dias_estadia: int
    estilo_viagem: EstiloViagem
    clima: ClimaInfo
    rota: RotaInfo
    guia: str
    guia_fallback: bool
    atrativos: list[AtrativoItem]
    provedores: dict[str, ProvedorTelemetria]
