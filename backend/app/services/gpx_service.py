"""Exportação de arquivos GPX 1.1 padronizados com waypoints e relevo.

GPX (GPS Exchange Format) é o XML que navegadores GPS, Strava e Google Earth importam.
Estrutura: <wpt> para origem, destino e paradas; <trk>/<trkseg>/<trkpt> para o traçado,
com <ele> (altitude) quando o perfil de relevo está disponível.
"""

from datetime import UTC, datetime
from typing import Any
from xml.etree import ElementTree as ET

NS_GPX = "http://www.topografix.com/GPX/1/1"
ET.register_namespace("", NS_GPX)


def _tag(nome: str) -> str:
    return f"{{{NS_GPX}}}{nome}"


def _ponto(
    pai: ET.Element,
    tag: str,
    lat: float,
    lon: float,
    nome: str | None = None,
    ele: float | None = None,
    tipo: str | None = None,
) -> ET.Element:
    el = ET.SubElement(pai, _tag(tag), lat=f"{lat:.6f}", lon=f"{lon:.6f}")
    if ele is not None:
        ET.SubElement(el, _tag("ele")).text = f"{ele:.1f}"
    if nome:
        ET.SubElement(el, _tag("name")).text = nome
    if tipo:
        ET.SubElement(el, _tag("type")).text = tipo
    return el


def _altitudes_no_tracado(perfil: list[float], n_pontos: int) -> list[float | None]:
    """Distribui as altitudes amostradas pelos pontos do traçado (interpolação pelo índice)."""
    if not perfil:
        return [None] * n_pontos
    if n_pontos == 1:
        return [perfil[0]]
    return [perfil[round(i * (len(perfil) - 1) / (n_pontos - 1))] for i in range(n_pontos)]


def gerar_gpx(roteiro: dict[str, Any], paradas: list[dict[str, Any]] | None = None) -> str:
    """XML GPX 1.1 do roteiro salvo (origem, destino, paradas e traçado com altitude)."""
    origem, destino = roteiro["origem"], roteiro["destino"]
    nome_trajeto = f"{origem['nome']} → {destino['nome']}"

    gpx = ET.Element(_tag("gpx"), version="1.1", creator="Guia do Turista Inteligente")
    meta = ET.SubElement(gpx, _tag("metadata"))
    ET.SubElement(meta, _tag("name")).text = nome_trajeto
    ET.SubElement(meta, _tag("time")).text = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    _ponto(gpx, "wpt", origem["lat"], origem["lon"], f"Origem: {origem['nome']}", tipo="origem")
    for parada in paradas or []:
        _ponto(
            gpx,
            "wpt",
            parada["lat"],
            parada["lon"],
            f"Parada {parada['ordem']} ({parada['tipo']}) · km {parada['km']:.0f}",
            tipo=parada["tipo"],
        )
    _ponto(
        gpx, "wpt", destino["lat"], destino["lon"], f"Destino: {destino['nome']}", tipo="destino"
    )

    geometria = roteiro.get("rota", {}).get("geometria") or [
        (origem["lat"], origem["lon"]),
        (destino["lat"], destino["lon"]),
    ]
    altitudes = _altitudes_no_tracado(
        roteiro.get("altimetria", {}).get("perfil", []), len(geometria)
    )

    trk = ET.SubElement(gpx, _tag("trk"))
    ET.SubElement(trk, _tag("name")).text = nome_trajeto
    seg = ET.SubElement(trk, _tag("trkseg"))
    for (lat, lon), ele in zip(geometria, altitudes, strict=True):
        _ponto(seg, "trkpt", lat, lon, ele=ele)

    ET.indent(gpx, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(gpx, encoding="unicode")


def nome_arquivo_gpx(roteiro: dict[str, Any]) -> str:
    from app.core.catalogo import slug

    return f"roteiro-{slug(roteiro['origem']['cidade'])}-{slug(roteiro['destino']['cidade'])}.gpx"
