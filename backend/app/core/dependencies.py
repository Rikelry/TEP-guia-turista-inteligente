"""Injeção de dependências do FastAPI: pool HTTP compartilhado, sessões e usuário ativo."""

from typing import Annotated

import httpx
from fastapi import Depends, Header, HTTPException, Request, status

from app.core.config import Settings, obter_settings
from app.schemas.auth import UsuarioPerfil
from app.services.sessao_service import RegistroSessoes


def obter_http_client(request: Request) -> httpx.AsyncClient:
    """Cliente httpx criado no lifespan: reaproveita conexões TCP/TLS (keep-alive)."""
    return request.app.state.http_client


def obter_sessoes(request: Request) -> RegistroSessoes:
    return request.app.state.sessoes


async def obter_usuario_ativo(
    sessoes: Annotated[RegistroSessoes, Depends(obter_sessoes)],
    x_user_id: Annotated[str | None, Header()] = None,
) -> UsuarioPerfil:
    """Usuário identificado pelo header X-User-Id. 401 se ausente, desconhecido ou expirado."""
    if not x_user_id:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="Entre com o Google ou como visitante."
        )
    perfil = await sessoes.obter(x_user_id)
    if perfil is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada ou inexistente. Entre novamente."
        )
    return perfil


HttpClient = Annotated[httpx.AsyncClient, Depends(obter_http_client)]
Sessoes = Annotated[RegistroSessoes, Depends(obter_sessoes)]
UsuarioAtivo = Annotated[UsuarioPerfil, Depends(obter_usuario_ativo)]
Config = Annotated[Settings, Depends(obter_settings)]
