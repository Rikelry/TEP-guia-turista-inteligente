"""/api/v1/telemetria: métricas operacionais, status dos Circuit Breakers, auditoria em segundo
plano e exportador Prometheus (/metrics)."""

import asyncio
import logging
from collections import deque
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, BackgroundTasks, Query, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from app.core.cache import cache
from app.core.circuit_breaker import EstadoCircuito, todos_breakers
from app.core.dependencies import Sessoes
from app.core.metricas import metricas
from app.services.storage_service import contar_roteiros

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/telemetria", tags=["Telemetria"])
router_metrics = APIRouter(tags=["Telemetria"])

# Últimos eventos de auditoria recebidos (só em memória, para consulta rápida).
AUDITORIA: deque[dict[str, Any]] = deque(maxlen=200)


class EventoAuditoria(BaseModel):
    acao: Annotated[str, Field(min_length=1, max_length=60)]
    detalhes: dict[str, str | int | float | bool | None] = {}
    origem: Literal["spa", "backend", "teste"] = "spa"


@router.get("", summary="Painel de métricas da API")
async def telemetria(sessoes: Sessoes) -> dict[str, Any]:
    breakers = [b.status() for b in todos_breakers()]
    return {
        **metricas.snapshot(),
        "total_roteiros_salvos": await contar_roteiros(),
        "sessoes_ativas": await sessoes.contar(),
        "provedores_ativos": sum(b["estado"] != EstadoCircuito.ABERTO for b in breakers),
        "provedores_total": len(breakers),
        "circuit_breakers": breakers,
        "cache": {"itens": len(cache), "acertos": cache.acertos, "falhas": cache.falhas},
    }


@router.get("/circuit-breakers", summary="Estado de cada disjuntor de provedor")
async def circuit_breakers() -> list[dict[str, Any]]:
    return [b.status() for b in todos_breakers()]


async def registrar_auditoria(evento: EventoAuditoria) -> None:
    """Executada pelo BackgroundTasks depois da resposta 202."""
    await asyncio.sleep(0)
    registro = {**evento.model_dump(), "recebido_em": datetime.now(UTC).isoformat()}
    AUDITORIA.append(registro)
    logger.info("Auditoria: %s %s", evento.acao, evento.detalhes)


@router.post(
    "/auditoria",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Despacho de auditoria em segundo plano",
)
async def auditoria(evento: EventoAuditoria, background_tasks: BackgroundTasks) -> dict[str, str]:
    background_tasks.add_task(registrar_auditoria, evento)
    return {"status": "agendado"}


@router.get("/auditoria", summary="Últimos eventos de auditoria")
async def listar_auditoria(
    limite: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[dict[str, Any]]:
    return list(AUDITORIA)[-limite:]


def _linha(nome: str, valor: float, rotulos: dict[str, str] | None = None) -> str:
    if rotulos:
        texto = ",".join(f'{k}="{v}"' for k, v in rotulos.items())
        return f"{nome}{{{texto}}} {valor}"
    return f"{nome} {valor}"


@router_metrics.get(
    "/metrics", response_class=PlainTextResponse, summary="Métricas no formato Prometheus"
)
async def metrics_prometheus(sessoes: Sessoes) -> PlainTextResponse:
    """Formato de exposição de texto do Prometheus (OpenMetrics simples)."""
    s = metricas.snapshot()
    linhas = [
        "# HELP guia_requisicoes_total Requisições HTTP atendidas.",
        "# TYPE guia_requisicoes_total counter",
        *[_linha("guia_requisicoes_total", v, {"status": k}) for k, v in s["por_status"].items()],
        "# HELP guia_roteiros_gerados_total Roteiros planejados desde a subida.",
        "# TYPE guia_roteiros_gerados_total counter",
        _linha("guia_roteiros_gerados_total", s["roteiros_gerados"]),
        "# HELP guia_latencia_media_ms Latência média das requisições (ms).",
        "# TYPE guia_latencia_media_ms gauge",
        _linha("guia_latencia_media_ms", s["latencia_media_ms"] or 0),
        "# HELP guia_conexoes_ativas Requisições em andamento.",
        "# TYPE guia_conexoes_ativas gauge",
        _linha("guia_conexoes_ativas", s["conexoes_ativas"]),
        "# HELP guia_circuit_breaker_aberto 1 se o provedor está com o circuito aberto.",
        "# TYPE guia_circuit_breaker_aberto gauge",
        *[
            _linha(
                "guia_circuit_breaker_aberto",
                int(b.estado is EstadoCircuito.ABERTO),
                {"provedor": b.nome},
            )
            for b in todos_breakers()
        ],
        "# HELP guia_sessoes_ativas Sessões ativas por tipo.",
        "# TYPE guia_sessoes_ativas gauge",
        *[
            _linha("guia_sessoes_ativas", v, {"tipo": k})
            for k, v in (await sessoes.contar()).items()
        ],
    ]
    return PlainTextResponse("\n".join(linhas) + "\n", media_type="text/plain; version=0.0.4")
