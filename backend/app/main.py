"""Instância FastAPI: lifespan (pool httpx e sessões), CORS, Correlation-ID,
X-Process-Time e probes de saúde."""

import logging
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import timedelta

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import obter_settings
from app.core.logging_config import configurar_logging, request_id_atual
from app.core.metricas import metricas
from app.routers import auth, roteiros, telemetria
from app.services.sessao_service import RegistroSessoes

logger = logging.getLogger(__name__)

HEADER_REQUEST_ID = "X-Request-ID"
HEADER_PROCESS_TIME = "X-Process-Time"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Cria recursos compartilhados uma vez na subida e os fecha no desligamento."""
    configurar_logging()
    config = obter_settings()
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(config.http_timeout_segundos),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        headers={"User-Agent": f"GuiaTurista/{config.app_versao}"},
    )
    app.state.sessoes = RegistroSessoes(ttl_visitante=timedelta(hours=config.visitante_ttl_horas))
    logger.info("API no ar. CORS liberado para: %s", ", ".join(config.cors_origins))
    try:
        yield
    finally:
        await app.state.http_client.aclose()


def criar_app() -> FastAPI:
    config = obter_settings()
    app = FastAPI(
        title=config.app_nome,
        version=config.app_versao,
        description="API REST do Guia do Turista Inteligente (FastAPI/ASGI).",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # Sem isto o navegador esconde os headers de telemetria da SPA em outra porta.
        expose_headers=[HEADER_PROCESS_TIME, HEADER_REQUEST_ID],
    )

    @app.middleware("http")
    async def telemetria_requisicao(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Propaga o Correlation-ID e mede o tempo de processamento com time.perf_counter()."""
        recebido = request.headers.get(HEADER_REQUEST_ID, "")
        request_id = (
            recebido if 0 < len(recebido) <= 64 and recebido.isascii() else uuid.uuid4().hex
        )
        token = request_id_atual.set(request_id)
        metricas.entrar()
        inicio = time.perf_counter()
        status_code = 500
        try:
            resposta = await call_next(request)
            status_code = resposta.status_code
        finally:
            duracao_ms = (time.perf_counter() - inicio) * 1000
            # Agrupa pela rota declarada (/api/v1/roteiros/{roteiro_id}), não pelo id concreto.
            rota = getattr(request.scope.get("route"), "path", "nao_encontrada")
            metricas.sair(rota, status_code, duracao_ms)
            request_id_atual.reset(token)
        resposta.headers[HEADER_PROCESS_TIME] = f"{duracao_ms:.2f}"
        resposta.headers[HEADER_REQUEST_ID] = request_id
        return resposta

    app.include_router(auth.router)
    app.include_router(roteiros.router)
    app.include_router(telemetria.router)
    app.include_router(telemetria.router_metrics)

    @app.get("/healthz", tags=["Probes"], summary="Liveness: o processo está respondendo")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz", tags=["Probes"], summary="Readiness: recursos do lifespan prontos")
    async def readyz(request: Request, response: Response) -> dict[str, object]:
        cliente: httpx.AsyncClient | None = getattr(request.app.state, "http_client", None)
        pronto = cliente is not None and not cliente.is_closed
        if not pronto:
            response.status_code = 503
        sessoes = await request.app.state.sessoes.contar() if pronto else {}
        return {
            "status": "pronto" if pronto else "indisponivel",
            "google_login": bool(config.google_client_id),
            "gemini": bool(config.gemini_api_key),
            "sessoes_ativas": sessoes,
        }

    return app


app = criar_app()
