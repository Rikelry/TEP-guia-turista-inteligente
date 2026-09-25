import tempfile
from pathlib import Path

import app as modulo


def verificar(nome, condicao, detalhe=""):
    status = "OK" if condicao else "FALHOU"
    print(f"[{status}] {nome}")
    if detalhe:
        print(f"      {detalhe}")
    assert condicao


# Usa um arquivo temporário para não modificar a base real.
arquivo_original = modulo.VIAGENS_FILE

with tempfile.TemporaryDirectory() as pasta_temp:
    modulo.VIAGENS_FILE = Path(pasta_temp) / "viagens.json"

    # 1. Arquivo inexistente deve gerar estrutura padrão
    dados = modulo.carregar_dados_viagens_json()

    verificar(
        "Estrutura padrão criada",
        dados["versao_schema"] == "1.0",
        f"schema={dados['versao_schema']}",
    )

    verificar(
        "Base começa sem usuários",
        dados["total_usuarios"] == 0,
        f"total_usuarios={dados['total_usuarios']}",
    )

    verificar(
        "Base começa sem roteiros",
        dados["total_roteiros"] == 0,
        f"total_roteiros={dados['total_roteiros']}",
    )

    # 2. Sanitização
    entrada = "  <script>alert('x')</script>  Teresina   PI  \n  "
    resultado = modulo.sanitizar_entrada(entrada)

    verificar(
        "Remove tags HTML",
        "<script>" not in resultado and "</script>" not in resultado,
        f"resultado={resultado!r}",
    )

    verificar(
        "Remove espaços extras",
        "  " not in resultado,
        f"resultado={resultado!r}",
    )

    verificar(
        "Remove caracteres de controle",
        "\n" not in resultado and "\x00" not in resultado,
        f"resultado={resultado!r}",
    )

    # 3. Limite de tamanho
    texto_longo = "A" * 200
    resultado_longo = modulo.sanitizar_entrada(texto_longo, max_len=80)

    verificar(
        "Limita tamanho da entrada",
        len(resultado_longo) == 80,
        f"tamanho={len(resultado_longo)}",
    )

    # 4. Persistência de usuário
    user_id = "google:teste123"

    viagem = {
        "id": "viagem_teste_001",
        "nome": "Teresina",
        "uf": "PI",
        "latitude": -5.08917,
        "longitude": -42.80194,
        "clima": {
            "temperatura": "30.0 °C",
            "umidade": "60%",
            "vento": "10.0 km/h",
        },
        "percurso": {
            "distancia": "10 km",
            "tempo": "15 min",
            "modal": "carro",
        },
        "guia_destino": "Guia de teste",
        "criado_em": "2026-09-25T12:00:00+00:00",
    }

    perfil = {
        "nome": "Usuário Teste",
        "email": "teste@example.com",
    }

    modulo.adicionar_viagem_usuario(
        user_id,
        viagem,
        perfil_usuario=perfil,
    )

    verificar(
        "Arquivo JSON foi criado",
        modulo.VIAGENS_FILE.exists(),
        f"arquivo={modulo.VIAGENS_FILE}",
    )

    dados = modulo.carregar_dados_viagens_json()

    verificar(
        "Usuário foi persistido",
        user_id in dados["usuarios"],
        f"usuarios={list(dados['usuarios'])}",
    )

    verificar(
        "Perfil do usuário foi persistido",
        dados["usuarios"][user_id]["nome"] == "Usuário Teste",
        f"nome={dados['usuarios'][user_id]['nome']}",
    )

    verificar(
        "Roteiro foi persistido",
        len(dados["usuarios"][user_id]["roteiros"]) == 1,
        f"roteiros={len(dados['usuarios'][user_id]['roteiros'])}",
    )

    verificar(
        "Contadores foram atualizados",
        dados["total_usuarios"] == 1 and dados["total_roteiros"] == 1,
        f"usuarios={dados['total_usuarios']}, roteiros={dados['total_roteiros']}",
    )

    # 5. Leitura do roteiro
    viagens = modulo.obter_viagens_usuario(user_id)

    verificar(
        "Leitura recupera o roteiro",
        len(viagens) == 1 and viagens[0]["id"] == "viagem_teste_001",
        f"viagens={len(viagens)}",
    )

    # 6. Exclusão
    modulo.remover_viagem_usuario(
        user_id,
        "viagem_teste_001",
    )

    viagens_depois = modulo.obter_viagens_usuario(user_id)

    verificar(
        "Roteiro pode ser removido",
        len(viagens_depois) == 0,
        f"roteiros_restantes={len(viagens_depois)}",
    )

    dados = modulo.carregar_dados_viagens_json()

    verificar(
        "Contador de roteiros atualizado após exclusão",
        dados["total_roteiros"] == 0,
        f"total_roteiros={dados['total_roteiros']}",
    )

    # 7. Endpoint JSON
    with modulo.app.test_client() as client:
        resposta = client.get("/api/viagens")

        verificar(
            "Endpoint /api/viagens responde",
            resposta.status_code == 200,
            f"status={resposta.status_code}",
        )

        dados_api = resposta.get_json()

        verificar(
            "Endpoint retorna JSON válido",
            isinstance(dados_api, dict),
            f"tipo={type(dados_api).__name__}",
        )

    # 8. 404
    with modulo.app.test_client() as client:
        resposta = client.get("/essa-rota-nao-existe")

        verificar(
            "404 é tratado",
            resposta.status_code == 302,
            f"status={resposta.status_code}, location={resposta.location}",
        )

    # 9. 405
    with modulo.app.test_client() as client:
        resposta = client.get("/viagens/criar")

        verificar(
            "405 é tratado",
            resposta.status_code == 302,
            f"status={resposta.status_code}, location={resposta.location}",
        )


modulo.VIAGENS_FILE = arquivo_original

print("\nTeste do Aluno 4 concluído com sucesso.")
