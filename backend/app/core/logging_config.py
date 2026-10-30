"""Logging estruturado com Correlation-ID: toda linha de log traz o X-Request-ID da requisição."""

import logging
from contextvars import ContextVar

# Guardado por requisição pelo middleware do main.py; "-" fora de uma requisição (ex.: startup).
request_id_atual: ContextVar[str] = ContextVar("request_id", default="-")


class CorrelationIdFilter(logging.Filter):
    """Injeta o request_id atual em cada registro de log."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_atual.get()
        return True


FORMATO = "%(asctime)s %(levelname)s [%(name)s] [req=%(request_id)s] %(message)s"


def configurar_logging(nivel: int = logging.INFO) -> None:
    """Configura o logger raiz uma vez. Chamado no lifespan do FastAPI."""
    raiz = logging.getLogger()
    if any(isinstance(f, CorrelationIdFilter) for h in raiz.handlers for f in h.filters):
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(FORMATO))
    handler.addFilter(CorrelationIdFilter())
    raiz.addHandler(handler)
    raiz.setLevel(nivel)
