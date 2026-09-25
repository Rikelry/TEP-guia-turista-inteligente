"""Aplicação Flask Principal - Guia do Turista Inteligente (API Gateway em Python)."""

import contextlib
import hmac
import json
import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from functools import wraps
from typing import Any

import httpx
from flask import (
    Flask,
    abort,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from config import (
    DATA_DIR,
    ESTADOS_BRASIL,
    GOOGLE_CLIENT_ID,
    PORT,
    VIAGENS_FILE,
)
from planejamento import obter_guia_destino_com_diagnostico
from services import (
    buscar_coordenadas,
    obter_clima,
    obter_percurso,
  verificar_token_google
)

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "guia-turista-secret-key-2026-python")

# Controle de concorrência para leitura e escrita segura no arquivo JSON
DATA_DIR.mkdir(parents=True, exist_ok=True)
lock_arquivo_json = threading.Lock()

# Armazenamento volátil de roteiros em memória para sessões de visitantes
viagens_visitante_memoria: dict[str, list[dict[str, Any]]] = {}

# Controle de concorrência e idempotência contra cliques duplicados
requisicoes_ativas: set[str] = set()
requisicoes_recentes: dict[str, float] = {}
lock_requisicoes = threading.Lock()


# ==============================================================================
# 👤 RESPONSABILIDADE DO ALUNO 4: Persistência JSON, Sanitização e Manipulação
# ==============================================================================


def sanitizar_entrada(texto: str, max_len: int = 80) -> str:
    """Higieniza entradas de texto removendo tags HTML, caracteres de controle e espaços extras."""
    texto = re.sub(r"<[^>]*>", "", texto)
    texto = re.sub(r"[\x00-\x1F\x7F]", "", texto)
    texto = " ".join(texto.split())
    return texto[:max_len]

def criar_estrutura_padrao_viagens() -> dict[str, Any]:
    """Retorna a estrutura inicial do payload JSON de viagens com metadados e provedores."""
    return {
        "versao_schema": "1.0",
        "descricao": "Base consolidada de roteiros turísticos e telemetria por usuário",
        "atualizado_em": datetime.now().isoformat(),
        "total_usuarios": 0,
        "total_roteiros": 0,
        "provedores": {
            "geocoding": "Open-Meteo Geocoding API",
            "previsao_tempo": "Open-Meteo Forecast API",
            "roteamento": "OSRM Routing Engine",
            "inteligencia_artificial": "Google Gemini (gemini-3.6-flash)",
        },
        "usuarios": {},
    }


def carregar_dados_viagens_json() -> dict[str, Any]:
    """Lê a base completa de viagens de static/data/viagens.json de forma thread-safe com lock_arquivo_json."""
    with lock_arquivo_json:
        if not VIAGENS_FILE.exists():
            return criar_estrutura_padrao_viagens()

        with open(VIAGENS_FILE, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo)


def salvar_dados_viagens_json(dados_completos: dict[str, Any]) -> None:
    """Persiste a base hierárquica em static/data/viagens.json com lock_arquivo_json e indentação de 2 espaços."""
    with lock_arquivo_json:
        dados_completos["atualizado_em"] = datetime.now().isoformat()
        dados_completos["total_usuarios"] = len(dados_completos.get("usuarios", {}))
        dados_completos["total_roteiros"] = sum(
            len(usuario.get("roteiros", []))
            for usuario in dados_completos.get("usuarios", {}).values()
        )

        DATA_DIR.mkdir(parents=True, exist_ok=True)

        with open(VIAGENS_FILE, "w", encoding="utf-8") as arquivo:
            json.dump(dados_completos, arquivo, ensure_ascii=False, indent=2)


def obter_viagens_usuario(user_id: str) -> list[dict[str, Any]]:
    """Recupera a lista de roteiros: da memória para visitantes ou do arquivo JSON para logados."""
    if user_id.startswith("visitante_"):
        return viagens_visitante_memoria.get(user_id, [])

    dados = carregar_dados_viagens_json()
    usuario = dados.get("usuarios", {}).get(user_id, {})
    return usuario.get("roteiros", [])


def adicionar_viagem_usuario(
    user_id: str,
    item: dict[str, Any],
    perfil_usuario: dict[str, Any] | None = None,
) -> None:
    """Adiciona um novo roteiro: na memória para visitante ou grava no JSON para usuário logado."""
    if user_id.startswith("visitante_"):
        viagens_visitante_memoria.setdefault(user_id, []).append(item)
        return

    dados = carregar_dados_viagens_json()
    usuarios = dados.setdefault("usuarios", {})
    usuario = usuarios.setdefault(
        user_id,
        {
            "nome": (perfil_usuario or {}).get("nome", ""),
            "email": (perfil_usuario or {}).get("email", ""),
            "roteiros": [],
        },
    )

    usuario.setdefault("roteiros", []).append(item)
    salvar_dados_viagens_json(dados)


def remover_viagem_usuario(user_id: str, viagem_id: str) -> None:
    """Remove um roteiro específico pelo ID."""
    if user_id.startswith("visitante_"):
        viagens = viagens_visitante_memoria.get(user_id, [])
        viagens_visitante_memoria[user_id] = [
            viagem for viagem in viagens if viagem.get("id") != viagem_id
        ]
        return

    dados = carregar_dados_viagens_json()
    usuario = dados.get("usuarios", {}).get(user_id)

    if not usuario:
        return

    roteiros = usuario.get("roteiros", [])
    usuario["roteiros"] = [
        viagem for viagem in roteiros if viagem.get("id") != viagem_id
    ]

    salvar_dados_viagens_json(dados)


# ==============================================================================
# 👤 RESPONSABILIDADE DO ALUNO 3: Backend Gateway, Sessões, Rotas & Idempotência
# ==============================================================================


# --- Deduplicação de cliques (idempotência por requisição em andamento) -----
requisicoes_ativas: set[str] = set()
_lock_estado_requisicoes = threading.Lock()


@contextlib.contextmanager
def lock_requisicoes(chave: str):
    """Context manager de deduplicação por chave (ex: 'criar:<user_id>').

    Rende True se a chave estava livre (processa normalmente) ou False se já
    existe uma requisição idêntica em andamento (deve abortar com aviso).
    """
    with _lock_estado_requisicoes:
        livre = chave not in requisicoes_ativas
        if livre:
            requisicoes_ativas.add(chave)
    try:
        yield livre
    finally:
        if livre:
            with _lock_estado_requisicoes:
                requisicoes_ativas.discard(chave)


# --- Sessão ------------------------------------------------------------------
def usuario_atual() -> dict[str, Any] | None:
    """Retorna o dicionário do usuário logado na sessão atual, ou None."""
    return session.get("usuario")


def _iniciar_sessao(dados_usuario: dict[str, Any]) -> None:
    """Grava os dados do usuário (Google ou visitante) na sessão Flask."""
    session["usuario"] = dados_usuario
    session.permanent = True


def descartar_viagens_visitante(usuario: dict[str, Any]) -> None:
    """Remove da memória o roteiro do visitante ao encerrar a sessão."""
    viagens_visitante_memoria.pop(usuario["id"], None)


def login_obrigatorio(view_func):
    """Decorator: exige sessão ativa; sem ela, redireciona pra index."""

    @wraps(view_func)
    def wrapper(*args, **kwargs):
        if not usuario_atual():
            flash("Você precisa entrar para continuar.", "warning")
            return redirect(url_for("index"))
        return view_func(*args, **kwargs)

    return wrapper


# --- Rotas ---------------------------------------------------------------
@app.route("/", methods=["GET"])
def index():
    """Renderiza a página principal (SSR com Jinja2)."""
    usuario = usuario_atual()
    viagens = obter_viagens_usuario(usuario["id"]) if usuario else []

    return render_template(
        "index.html",
        usuario=usuario,
        viagens=viagens,
        client_id=GOOGLE_CLIENT_ID,
        ufs=ESTADOS_BRASIL.keys(),
    )
    

@app.route("/auth/google/callback", methods=["POST"])
def google_callback():
    """Recebe a credencial JWT do Google e valida via services.verificar_token_google."""
    cookie = request.cookies.get("g_csrf_token", "")
    corpo = request.form.get("g_csrf_token", "")
    if not cookie or not hmac.compare_digest(cookie.encode(), corpo.encode()):
        abort(400, "Falha na verificação CSRF")

    credential = request.form.get("credential")
    if not credential:
        abort(400, "Credencial ausente")

    with httpx.Client() as client:
        info = verificar_token_google(client, credential)

    if not info:
        flash("Não foi possível validar seu login com o Google. Tente de novo.", "error")
        return redirect(url_for("index"))

    _iniciar_sessao(
        {
            "tipo": "google",
            "id": f"google:{info['sub']}",
            "nome": info["name"] or info["email"],
            "email": info["email"],
            "foto": info["picture"],
        }
    )
    return redirect(url_for("index"))  # PRG


@app.route("/auth/demo", methods=["GET"])
def login_demo():
    """Modo Visitante para desenvolvimento e testes locais."""
    _iniciar_sessao(
        {
            "tipo": "visitante",
            "id": f"visitante_{uuid.uuid4().hex}",
            "nome": "Viajante Convidado",
            "email": None,
            "foto": None,
        }
    )
    return redirect(url_for("index"))  # PRG


@app.route("/auth/logout", methods=["GET"])
def logout():
    """Encerra a sessão e descarta a memória de visitante."""
    usuario = usuario_atual()
    if usuario and usuario["tipo"] == "visitante":
        descartar_viagens_visitante(usuario)
    session.clear()
    return redirect(url_for("index"))  # PRG


@app.route("/viagens/criar", methods=["POST"])
@login_obrigatorio
def criar_viagem():
    usuario = usuario_atual()

    origem_cidade = sanitizar_entrada(
        request.form.get("origem_cidade", ""), max_len=100
    )
    origem_uf = sanitizar_entrada(
        request.form.get("origem_uf", ""), max_len=2
    ).upper()

    destino_cidade = sanitizar_entrada(
        request.form.get("destino_cidade", ""), max_len=100
    )
    destino_uf = sanitizar_entrada(
        request.form.get("destino_uf", ""), max_len=2
    ).upper()

    if not origem_cidade or not origem_uf or not destino_cidade or not destino_uf:
        flash("Informe origem e destino válidos.", "error")
        return redirect(url_for("index"))

    with lock_requisicoes(f"criar:{usuario['id']}") as livre:
        if not livre:
            flash(
                "Sua solicitação anterior ainda está sendo processada.",
                "warning",
            )
            return redirect(url_for("index"))

        with httpx.Client() as client:
            lat_o, lon_o, uf_o = buscar_coordenadas(
                client,
                origem_cidade,
                origem_uf,
            )

            lat_d, lon_d, uf_d = buscar_coordenadas(
                client,
                destino_cidade,
                destino_uf,
            )

            if lat_o == 0.0 and lon_o == 0.0:
                flash("Cidade de origem não encontrada no Brasil.", "warning")
                return redirect(url_for("index"))

            if lat_d == 0.0 and lon_d == 0.0:
                flash("Cidade de destino não encontrada no Brasil.", "warning")
                return redirect(url_for("index"))

            origem_formatada = f"{origem_cidade}, {uf_o}"
            destino_formatado = f"{destino_cidade}, {uf_d}"

            ja_existe = any(
                v.get("origem", "").lower() == origem_formatada.lower()
                and v.get("destino", "").lower() == destino_formatado.lower()
                for v in obter_viagens_usuario(usuario["id"])
            )

            if ja_existe:
                flash("Essa viagem já está na sua lista.", "info")
                return redirect(url_for("index"))

            clima = obter_clima(client, lat_d, lon_d)

            percurso = obter_percurso(
                client,
                lat_o,
                lon_o,
                lat_d,
                lon_d,
            )

            guia_texto, guia_diagnostico = obter_guia_destino_com_diagnostico(
                destino_formatado
            )

        adicionar_viagem_usuario(
            usuario["id"],
            {
                "id": uuid.uuid4().hex,
                "origem": origem_formatada,
                "destino": destino_formatado,
                "nome": destino_cidade,
                "uf": uf_d,
                "latitude_origem": lat_o,
                "longitude_origem": lon_o,
                "latitude_destino": lat_d,
                "longitude_destino": lon_d,
                "clima": clima,
                "percurso": percurso,
                "dicas_destino": guia_texto,
                "guia_destino": guia_texto,
                "diagnostico_guia": guia_diagnostico,
                "criado_em": datetime.now(timezone.utc).isoformat(),
            },
            perfil_usuario=usuario,
        )

    flash("Viagem criada!", "success")
    return redirect(url_for("index"))


@app.route("/viagens/deletar/<string:viagem_id>", methods=["POST"])
@login_obrigatorio
def deletar_viagem(viagem_id: str):
    """Exclui um roteiro da lista do usuário."""
    usuario = usuario_atual()

    with lock_requisicoes(f"deletar:{usuario['id']}:{viagem_id}") as livre:
        if not livre:
            flash("Sua solicitação anterior ainda está sendo processada.", "warning")
            return redirect(url_for("index"))

        existia = any(
            v.get("id") == viagem_id for v in obter_viagens_usuario(usuario["id"])
        )
        remover_viagem_usuario(usuario["id"], viagem_id)

    if existia:
        flash("Viagem removida.", "success")
    else:
        flash("Viagem não encontrada.", "info")  # apagar de novo dá o mesmo estado final
    return redirect(url_for("index"))  # PRG

# ==============================================================================
# 👤 RESPONSABILIDADE DO ALUNO 4: Endpoint REST e Error Handlers Globais
# ==============================================================================


@app.route("/viagens/json", methods=["GET"])
@app.route("/api/viagens/json", methods=["GET"])
@app.route("/api/viagens", methods=["GET"])
def ver_viagens_json():
    """Retorna a base consolidada de static/data/viagens.json com suporte dinâmico a visitantes."""
    dados = carregar_dados_viagens_json()

    for user_id, viagens in viagens_visitante_memoria.items():
        usuario = dados.setdefault("usuarios", {}).setdefault(
            user_id,
            {
                "nome": "Viajante Convidado",
                "email": "",
                "roteiros": [],
            },
        )
        usuario["roteiros"] = viagens

    dados["total_usuarios"] = len(dados.get("usuarios", {}))
    dados["total_roteiros"] = sum(
        len(usuario.get("roteiros", []))
        for usuario in dados.get("usuarios", {}).values()
    )

    return jsonify(dados)


@app.errorhandler(405)
def metodo_nao_permitido(error):
    """Fallback para acessos GET em rotas POST (ex: digitar /viagens/criar na barra de endereços)."""
    return redirect(url_for("index"))


@app.errorhandler(404)
def pagina_nao_encontrada(error):
    """Fallback para rotas inexistentes redirecionando suavemente para a página principal."""
    return redirect(url_for("index"))


if __name__ == "__main__":
    print(f" Servidor Flask Guia do Turista rodando em http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=True)
