"""/api/v1/auth: login Google (JWT validado nos servidores OAuth2), visitante com TTL de 2 horas
e encerramento de sessão compatível com fechamento de janela (sendBeacon)."""

import json
import logging
from datetime import UTC, datetime
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import ValidationError

from app.core.dependencies import Config, HttpClient, Sessoes, UsuarioAtivo
from app.schemas.auth import LoginResponse, LogoutRequest, TokenGoogleRequest, UsuarioPerfil
from app.services.storage_service import descartar_visitante

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["Autenticação"])

TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
EMISSORES_GOOGLE = {"accounts.google.com", "https://accounts.google.com"}


async def verificar_token_google(
    client: httpx.AsyncClient, token: str, client_id: str, timeout: float
) -> dict[str, str] | None:
    """Valida o JWT no tokeninfo do Google. Devolve os dados do usuário ou None se for inválido.

    Lança httpx.HTTPError se o Google estiver fora do ar (vira 503, não 401).
    """
    resposta = await client.get(TOKENINFO_URL, params={"id_token": token}, timeout=timeout)
    if resposta.status_code != 200:
        return None
    dados = resposta.json()
    if (
        dados.get("aud") != client_id
        or dados.get("iss") not in EMISSORES_GOOGLE
        or not dados.get("sub")
    ):
        return None
    return dados


@router.post("/google", response_model=LoginResponse, summary="Login com Google (JWT)")
async def login_google(
    payload: TokenGoogleRequest, client: HttpClient, sessoes: Sessoes, config: Config
) -> LoginResponse:
    if not config.google_client_id:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Login com Google não está configurado no servidor.",
        )
    try:
        dados = await verificar_token_google(
            client, payload.credential, config.google_client_id, config.http_timeout_segundos
        )
    except httpx.HTTPError as erro:
        logger.warning("Google tokeninfo indisponível: %s", erro)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível falar com o Google agora. Tente de novo.",
        ) from erro

    if dados is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="Token do Google inválido ou expirado."
        )

    foto = dados.get("picture")
    perfil = UsuarioPerfil(
        user_id=dados["sub"],
        nome=dados.get("name") or dados.get("email") or "Viajante",
        tipo="google",
        email=dados.get("email"),
        foto=foto if foto and foto.startswith("https://") else None,
    )
    await sessoes.registrar(perfil)
    logger.info("Login Google: %s…", perfil.user_id[:4])
    return LoginResponse(usuario=perfil)


@router.post(
    "/visitante", response_model=LoginResponse, summary="Sessão de visitante (TTL de 2 horas)"
)
async def login_visitante(sessoes: Sessoes) -> LoginResponse:
    perfil = UsuarioPerfil(
        user_id=f"visitante-{uuid4().hex}",
        nome="Visitante",
        tipo="visitante",
        expira_em=datetime.now(UTC) + sessoes.ttl_visitante,
    )
    await sessoes.registrar(perfil)
    return LoginResponse(usuario=perfil)


@router.get("/sessao", response_model=LoginResponse, summary="Perfil da sessão ativa (X-User-Id)")
async def sessao_atual(usuario: UsuarioAtivo) -> LoginResponse:
    return LoginResponse(usuario=usuario)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Encerra a sessão (aceita sendBeacon)",
    openapi_extra={
        "requestBody": {
            "content": {"application/json": {"schema": LogoutRequest.model_json_schema()}},
            "required": True,
        }
    },
)
async def logout(request: Request, sessoes: Sessoes) -> Response:
    """Lê o corpo bruto: o navigator.sendBeacon envia o JSON como text/plain,
    porque com application/json o navegador exigiria um preflight de CORS."""
    try:
        payload = LogoutRequest.model_validate(json.loads(await request.body()))
    except (json.JSONDecodeError, UnicodeDecodeError, ValidationError) as erro:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail='Envie {"user_id": "..."}.'
        ) from erro

    await sessoes.encerrar(payload.user_id)
    # Viagens de visitante vivem só em memória e acabam junto com a sessão.
    await descartar_visitante(payload.user_id)
    # 204 mesmo se a sessão já tinha acabado: encerrar é idempotente.
    return Response(status_code=status.HTTP_204_NO_CONTENT)
