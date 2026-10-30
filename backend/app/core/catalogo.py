"""Destinos curados, atrativos históricos e gastronomia regional.

Alimenta os cards de atrativos do roteiro, o contexto do prompt do Gemini e a lista de destinos
que a SPA usa nas sugestões por proximidade (Haversine). Cidades fora do catálogo recebem
atrativos genéricos, e o Gemini completa o restante.
"""

import math
import re
import unicodedata
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Item:
    nome: str
    descricao: str


@dataclass(frozen=True)
class Destino:
    cidade: str
    uf: str
    lat: float
    lon: float
    resumo: str
    atrativos: tuple[Item, ...] = field(default_factory=tuple)
    gastronomia: tuple[Item, ...] = field(default_factory=tuple)


def normalizar(texto: str) -> str:
    """'São Raimundo Nonato' → 'sao raimundo nonato' (sem acento, minúsculas, espaços simples)."""
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", sem_acento).strip().lower()


def slug(texto: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalizar(texto)).strip("-")


DESTINOS: tuple[Destino, ...] = (
    Destino(
        "Teresina",
        "PI",
        -5.089,
        -42.802,
        "Capital do Piauí, entre os rios Poti e Parnaíba.",
        (
            Item("Encontro dos Rios", "Parque onde o Poti deságua no Parnaíba."),
            Item("Ponte Estaiada João Isidoro França", "Cartão-postal da cidade, com mirante."),
            Item(
                "Central de Artesanato Mestre Dezinho", "Artesanato piauiense em madeira e couro."
            ),
        ),
        (
            Item("Maria Isabel", "Arroz com carne de sol."),
            Item("Capote", "Galinha-d'angola ao molho."),
            Item("Cajuína", "Bebida de caju clarificado, patrimônio do Piauí."),
        ),
    ),
    Destino(
        "Piripiri",
        "PI",
        -4.272,
        -41.777,
        "Porta de entrada do Parque Nacional de Sete Cidades.",
        (
            Item("Parque Nacional de Sete Cidades", "Formações rochosas e pinturas rupestres."),
            Item("Açude Caldeirão", "Lazer e banho próximo à cidade."),
        ),
        (
            Item("Paçoca de carne de sol", "Carne de sol pilada com farinha."),
            Item("Cajuína", "Bebida tradicional do Piauí."),
        ),
    ),
    Destino(
        "Parnaíba",
        "PI",
        -2.905,
        -41.776,
        "Litoral do Piauí e porta do Delta do Parnaíba.",
        (
            Item("Delta do Parnaíba", "Único delta em mar aberto das Américas."),
            Item("Porto das Barcas", "Casario histórico às margens do rio."),
            Item("Lagoa do Portinho", "Dunas e lagoa para esportes náuticos."),
        ),
        (
            Item("Caranguejo", "Servido cozido nas barracas do litoral."),
            Item("Peixe frito", "Com baião e farofa."),
        ),
    ),
    Destino(
        "São Raimundo Nonato",
        "PI",
        -9.015,
        -42.699,
        "Base para a Serra da Capivara.",
        (
            Item(
                "Parque Nacional Serra da Capivara", "Maior acervo de arte rupestre das Américas."
            ),
            Item("Museu do Homem Americano", "Achados arqueológicos da região."),
        ),
        (
            Item("Bode assado", "Carne de bode na brasa."),
            Item("Doce de buriti", "Doce do fruto do buriti."),
        ),
    ),
    Destino(
        "Jijoca de Jericoacoara",
        "CE",
        -2.796,
        -40.512,
        "Vila de praia entre dunas e lagoas.",
        (
            Item("Pedra Furada", "Arco de rocha à beira-mar."),
            Item("Duna do Pôr do Sol", "Ponto clássico para o fim de tarde."),
            Item("Lagoa do Paraíso", "Águas claras e redes dentro da lagoa."),
        ),
        (
            Item("Peixe com tapioca", "Peixe grelhado e tapioca."),
            Item("Tapioca recheada", "Vendida nas barracas da vila."),
        ),
    ),
    Destino(
        "Fortaleza",
        "CE",
        -3.717,
        -38.543,
        "Capital cearense de praias urbanas.",
        (
            Item("Praia do Futuro", "Barracas e mar aberto."),
            Item("Mercado Central", "Artesanato, rendas e castanha."),
            Item("Centro Dragão do Mar", "Museus e cinema no centro."),
        ),
        (
            Item("Caranguejada", "Tradição das quintas-feiras."),
            Item("Baião de dois", "Arroz e feijão com queijo coalho."),
        ),
    ),
    Destino(
        "São Luís",
        "MA",
        -2.530,
        -44.306,
        "Centro histórico tombado pela UNESCO.",
        (
            Item("Centro Histórico da Praia Grande", "Casarões com azulejos portugueses."),
            Item("Palácio dos Leões", "Sede do governo estadual."),
        ),
        (
            Item("Arroz de cuxá", "Com vinagreira e camarão seco."),
            Item("Juçara", "Açaí maranhense."),
        ),
    ),
    Destino(
        "Barreirinhas",
        "MA",
        -2.757,
        -42.826,
        "Portão dos Lençóis Maranhenses.",
        (
            Item("Lagoa Azul", "Lagoas de água doce entre dunas."),
            Item("Rio Preguiças", "Passeio de lancha até o mar."),
        ),
        (
            Item("Peixe na brasa", "Pescado do Rio Preguiças."),
            Item("Camarão", "Servido nas barracas do rio."),
        ),
    ),
    Destino(
        "Recife",
        "PE",
        -8.048,
        -34.877,
        "Capital pernambucana de pontes e frevo.",
        (
            Item("Recife Antigo", "Marco Zero e rua do Bom Jesus."),
            Item("Instituto Ricardo Brennand", "Museu em um castelo."),
            Item("Olinda", "Cidade histórica vizinha."),
        ),
        (
            Item("Bolo de rolo", "Patrimônio de Pernambuco."),
            Item("Tapioca", "Clássica nas ladeiras de Olinda."),
        ),
    ),
    Destino(
        "Salvador",
        "BA",
        -12.977,
        -38.501,
        "Primeira capital do Brasil.",
        (
            Item("Pelourinho", "Centro histórico colorido."),
            Item("Elevador Lacerda", "Liga a Cidade Alta à Baixa."),
            Item("Farol da Barra", "Pôr do sol na Baía de Todos-os-Santos."),
        ),
        (
            Item("Acarajé", "Bolinho de feijão-fradinho com vatapá."),
            Item("Moqueca baiana", "Com dendê e leite de coco."),
        ),
    ),
    Destino(
        "Natal",
        "RN",
        -5.795,
        -35.209,
        "Capital potiguar de dunas.",
        (
            Item("Forte dos Reis Magos", "Fortaleza de 1598."),
            Item("Dunas de Genipabu", "Passeio de buggy."),
            Item("Ponta Negra", "Praia com o Morro do Careca."),
        ),
        (
            Item("Carne de sol com macaxeira", "Prato típico do sertão potiguar."),
            Item("Ginga com tapioca", "Peixe frito na tapioca."),
        ),
    ),
    Destino(
        "Rio de Janeiro",
        "RJ",
        -22.907,
        -43.173,
        "Cidade Maravilhosa.",
        (
            Item("Cristo Redentor", "No alto do Corcovado."),
            Item("Pão de Açúcar", "Bondinho com vista da baía."),
            Item("Copacabana", "Orla mais famosa do país."),
        ),
        (
            Item("Feijoada", "Tradição dos sábados."),
            Item("Biscoito de polvilho", "Clássico das praias."),
        ),
    ),
    Destino(
        "Ouro Preto",
        "MG",
        -20.385,
        -43.503,
        "Cidade histórica do ciclo do ouro.",
        (
            Item("Igreja de São Francisco de Assis", "Obra de Aleijadinho."),
            Item("Museu da Inconfidência", "História da Inconfidência Mineira."),
        ),
        (
            Item("Feijão tropeiro", "Com torresmo e couve."),
            Item("Pão de queijo", "Clássico mineiro."),
        ),
    ),
    Destino(
        "Gramado",
        "RS",
        -29.379,
        -50.874,
        "Serra gaúcha de clima europeu.",
        (
            Item("Lago Negro", "Pedalinhos entre hortênsias."),
            Item("Rua Coberta", "Centro de eventos e cafés."),
        ),
        (
            Item("Fondue", "Queijo e chocolate."),
            Item("Chocolate artesanal", "Fábricas abertas à visita."),
        ),
    ),
    Destino(
        "Bonito",
        "MS",
        -21.121,
        -56.482,
        "Ecoturismo de águas cristalinas.",
        (
            Item("Gruta do Lago Azul", "Lago subterrâneo azul intenso."),
            Item("Rio da Prata", "Flutuação entre peixes."),
            Item("Abismo Anhumas", "Rapel até um lago dentro da caverna."),
        ),
        (Item("Pacu assado", "Peixe da região."), Item("Chipa", "Pão de queijo paraguaio.")),
    ),
)

_INDICE = {(normalizar(d.cidade), d.uf): d for d in DESTINOS}


def buscar_destino(cidade: str, uf: str) -> Destino | None:
    return _INDICE.get((normalizar(cidade), uf.upper()))


def atrativos_do_destino(cidade: str, uf: str) -> tuple[list[Item], list[Item]]:
    """(atrativos, gastronomia) do catálogo, ou genéricos para cidades fora dele."""
    destino = buscar_destino(cidade, uf)
    if destino:
        return list(destino.atrativos), list(destino.gastronomia)
    return (
        [
            Item(f"Centro histórico de {cidade}", "Praças, igrejas e o comércio tradicional."),
            Item("Mirantes e paisagens", "Pontos altos e áreas naturais próximas."),
        ],
        [Item("Culinária regional", "Restaurantes de comida típica do estado.")],
    )


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distância em linha reta (km) entre dois pontos da Terra, pela fórmula de Haversine."""
    raio = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * raio * math.asin(math.sqrt(a))
