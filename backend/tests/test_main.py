"""Testes da aplicação: probes, CORS para a SPA e headers de telemetria."""

from fastapi.testclient import TestClient


def test_healthz(client: TestClient) -> None:
    assert client.get("/healthz").json() == {"status": "ok"}


def test_readyz_informa_recursos_do_lifespan(client: TestClient) -> None:
    r = client.get("/readyz")
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["status"] == "pronto"
    assert corpo["google_login"] is True
    assert corpo["sessoes_ativas"] == {"google": 0, "visitante": 0}


def test_toda_resposta_traz_process_time_e_request_id(client: TestClient) -> None:
    r = client.get("/healthz")
    assert float(r.headers["X-Process-Time"]) >= 0
    assert len(r.headers["X-Request-ID"]) == 32


def test_request_id_recebido_e_propagado(client: TestClient) -> None:
    r = client.get("/healthz", headers={"X-Request-ID": "req-da-spa-123"})
    assert r.headers["X-Request-ID"] == "req-da-spa-123"


def test_cors_libera_a_spa_e_expoe_os_headers_de_telemetria(client: TestClient) -> None:
    r = client.get("/healthz", headers={"Origin": "http://localhost:5173"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    expostos = r.headers["access-control-expose-headers"].lower()
    assert "x-process-time" in expostos and "x-request-id" in expostos


def test_cors_preflight_com_x_user_id(client: TestClient) -> None:
    r = client.options(
        "/api/v1/auth/logout",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-user-id",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_bloqueia_origem_desconhecida(client: TestClient) -> None:
    r = client.get("/healthz", headers={"Origin": "https://site-malicioso.com"})
    assert "access-control-allow-origin" not in r.headers


def test_documentacao_openapi_disponivel(client: TestClient) -> None:
    caminhos = client.get("/openapi.json").json()["paths"]
    for rota in (
        "/api/v1/auth/google",
        "/api/v1/auth/visitante",
        "/api/v1/auth/logout",
        "/api/v1/auth/sessao",
    ):
        assert rota in caminhos
