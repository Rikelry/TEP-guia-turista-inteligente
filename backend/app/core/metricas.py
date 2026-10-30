"""Métricas operacionais em memória, alimentadas pelo middleware do main.py.

O router de telemetria lê este registro para o painel da SPA e para o exportador Prometheus.
"""

import threading
import time
from collections import Counter, deque
from typing import Any


class Metricas:
    def __init__(self, janela_latencias: int = 200) -> None:
        self._lock = threading.Lock()
        self.inicio = time.time()
        self.requisicoes_total = 0
        self.por_status: Counter[int] = Counter()
        self.por_rota: Counter[str] = Counter()
        self.latencia_soma_ms = 0.0
        self.latencias_recentes: deque[float] = deque(maxlen=janela_latencias)
        self.conexoes_ativas = 0
        self.roteiros_gerados = 0
        self.conflitos_409 = 0
        self.cancelamentos_499 = 0

    def entrar(self) -> None:
        with self._lock:
            self.conexoes_ativas += 1

    def sair(self, rota: str, status: int, duracao_ms: float) -> None:
        with self._lock:
            self.conexoes_ativas = max(0, self.conexoes_ativas - 1)
            self.requisicoes_total += 1
            self.por_status[status] += 1
            self.por_rota[rota] += 1
            self.latencia_soma_ms += duracao_ms
            self.latencias_recentes.append(duracao_ms)
            if status == 409:
                self.conflitos_409 += 1
            elif status == 499:
                self.cancelamentos_499 += 1

    def roteiro_gerado(self) -> None:
        with self._lock:
            self.roteiros_gerados += 1

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            recentes = list(self.latencias_recentes)
            ordenadas = sorted(recentes)
            p95 = ordenadas[int(len(ordenadas) * 0.95) - 1] if len(ordenadas) >= 20 else None
            return {
                "uptime_segundos": round(time.time() - self.inicio, 1),
                "requisicoes_total": self.requisicoes_total,
                "por_status": {str(k): v for k, v in sorted(self.por_status.items())},
                "por_rota": dict(self.por_rota.most_common(20)),
                "latencia_media_ms": (
                    round(self.latencia_soma_ms / self.requisicoes_total, 2)
                    if self.requisicoes_total
                    else None
                ),
                "latencia_recente_ms": round(recentes[-1], 2) if recentes else None,
                "latencia_p95_ms": round(p95, 2) if p95 is not None else None,
                "conexoes_ativas": self.conexoes_ativas,
                "roteiros_gerados": self.roteiros_gerados,
                "conflitos_409": self.conflitos_409,
                "cancelamentos_499": self.cancelamentos_499,
            }

    def resetar(self) -> None:
        self.__init__(self.latencias_recentes.maxlen or 200)  # type: ignore[misc]


metricas = Metricas()
