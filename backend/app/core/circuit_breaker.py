"""Circuit Breakers com fallback imediato e degradação graciosa.

Cada provedor externo (geocodificação, clima, rota, relevo, IA) tem um disjuntor:
- FECHADO: chamadas passam normalmente; falhas seguidas são contadas.
- ABERTO: depois de `limite_falhas` falhas, o provedor é pulado e o fallback volta na hora,
  sem esperar timeout. Assim um serviço fora do ar não deixa o /planejar lento.
- MEIO_ABERTO: passado `tempo_reset`, uma chamada de teste é liberada. Sucesso fecha; falha reabre.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Any

logger = logging.getLogger(__name__)


class EstadoCircuito(StrEnum):
    FECHADO = "fechado"
    ABERTO = "aberto"
    MEIO_ABERTO = "meio_aberto"


class CircuitBreaker:
    def __init__(self, nome: str, limite_falhas: int = 3, tempo_reset: float = 30.0) -> None:
        self.nome = nome
        self.limite_falhas = limite_falhas
        self.tempo_reset = tempo_reset
        self.estado = EstadoCircuito.FECHADO
        self.falhas_seguidas = 0
        self.total_chamadas = 0
        self.total_falhas = 0
        self.total_fallbacks = 0
        self.aberto_em: float | None = None
        self.ultimo_erro: str | None = None
        self._lock = asyncio.Lock()

    async def _pode_tentar(self) -> bool:
        async with self._lock:
            if self.estado is EstadoCircuito.ABERTO:
                assert self.aberto_em is not None
                if time.monotonic() - self.aberto_em < self.tempo_reset:
                    return False
                self.estado = EstadoCircuito.MEIO_ABERTO
                logger.info("Circuito '%s' meio aberto: testando o provedor de novo.", self.nome)
            return True

    async def registrar_sucesso(self) -> None:
        async with self._lock:
            if self.estado is not EstadoCircuito.FECHADO:
                logger.info("Circuito '%s' fechado: provedor voltou.", self.nome)
            self.estado = EstadoCircuito.FECHADO
            self.falhas_seguidas = 0
            self.aberto_em = None

    async def registrar_falha(self, erro: BaseException) -> None:
        async with self._lock:
            self.total_falhas += 1
            self.falhas_seguidas += 1
            self.ultimo_erro = f"{type(erro).__name__}: {erro}"[:200]
            if (
                self.estado is EstadoCircuito.MEIO_ABERTO
                or self.falhas_seguidas >= self.limite_falhas
            ):
                self.estado = EstadoCircuito.ABERTO
                self.aberto_em = time.monotonic()
                logger.warning("Circuito '%s' aberto após falha: %s", self.nome, self.ultimo_erro)

    async def chamar[T](
        self, funcao: Callable[[], Awaitable[T]], fallback: Callable[[], T]
    ) -> tuple[T, bool]:
        """Executa `funcao`. Devolve (resultado, usou_fallback).

        Qualquer exceção (timeout, erro HTTP, resposta inválida) conta como falha e devolve o fallback.
        `asyncio.CancelledError` não é capturado: o cancelamento da requisição precisa propagar.
        """
        self.total_chamadas += 1
        if not await self._pode_tentar():
            self.total_fallbacks += 1
            return fallback(), True
        try:
            resultado = await funcao()
        except Exception as erro:  # noqa: BLE001 - fronteira de resiliência: nunca propaga
            await self.registrar_falha(erro)
            self.total_fallbacks += 1
            return fallback(), True
        await self.registrar_sucesso()
        return resultado, False

    def status(self) -> dict[str, Any]:
        restante = None
        if self.estado is EstadoCircuito.ABERTO and self.aberto_em is not None:
            restante = max(0.0, round(self.tempo_reset - (time.monotonic() - self.aberto_em), 1))
        return {
            "nome": self.nome,
            "estado": self.estado.value,
            "falhas_seguidas": self.falhas_seguidas,
            "total_chamadas": self.total_chamadas,
            "total_falhas": self.total_falhas,
            "total_fallbacks": self.total_fallbacks,
            "reabre_em_segundos": restante,
            "ultimo_erro": self.ultimo_erro,
        }

    def resetar(self) -> None:
        self.estado = EstadoCircuito.FECHADO
        self.falhas_seguidas = self.total_chamadas = self.total_falhas = self.total_fallbacks = 0
        self.aberto_em = None
        self.ultimo_erro = None


PROVEDORES = ("geocoding", "clima", "rota", "elevacao", "gemini")

_breakers: dict[str, CircuitBreaker] = {}


def obter_breaker(nome: str) -> CircuitBreaker:
    """Disjuntor do provedor (criado na primeira vez, com os limites do .env)."""
    if nome not in _breakers:
        from app.core.config import obter_settings

        config = obter_settings()
        _breakers[nome] = CircuitBreaker(
            nome, config.breaker_limite_falhas, config.breaker_tempo_reset_segundos
        )
    return _breakers[nome]


def todos_breakers() -> list[CircuitBreaker]:
    return [obter_breaker(nome) for nome in PROVEDORES]


def resetar_breakers() -> None:
    _breakers.clear()
