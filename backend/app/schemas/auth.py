"""Contratos Pydantic v2 de autenticação. Espelham frontend/src/types/schemas.ts."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

TipoUsuario = Literal["google", "visitante"]

UserId = Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$")]


class TokenGoogleRequest(BaseModel):
    """Corpo de POST /api/v1/auth/google: o JWT entregue pelo Google Identity Services."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    credential: Annotated[str, Field(min_length=20, max_length=4096)]


class UsuarioPerfil(BaseModel):
    """Perfil devolvido à SPA. `expira_em` só existe para visitante."""

    user_id: UserId
    nome: str
    tipo: TipoUsuario
    email: str | None = None
    foto: str | None = None
    expira_em: datetime | None = None


class LoginResponse(BaseModel):
    usuario: UsuarioPerfil


class LogoutRequest(BaseModel):
    """Corpo de POST /api/v1/auth/logout. Chega como JSON ou como text/plain (sendBeacon)."""

    model_config = ConfigDict(extra="ignore")

    user_id: UserId
