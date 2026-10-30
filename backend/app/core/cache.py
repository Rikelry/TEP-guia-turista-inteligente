"""Cache em memória thread-safe com TTL e expiração automática.

Evita repetir consultas idênticas aos provedores (ex.: geocodificar "Teresina-PI" a cada roteiro).
"""

import threading
import time
from collections.abc import Hashable
from typing import Any

_AUSENTE = object()


class CacheTTL:
    def __init__(self, ttl_padrao: float = 300.0, max_itens: int = 1000) -> None:
        self._ttl_padrao = ttl_padrao
        self._max_itens = max_itens
        self._dados: dict[Hashable, tuple[float, Any]] = {}
        self._lock = threading.Lock()
        self.acertos = 0
        self.falhas = 0

    def obter(self, chave: Hashable, padrao: Any = None) -> Any:
        agora = time.monotonic()
        with self._lock:
            item = self._dados.get(chave, _AUSENTE)
            if item is _AUSENTE or item[0] <= agora:  # type: ignore[index]
                if item is not _AUSENTE:
                    del self._dados[chave]
                self.falhas += 1
                return padrao
            self.acertos += 1
            return item[1]  # type: ignore[index]

    def definir(self, chave: Hashable, valor: Any, ttl: float | None = None) -> None:
        expira = time.monotonic() + (self._ttl_padrao if ttl is None else ttl)
        with self._lock:
            if len(self._dados) >= self._max_itens and chave not in self._dados:
                self._remover_expirados()
                if len(self._dados) >= self._max_itens:
                    # Ainda cheio: descarta o item que vence primeiro.
                    mais_antigo = min(self._dados, key=lambda k: self._dados[k][0])
                    del self._dados[mais_antigo]
            self._dados[chave] = (expira, valor)

    def _remover_expirados(self) -> int:
        agora = time.monotonic()
        expirados = [k for k, (expira, _) in self._dados.items() if expira <= agora]
        for k in expirados:
            del self._dados[k]
        return len(expirados)

    def limpar(self) -> None:
        with self._lock:
            self._dados.clear()
            self.acertos = self.falhas = 0

    def __len__(self) -> int:
        with self._lock:
            self._remover_expirados()
            return len(self._dados)


# Cache compartilhado pelos serviços de geocodificação, clima e rota.
cache = CacheTTL()
