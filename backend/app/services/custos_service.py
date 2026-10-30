"""Calculadora de custo da viagem: combustível ou energia, pedágios regionais, emissões e rateio.

Os pedágios e os fatores de emissão são estimativas médias (não há API pública de praças de
pedágio): servem para comparar rotas e veículos, não como valor exato a pagar.
"""

from app.schemas.roteiros import CustosInfo, VeiculoCombustao, VeiculoEletrico

# Custo médio de pedágio por km (R$) por região, para carro de passeio.
PEDAGIO_POR_KM_REGIAO = {
    "Sudeste": 0.12,
    "Sul": 0.10,
    "Centro-Oeste": 0.05,
    "Nordeste": 0.03,
    "Norte": 0.01,
}
REGIAO_DA_UF = {
    **dict.fromkeys(["SP", "RJ", "MG", "ES"], "Sudeste"),
    **dict.fromkeys(["PR", "SC", "RS"], "Sul"),
    **dict.fromkeys(["DF", "GO", "MT", "MS"], "Centro-Oeste"),
    **dict.fromkeys(["MA", "PI", "CE", "RN", "PB", "PE", "AL", "SE", "BA"], "Nordeste"),
    **dict.fromkeys(["AC", "AM", "AP", "PA", "RO", "RR", "TO"], "Norte"),
}

# kg de CO2 por litro de gasolina e por kWh da matriz elétrica brasileira (fatores médios).
EMISSAO_KG_POR_LITRO = 2.31
EMISSAO_KG_POR_KWH = 0.0385


def pedagio_estimado(distancia_km: float, origem_uf: str, destino_uf: str) -> float:
    """Média da tarifa por km das regiões de origem e destino, vezes a distância."""
    tarifas = [PEDAGIO_POR_KM_REGIAO[REGIAO_DA_UF[uf]] for uf in (origem_uf, destino_uf)]
    return round(distancia_km * sum(tarifas) / len(tarifas), 2)


def calcular_custos(
    distancia_km: float,
    veiculo: VeiculoCombustao | VeiculoEletrico,
    origem_uf: str,
    destino_uf: str,
    passageiros: int = 1,
    penalizacao_pct: float = 0.0,
) -> CustosInfo:
    """Custo total previsto e a cota de cada passageiro (até 8)."""
    fator_relevo = 1 + penalizacao_pct / 100
    if isinstance(veiculo, VeiculoEletrico):
        quantidade = distancia_km / veiculo.eficiencia_km_kwh * fator_relevo
        custo_energia = quantidade * veiculo.preco_kwh
        emissoes = quantidade * EMISSAO_KG_POR_KWH
        unidade = "kWh"
    else:
        quantidade = distancia_km / veiculo.consumo_km_l * fator_relevo
        custo_energia = quantidade * veiculo.preco_litro
        emissoes = quantidade * EMISSAO_KG_POR_LITRO
        unidade = "litros"

    pedagio = pedagio_estimado(distancia_km, origem_uf, destino_uf)
    total = round(custo_energia + pedagio, 2)
    return CustosInfo(
        propulsao=veiculo.propulsao,
        quantidade_energia=round(quantidade, 1),
        unidade=unidade,
        custo_energia=round(custo_energia, 2),
        custo_pedagio=pedagio,
        custo_total=total,
        passageiros=passageiros,
        por_passageiro=round(total / passageiros, 2),
        emissoes_kg_co2=round(emissoes, 1),
        observacao="Pedágio e emissões são estimativas médias por região.",
    )
