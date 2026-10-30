# Guia do Turista Inteligente · API v2 (FastAPI)

API REST assíncrona (ASGI) que substitui o monólito Flask. Orquestra geocodificação e clima
(Open-Meteo), rota (OSRM), relevo (Open-Elevation) e o guia por IA (Google Gemini), com
streaming SSE, circuit breakers, cache, telemetria e persistência por usuário.

## Como rodar

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env          # preencha GOOGLE_CLIENT_ID e GEMINI_API_KEY
uvicorn app.main:app --reload --port 8001
```

- API: http://localhost:8001 · Swagger: http://localhost:8001/docs · ReDoc: http://localhost:8001/redoc
- Probes: `/healthz` e `/readyz` · Prometheus: `/metrics`
- Testes (sem internet, provedores simulados): `pytest -v`
- Lint e formatação: `ruff check app tests` e `ruff format app tests`

Sem `GEMINI_API_KEY` o guia usa a contingência (montada com o catálogo e o clima real).

## Estrutura

```
app/
├── main.py                 # lifespan (pool httpx, sessões), CORS, X-Process-Time, X-Request-ID, probes
├── core/
│   ├── config.py           # Pydantic-Settings: .env, CORS, URLs e timeouts dos provedores
│   ├── dependencies.py     # Depends: cliente HTTP, sessões, usuário ativo (X-User-Id)
│   ├── logging_config.py   # logs com Correlation-ID
│   ├── cache.py            # cache em memória com TTL
│   ├── circuit_breaker.py  # disjuntor por provedor com fallback imediato
│   ├── catalogo.py         # destinos curados, atrativos, gastronomia e Haversine
│   └── metricas.py         # contadores e latências alimentados pelo middleware
├── routers/
│   ├── auth.py             # /api/v1/auth: Google JWT, visitante (2 h), sessão, logout (sendBeacon)
│   ├── roteiros.py         # /api/v1/roteiros: planejar, mapa-rota, stream-guia, custos, GPX, histórico
│   └── telemetria.py       # /api/v1/telemetria e /metrics
├── schemas/
│   ├── auth.py             # contratos de autenticação
│   └── roteiros.py         # contratos estritos de roteiro (422 em entrada inválida)
└── services/
    ├── clima_service.py    # geocodificação e clima (Open-Meteo)
    ├── rota_service.py     # OSRM: geometria, distância, alternativas, detecção de ilha
    ├── altimetria_service.py  # perfil de relevo, desnível e penalização no consumo
    ├── postos_service.py   # paradas por autonomia (reserva de 18%)
    ├── custos_service.py   # combustível/energia, pedágio, emissões e rateio
    ├── gemini_service.py   # guia por IA, streaming e eventos SSE
    ├── gpx_service.py      # exportação GPX 1.1
    ├── storage_service.py  # JSON atômico por usuário (visitante só em memória)
    └── sessao_service.py   # sessões ativas com TTL
static/data/                # viagens.json e estados_brasil.json
tests/                      # pytest
```

## Endpoints principais

Todas as rotas de roteiro exigem o header `X-User-Id` de uma sessão ativa (401 sem ele).

| Método e rota | O que faz |
| --- | --- |
| `POST /api/v1/auth/google` | `{ credential }` → valida o JWT no Google → `{ usuario }` |
| `POST /api/v1/auth/visitante` | Sessão de visitante com `expira_em` = agora + 2 h |
| `GET /api/v1/auth/sessao` | Perfil da sessão do `X-User-Id` |
| `POST /api/v1/auth/logout` | `{ user_id }` em JSON ou `text/plain` (sendBeacon) → 204 |
| `POST /api/v1/roteiros/planejar` | `asyncio.gather` duplo (geocodificação; clima + rota) + Gemini. 409 em clique duplicado, 499 se o cliente sair |
| `POST /api/v1/roteiros/mapa-rota` | Rotas alternativas com relevo, paradas por autonomia e custos |
| `POST /api/v1/roteiros/stream-guia` | Guia por IA em Server-Sent Events (`data: {"chunk", "done"}`) |
| `POST /api/v1/roteiros/custos` | Calculadora de combustível/energia, pedágio, emissões e rateio |
| `POST /api/v1/roteiros/exportar/gpx` | `{ roteiro_id }` → arquivo GPX 1.1 |
| `GET /api/v1/roteiros/minhas-viagens` | Histórico do usuário |
| `DELETE /api/v1/roteiros/{id}` | Exclui um roteiro |
| `PATCH /api/v1/roteiros/{id}/visitas` | `{ atrativo_id, visitado }` |
| `POST /api/v1/roteiros/{id}/compartilhar` | Agenda o envio em segundo plano e devolve o link do WhatsApp |
| `GET /api/v1/roteiros/destinos` | Catálogo de destinos (para sugestões por Haversine na SPA) |
| `GET /api/v1/telemetria` | Métricas, provedores ativos e circuit breakers |
| `POST /api/v1/telemetria/auditoria` | Registra um evento de auditoria em segundo plano (202) |
| `GET /metrics` | Exportador Prometheus |
