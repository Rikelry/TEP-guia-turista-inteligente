"""Testes de /api/v1/auth e da sessão ativa (X-User-Id). O Google é simulado no conftest."""

import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from app.schemas.auth import UsuarioPerfil
from app.services.sessao_service import RegistroSessoes


def test_credencial_curta_demais_e_422(client: TestClient) -> None:
    r = client.post("/api/v1/auth/google", json={"credential": "curto"})
    assert r.status_code == 422


def test_login_google(client: TestClient, token_longo: str) -> None:
    r = client.post("/api/v1/auth/google", json={"credential": token_longo})
    assert r.status_code == 200
    assert r.json() == {
        "usuario": {
            "user_id": "109876543214321",
            "nome": "Ana Souza",
            "tipo": "google",
            "email": "ana@exemplo.com",
            "foto": "https://lh3.googleusercontent.com/a/foto",
            "expira_em": None,
        }
    }


def test_login_google_rejeita_token_de_outro_app(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from tests import conftest

    token = "token-outro-app-" + "x" * 40
    monkeypatch.setitem(conftest.TOKENS_GOOGLE, token, conftest.TOKENS_GOOGLE["token-outro-app"])
    r = client.post("/api/v1/auth/google", json={"credential": token})
    assert r.status_code == 401
    assert "inválido" in r.json()["detail"]


def test_login_google_token_desconhecido_e_401(client: TestClient) -> None:
    r = client.post("/api/v1/auth/google", json={"credential": "x" * 50})
    assert r.status_code == 401


def test_login_google_campos_extras_sao_recusados(client: TestClient, token_longo: str) -> None:
    r = client.post("/api/v1/auth/google", json={"credential": token_longo, "admin": True})
    assert r.status_code == 422


@pytest.mark.parametrize(
    "transporte_http",
    [lambda req: (_ for _ in ()).throw(httpx.ConnectError("sem rede", request=req))],
)
def test_google_fora_do_ar_vira_503(client: TestClient, token_longo: str) -> None:
    r = client.post("/api/v1/auth/google", json={"credential": token_longo})
    assert r.status_code == 503


def test_login_google_sem_client_id_configurado_e_503(
    client: TestClient, token_longo: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import obter_settings

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "")
    obter_settings.cache_clear()
    r = client.post("/api/v1/auth/google", json={"credential": token_longo})
    assert r.status_code == 503


def test_visitante_recebe_id_unico_e_expira_em_2_horas(client: TestClient) -> None:
    antes = datetime.now(UTC)
    a = client.post("/api/v1/auth/visitante").json()["usuario"]
    b = client.post("/api/v1/auth/visitante").json()["usuario"]

    assert a["tipo"] == "visitante"
    assert a["user_id"].startswith("visitante-") and a["user_id"] != b["user_id"]
    expira = datetime.fromisoformat(a["expira_em"])
    assert timedelta(hours=1, minutes=59) < expira - antes <= timedelta(hours=2, seconds=5)


def test_sessao_ativa_pelo_header_x_user_id(client: TestClient) -> None:
    uid = client.post("/api/v1/auth/visitante").json()["usuario"]["user_id"]

    assert (
        client.get("/api/v1/auth/sessao", headers={"X-User-Id": uid}).json()["usuario"]["user_id"]
        == uid
    )
    assert client.get("/api/v1/auth/sessao").status_code == 401
    assert (
        client.get("/api/v1/auth/sessao", headers={"X-User-Id": "desconhecido"}).status_code == 401
    )


def test_logout_json_encerra_a_sessao(client: TestClient) -> None:
    uid = client.post("/api/v1/auth/visitante").json()["usuario"]["user_id"]

    r = client.post("/api/v1/auth/logout", json={"user_id": uid})
    assert r.status_code == 204
    assert client.get("/api/v1/auth/sessao", headers={"X-User-Id": uid}).status_code == 401


def test_logout_via_sendbeacon_em_text_plain(client: TestClient) -> None:
    uid = client.post("/api/v1/auth/visitante").json()["usuario"]["user_id"]

    r = client.post(
        "/api/v1/auth/logout",
        content=f'{{"user_id":"{uid}"}}',
        headers={"Content-Type": "text/plain;charset=UTF-8"},
    )
    assert r.status_code == 204
    assert client.get("/api/v1/auth/sessao", headers={"X-User-Id": uid}).status_code == 401


def test_logout_e_idempotente_e_valida_o_corpo(client: TestClient) -> None:
    assert client.post("/api/v1/auth/logout", json={"user_id": "ja-saiu"}).status_code == 204
    assert client.post("/api/v1/auth/logout", content="não é json").status_code == 422
    assert client.post("/api/v1/auth/logout", json={"user_id": "<script>"}).status_code == 422


def test_registro_descarta_visitante_expirado() -> None:
    async def cenario() -> None:
        registro = RegistroSessoes(ttl_visitante=timedelta(hours=2))
        agora = datetime.now(UTC)
        await registro.registrar(
            UsuarioPerfil(
                user_id="v1", nome="V", tipo="visitante", expira_em=agora - timedelta(seconds=1)
            )
        )
        await registro.registrar(
            UsuarioPerfil(
                user_id="v2", nome="V", tipo="visitante", expira_em=agora + timedelta(hours=1)
            )
        )
        await registro.registrar(UsuarioPerfil(user_id="g1", nome="Ana", tipo="google"))

        assert await registro.obter("v1", agora) is None
        assert (await registro.obter("v2", agora)) is not None
        assert await registro.contar() == {"google": 1, "visitante": 1}
        assert await registro.limpar_expiradas(agora + timedelta(hours=2)) == 1

    asyncio.run(cenario())
