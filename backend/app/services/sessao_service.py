"""Registro em memória das sessões ativas (Google e visitante), seguro para acesso concorrente.

Sessões de visitante são voláteis por definição: expiram após o TTL (2 horas) e somem quando
o servidor reinicia. Sessões Google não expiram aqui; o JWT já foi validado no login.
"""

import asyncio
from datetime import UTC, datetime, timedelta

from app.schemas.auth import UsuarioPerfil


class RegistroSessoes:
    def __init__(self, ttl_visitante: timedelta) -> None:
        self._ttl_visitante = ttl_visitante
        self._sessoes: dict[str, UsuarioPerfil] = {}
        self._lock = asyncio.Lock()

    @property
    def ttl_visitante(self) -> timedelta:
        return self._ttl_visitante

    def _expirada(self, perfil: UsuarioPerfil, agora: datetime) -> bool:
        return perfil.expira_em is not None and perfil.expira_em <= agora

    async def registrar(self, perfil: UsuarioPerfil) -> None:
        async with self._lock:
            self._sessoes[perfil.user_id] = perfil

    async def obter(self, user_id: str, agora: datetime | None = None) -> UsuarioPerfil | None:
        """Devolve a sessão ativa ou None. Uma sessão expirada é removida na consulta."""
        agora = agora or datetime.now(UTC)
        async with self._lock:
            perfil = self._sessoes.get(user_id)
            if perfil is not None and self._expirada(perfil, agora):
                del self._sessoes[user_id]
                return None
            return perfil

    async def encerrar(self, user_id: str) -> bool:
        async with self._lock:
            return self._sessoes.pop(user_id, None) is not None

    async def limpar_expiradas(self, agora: datetime | None = None) -> int:
        agora = agora or datetime.now(UTC)
        async with self._lock:
            expiradas = [uid for uid, p in self._sessoes.items() if self._expirada(p, agora)]
            for uid in expiradas:
                del self._sessoes[uid]
            return len(expiradas)

    async def contar(self) -> dict[str, int]:
        async with self._lock:
            visitantes = sum(1 for p in self._sessoes.values() if p.tipo == "visitante")
            return {"google": len(self._sessoes) - visitantes, "visitante": visitantes}
