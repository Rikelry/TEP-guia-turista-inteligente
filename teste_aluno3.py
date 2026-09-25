import app as modulo

app = modulo.app
app.config["TESTING"] = True


def fake_buscar_coordenadas(client, cidade, uf):
    coordenadas = {
        "Teresina": (-5.08917, -42.80194, "PI"),
        "Brasília": (-15.77972, -47.92972, "DF"),
    }
    return coordenadas.get(cidade, (-5.08917, -42.80194, "PI"))


def fake_obter_clima(client, latitude, longitude):
    return {
        "temperatura": "30.0 °C",
        "umidade": "60%",
        "vento": "10.0 km/h",
    }


def fake_obter_percurso(client, lat_o, lon_o, lat_d, lon_d):
    return {
        "distancia": "10.0 km",
        "tempo": "15 min de carro",
        "modal": "carro",
    }


def fake_obter_guia(destino):
    return (
        "🌎 GUIA DO DESTINO\n"
        f"📍 Pontos turísticos de {destino}\n"
        "🍴 Experimente pratos regionais.\n"
        "🏛️ Visite pontos turísticos locais."
    ), {
        "status": "sucesso",
        "modelo": "gemini-3.6-flash",
        "fallback_utilizado": False,
        "motivo": None,
    }


# Substitui temporariamente as APIs externas durante o teste.
modulo.buscar_coordenadas = fake_buscar_coordenadas
modulo.obter_clima = fake_obter_clima
modulo.obter_percurso = fake_obter_percurso
modulo.obter_guia_destino_com_diagnostico = fake_obter_guia


def verificar(nome, condicao, detalhe=""):
    status = "OK" if condicao else "FALHOU"
    print(f"[{status}] {nome}")
    if detalhe:
        print(f"      {detalhe}")
    assert condicao


with app.test_client() as client:

    # 1. Página inicial
    resposta = client.get("/")
    verificar(
        "GET /",
        resposta.status_code == 200,
        f"status={resposta.status_code}",
    )

    # 2. Criar sem estar logado
    resposta = client.post(
        "/viagens/criar",
        data={
            "origem_cidade": "Teresina",
            "origem_uf": "PI",
            "destino_cidade": "Brasília",
            "destino_uf": "DF",
        },
    )
    verificar(
        "POST /viagens/criar sem login",
        resposta.status_code == 302,
        f"status={resposta.status_code}, location={resposta.location}",
    )

    # 3. Login de visitante
    resposta = client.get("/auth/demo")
    verificar(
        "GET /auth/demo",
        resposta.status_code == 302,
        f"location={resposta.location}",
    )

    with client.session_transaction() as sess:
        usuario = sess["usuario"]
        user_id = usuario["id"]

    verificar(
        "Sessão de visitante criada",
        usuario["tipo"] == "visitante",
        f"usuario={usuario}",
    )

    # 4. Criar viagem
    resposta = client.post(
        "/viagens/criar",
        data={
            "origem_cidade": "Teresina",
            "origem_uf": "RJ",
            "destino_cidade": "Brasília",
            "destino_uf": "DF",
        },
    )

    verificar(
        "Criar primeira viagem",
        resposta.status_code == 302,
        f"status={resposta.status_code}, location={resposta.location}",
    )

    viagens = modulo.obter_viagens_usuario(user_id)

    verificar(
        "Viagem foi armazenada",
        len(viagens) == 1,
        f"quantidade={len(viagens)}",
    )

    viagem = viagens[0]

    verificar(
        "UF da origem corrigida para PI",
        viagem["origem"] == "Teresina, PI",
        f"origem={viagem['origem']}",
    )

    verificar(
        "Destino armazenado",
        viagem["destino"] == "Brasília, DF",
        f"destino={viagem['destino']}",
    )

    verificar(
        "Clima integrado",
        viagem["clima"]["temperatura"] == "30.0 °C",
        f"clima={viagem['clima']}",
    )

    verificar(
        "Percurso integrado",
        viagem["percurso"]["modal"] == "carro",
        f"percurso={viagem['percurso']}",
    )

    verificar(
        "Guia integrado",
        "Brasília, DF" in viagem["dicas_destino"],
        "guia recebido",
    )

    verificar(
        "Diagnóstico do guia armazenado",
        viagem["diagnostico_guia"]["status"] == "sucesso",
        f"diagnostico={viagem['diagnostico_guia']}",
    )

    # 5. Idempotência por conteúdo
    resposta = client.post(
        "/viagens/criar",
        data={
            "origem_cidade": "Teresina",
            "origem_uf": "PI",
            "destino_cidade": "Brasília",
            "destino_uf": "DF",
        },
    )

    viagens_depois = modulo.obter_viagens_usuario(user_id)

    verificar(
        "Não duplica viagem existente",
        len(viagens_depois) == 1,
        f"quantidade={len(viagens_depois)}",
    )

    # 6. Endpoint JSON
    resposta = client.get("/api/viagens")
    dados = resposta.get_json()

    verificar(
        "GET /api/viagens",
        resposta.status_code == 200,
        f"status={resposta.status_code}",
    )

    verificar(
        "JSON contém visitante",
        user_id in dados["usuarios"],
        f"usuarios={list(dados['usuarios'])}",
    )

    verificar(
        "JSON contém 1 roteiro",
        dados["total_roteiros"] == 1,
        f"total_roteiros={dados['total_roteiros']}",
    )

    # 7. Exclusão
    viagem_id = viagem["id"]

    resposta = client.post(
        f"/viagens/deletar/{viagem_id}"
    )

    viagens_finais = modulo.obter_viagens_usuario(user_id)

    verificar(
        "Excluir viagem",
        resposta.status_code == 302,
        f"status={resposta.status_code}",
    )

    verificar(
        "Viagem realmente removida",
        len(viagens_finais) == 0,
        f"quantidade={len(viagens_finais)}",
    )

    # 8. 404
    resposta = client.get("/rota-que-nao-existe")

    verificar(
        "Rota inexistente retorna redirect",
        resposta.status_code == 302,
        f"status={resposta.status_code}, location={resposta.location}",
    )

    # 9. 405
    resposta = client.get("/viagens/criar")

    verificar(
        "Método incorreto retorna redirect",
        resposta.status_code == 302,
        f"status={resposta.status_code}, location={resposta.location}",
    )

    # 10. Logout
    resposta = client.get("/auth/logout")

    verificar(
        "Logout",
        resposta.status_code == 302,
        f"location={resposta.location}",
    )

    with client.session_transaction() as sess:
        usuario_depois_logout = sess.get("usuario")

    verificar(
        "Sessão encerrada",
        usuario_depois_logout is None,
        f"usuario={usuario_depois_logout}",
    )


print("\nTeste do Aluno 3 concluído com sucesso.")