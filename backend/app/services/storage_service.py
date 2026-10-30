"""Persistência atômica thread-safe e isolamento por usuário em arquivo JSON.

- Usuários Google: viagens gravadas em static/data/viagens.json, agrupadas pelo user_id.
- Visitantes: viagens só em memória (somem com a sessão), como no monólito v1.

A gravação é atômica: escreve num arquivo temporário e troca com os.replace(), então uma queda
no meio da escrita nunca deixa o JSON corrompido. O disco roda em asyncio.to_thread() para não
travar o event loop.
"""

import asyncio
import json
import os
import tempfile
import threading
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import obter_settings

MAX_VIAGENS_POR_USUARIO = 50

_lock_arquivo = threading.Lock()
_memoria_visitantes: dict[str, list[dict[str, Any]]] = {}


def estrutura_padrao() -> dict[str, Any]:
    return {
        "versao_schema": "2.0",
        "descricao": "Roteiros salvos por usuário (Guia do Turista Inteligente v2)",
        "atualizado_em": datetime.now(UTC).isoformat(),
        "total_usuarios": 0,
        "total_roteiros": 0,
        "usuarios": {},
    }


def _arquivo() -> Path:
    return obter_settings().viagens_arquivo


def _ler() -> dict[str, Any]:
    caminho = _arquivo()
    try:
        with caminho.open(encoding="utf-8") as f:
            dados = json.load(f)
    except FileNotFoundError:
        return estrutura_padrao()
    except json.JSONDecodeError:
        # Arquivo corrompido por edição manual: preserva uma cópia e recomeça.
        caminho.rename(caminho.with_suffix(f".corrompido-{datetime.now(UTC):%Y%m%d%H%M%S}.json"))
        return estrutura_padrao()
    if not isinstance(dados.get("usuarios"), dict):
        dados["usuarios"] = {}
    return dados


def _gravar(dados: dict[str, Any]) -> None:
    caminho = _arquivo()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    usuarios = dados["usuarios"]
    dados["total_usuarios"] = len(usuarios)
    dados["total_roteiros"] = sum(len(u.get("viagens", [])) for u in usuarios.values())
    dados["atualizado_em"] = datetime.now(UTC).isoformat()
    fd, temporario = tempfile.mkstemp(dir=caminho.parent, prefix=".viagens-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=2, default=str)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporario, caminho)
    except BaseException:
        Path(temporario).unlink(missing_ok=True)
        raise


# ---------------------------------------------------------------------------
# Operações síncronas (rodam numa thread, sob o lock)
# ---------------------------------------------------------------------------


def _listar(user_id: str, persistente: bool) -> list[dict[str, Any]]:
    if not persistente:
        return deepcopy(_memoria_visitantes.get(user_id, []))
    with _lock_arquivo:
        return _ler()["usuarios"].get(user_id, {}).get("viagens", [])


def _salvar(user_id: str, roteiro: dict[str, Any], persistente: bool) -> None:
    if not persistente:
        lista = _memoria_visitantes.setdefault(user_id, [])
        lista.insert(0, deepcopy(roteiro))
        del lista[MAX_VIAGENS_POR_USUARIO:]
        return
    with _lock_arquivo:
        dados = _ler()
        usuario = dados["usuarios"].setdefault(user_id, {"viagens": []})
        usuario["viagens"].insert(0, roteiro)
        del usuario["viagens"][MAX_VIAGENS_POR_USUARIO:]
        _gravar(dados)


def _atualizar(
    user_id: str, roteiro_id: str, persistente: bool, alterar: Any
) -> dict[str, Any] | None:
    """Aplica `alterar(roteiro)` no roteiro do usuário. None se não existir (ou for de outro)."""
    if not persistente:
        for roteiro in _memoria_visitantes.get(user_id, []):
            if roteiro.get("id") == roteiro_id:
                alterar(roteiro)
                return deepcopy(roteiro)
        return None
    with _lock_arquivo:
        dados = _ler()
        for roteiro in dados["usuarios"].get(user_id, {}).get("viagens", []):
            if roteiro.get("id") == roteiro_id:
                alterar(roteiro)
                _gravar(dados)
                return roteiro
    return None


def _remover(user_id: str, roteiro_id: str, persistente: bool) -> bool:
    if not persistente:
        lista = _memoria_visitantes.get(user_id, [])
        antes = len(lista)
        lista[:] = [r for r in lista if r.get("id") != roteiro_id]
        return len(lista) < antes
    with _lock_arquivo:
        dados = _ler()
        viagens = dados["usuarios"].get(user_id, {}).get("viagens", [])
        restantes = [r for r in viagens if r.get("id") != roteiro_id]
        if len(restantes) == len(viagens):
            return False
        dados["usuarios"][user_id]["viagens"] = restantes
        _gravar(dados)
        return True


def _contar() -> int:
    with _lock_arquivo:
        total = _ler()["total_roteiros"]
    return total + sum(len(v) for v in _memoria_visitantes.values())


# ---------------------------------------------------------------------------
# API assíncrona usada pelos routers
# ---------------------------------------------------------------------------


async def listar_viagens(user_id: str, persistente: bool) -> list[dict[str, Any]]:
    return await asyncio.to_thread(_listar, user_id, persistente)


async def salvar_nova_viagem(user_id: str, roteiro: dict[str, Any], persistente: bool) -> None:
    """Chamado por BackgroundTasks depois que a resposta já foi entregue."""
    await asyncio.to_thread(_salvar, user_id, roteiro, persistente)


async def buscar_viagem(user_id: str, roteiro_id: str, persistente: bool) -> dict[str, Any] | None:
    viagens = await listar_viagens(user_id, persistente)
    return next((r for r in viagens if r.get("id") == roteiro_id), None)


async def marcar_visita(
    user_id: str, roteiro_id: str, atrativo_id: str, visitado: bool, persistente: bool
) -> dict[str, Any] | None:
    """Marca um atrativo como visitado. None se o roteiro não existir; KeyError se o atrativo não."""

    def alterar(roteiro: dict[str, Any]) -> None:
        for atrativo in roteiro.get("atrativos", []):
            if atrativo.get("id") == atrativo_id:
                atrativo["visitado"] = visitado
                return
        raise KeyError(atrativo_id)

    return await asyncio.to_thread(_atualizar, user_id, roteiro_id, persistente, alterar)


async def remover_viagem(user_id: str, roteiro_id: str, persistente: bool) -> bool:
    return await asyncio.to_thread(_remover, user_id, roteiro_id, persistente)


async def descartar_visitante(user_id: str) -> None:
    _memoria_visitantes.pop(user_id, None)


async def contar_roteiros() -> int:
    return await asyncio.to_thread(_contar)


def limpar_memoria_visitantes() -> None:
    _memoria_visitantes.clear()
