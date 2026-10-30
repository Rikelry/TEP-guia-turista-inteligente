"""Sugestão de abastecimento e recarga EV pela autonomia calculada.

Simula o nível do tanque (ou da bateria) ao longo do traçado e marca uma parada antes que a
reserva chegue ao limite crítico (margem de segurança de 18%). Começa com o tanque cheio e
reabastece até 100% em cada parada.
"""

from app.core.catalogo import haversine_km
from app.schemas.roteiros import AutonomiaInfo, Parada, VeiculoCombustao, VeiculoEletrico

RESERVA_PCT = 18.0


def autonomia_nominal_km(veiculo: VeiculoCombustao | VeiculoEletrico) -> float:
    if isinstance(veiculo, VeiculoEletrico):
        return veiculo.bateria_kwh * veiculo.eficiencia_km_kwh
    return veiculo.tanque_litros * veiculo.consumo_km_l


def calcular_paradas(
    geometria: list[tuple[float, float]],
    veiculo: VeiculoCombustao | VeiculoEletrico,
    penalizacao_pct: float = 0.0,
    distancia_total_km: float | None = None,
) -> AutonomiaInfo:
    """Paradas estratégicas ao longo da rota.

    A distância entre os pontos da geometria é medida por Haversine e corrigida para bater com
    a distância rodoviária do OSRM (as curvas da estrada somem quando a geometria é reduzida).
    """
    nominal = autonomia_nominal_km(veiculo)
    ajustada = nominal / (1 + penalizacao_pct / 100)
    utilizavel = ajustada * (1 - RESERVA_PCT / 100)
    tipo = "eletroposto" if isinstance(veiculo, VeiculoEletrico) else "posto"

    trechos = [haversine_km(*geometria[i], *geometria[i + 1]) for i in range(len(geometria) - 1)]
    soma = sum(trechos)
    escala = (distancia_total_km / soma) if distancia_total_km and soma > 0 else 1.0

    paradas: list[Parada] = []
    km_total = 0.0
    km_desde_abastecer = 0.0
    for i, trecho in enumerate(trechos):
        km_trecho = trecho * escala
        if km_desde_abastecer + km_trecho > utilizavel and km_desde_abastecer > 0:
            lat, lon = geometria[i]
            restante_pct = 100 * (1 - km_desde_abastecer / ajustada)
            paradas.append(
                Parada(
                    ordem=len(paradas) + 1,
                    tipo=tipo,
                    km=round(km_total, 1),
                    lat=lat,
                    lon=lon,
                    nivel_chegada_pct=round(restante_pct, 1),
                )
            )
            km_desde_abastecer = 0.0
        km_total += km_trecho
        km_desde_abastecer += km_trecho

    return AutonomiaInfo(
        autonomia_nominal_km=round(nominal, 1),
        autonomia_ajustada_km=round(ajustada, 1),
        reserva_pct=RESERVA_PCT,
        paradas=paradas,
    )
