"""Integridade das variáveis de ambiente e validação das configurações."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_padroes_de_desenvolvimento(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    s = Settings()
    assert s.cors_origins == ["http://localhost:5173", "http://localhost:3000"]
    assert s.visitante_ttl_horas == 2.0
    assert s.google_client_id == ""


def test_cors_origins_em_texto_separado_por_virgula(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", " http://localhost:5173/ , https://guia.exemplo.com ,")
    assert Settings().cors_origins == ["http://localhost:5173", "https://guia.exemplo.com"]


def test_le_o_arquivo_env(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    (tmp_path / ".env").write_text(
        "GOOGLE_CLIENT_ID=  abc.apps.googleusercontent.com  \nVISITANTE_TTL_HORAS=1.5\n"
    )
    monkeypatch.chdir(tmp_path)
    s = Settings()
    assert s.google_client_id == "abc.apps.googleusercontent.com"
    assert s.visitante_ttl_horas == 1.5


@pytest.mark.parametrize("ttl", ["0", "-1", "48", "duas"])
def test_ttl_do_visitante_invalido_e_recusado(ttl: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VISITANTE_TTL_HORAS", ttl)
    with pytest.raises(ValidationError):
        Settings()
