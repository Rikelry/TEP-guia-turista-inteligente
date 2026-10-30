"""/api/v1/roteiros: planejamento concorrente, mapa com alternativas, guia em streaming,
custos, exportação GPX, histórico, visitas e compartilhamento."""

import asyncio
import logging
import time
from collections.abc import Awaitable
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from app.core.catalogo import DESTINOS, atrativos_do_destino, slug
from app.core.circuit_breaker import obter_breaker
from app.core.dependencies import HttpClient, UsuarioAtivo
from app.core.metricas import metricas
from app.schemas.auth import UsuarioPerfil
from app.schemas.roteiros import (
    AltimetriaInfo,
    AtrativoItem,
    ClimaInfo,
    CompartilharRequest,
    CustosInfo,
    CustosRequest,
    GpxRequest,
    GuiaStreamRequest,
    LocalInfo,
    MapaRotaRequest,
    MapaRotaResponse,
    ProvedorTelemetria,
    RotaAlternativa,
    RoteiroRequest,
    RoteiroResponse,
    VisitaUpdate,
)
from app.services import storage_service
from app.services.altimetria_service import (
    altimetria_fallback,
    montar_altimetria,
    obter_perfil_altimetrico_async,
)
from app.services.clima_service import (
    buscar_coordenadas_async,
    clima_fallback,
    local_fallback,
    obter_clima_async,
)
from app.services.custos_service import calcular_custos
from app.services.gemini_service import combinar_perfis, eventos_sse_guia, gerar_guia_ia_async
from app.services.gpx_service import gerar_gpx, nome_arquivo_gpx
from app.services.postos_service import calcular_paradas
from app.services.rota_service import (
    RotaCalculada,
    SemRotaRodoviaria,
    calcular_rota_osrm_async,
    calcular_rotas_osrm_async,
    para_rota_info,
    rota_fallback,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/roteiros", tags=["Roteiros"])

# Idempotência: o mesmo usuário não dispara duas vezes o mesmo roteiro ao mesmo tempo.
REQUISICOES_ATIVAS: set[str] = set()
lock_requisicoes = asyncio.Lock()


# ---------------------------------------------------------------------------
# Auxiliares
# ---------------------------------------------------------------------------


async def _executar_cronometrado[T](coro: Awaitable[T]) -> tuple[T, float]:
    """Executa a corrotina e devolve (resultado, tempo em ms) para a telemetria por provedor."""
    inicio = time.perf_counter()
    resultado = await coro
    return resultado, round((time.perf_counter() - inicio) * 1000, 1)


async def _abortar_se_desconectado(request: Request) -> None:
    """Cliente fechou a aba ou trocou de destino: interrompe o pipeline e não salva nada."""
    if await request.is_disconnected():
        raise HTTPException(status_code=499, detail="Requisição cancelada pelo cliente.")


def _persistente(usuario: UsuarioPerfil) -> bool:
    """Só viagens de usuários Google vão para o JSON; as de visitante ficam em memória."""
    return usuario.tipo == "google"


async def geocodificar(client: HttpClient, cidade: str, uf: str) -> tuple[LocalInfo, bool]:
    async def chamar() -> LocalInfo:
        try:
            return await buscar_coordenadas_async(client, cidade, uf)
        except LookupError:
            # Cidade inexistente na UF não é falha do provedor: não abre o circuito.
            return local_fallback(cidade, uf)

    return await obter_breaker("geocoding").chamar(chamar, lambda: local_fallback(cidade, uf))


async def consultar_clima(client: HttpClient, local: LocalInfo) -> tuple[ClimaInfo, bool]:
    if local.lat == 0.0 and local.lon == 0.0:
        return clima_fallback(), True
    return await obter_breaker("clima").chamar(
        lambda: obter_clima_async(client, local.lat, local.lon), clima_fallback
    )


async def consultar_rota(
    client: HttpClient, origem: LocalInfo, destino: LocalInfo, preferencia: str
) -> tuple[RotaCalculada | None, bool]:
    async def chamar() -> RotaCalculada | None:
        try:
            return await calcular_rota_osrm_async(
                client,
                origem.lat,
                origem.lon,
                destino.lat,
                destino.lon,
                preferencia_rota=preferencia,
            )
        except SemRotaRodoviaria:
            # Ilha ou travessia: resposta válida do OSRM, não deve abrir o circuito.
            return None

    return await obter_breaker("rota").chamar(chamar, lambda: None)


async def consultar_altimetria(
    client: HttpClient, rota: RotaCalculada, propulsao: str
) -> AltimetriaInfo:
    perfil, fallback = await obter_breaker("elevacao").chamar(
        lambda: obter_perfil_altimetrico_async(client, rota.geometria), lambda: []
    )
    if fallback or not perfil:
        return altimetria_fallback()
    return montar_altimetria(perfil, rota.distancia_km, propulsao)


# ---------------------------------------------------------------------------
# Planejamento
# ---------------------------------------------------------------------------


@router.post(
    "/planejar",
    response_model=RoteiroResponse,
    summary="Planeja o roteiro (orquestração concorrente)",
)
async def planejar_roteiro(
    payload: RoteiroRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    client: HttpClient,
    usuario: UsuarioAtivo,
) -> RoteiroResponse:
    chave_requisicao = (
        f"{usuario.user_id}:{payload.origem_cidade}_{payload.origem_uf}"
        f"->{payload.destino_cidade}_{payload.destino_uf}"
    ).lower()

    async with lock_requisicoes:
        if chave_requisicao in REQUISICOES_ATIVAS:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe uma requisição em andamento para este mesmo roteiro. "
                "Aguarde a conclusão da consulta ativa.",
            )
        REQUISICOES_ATIVAS.add(chave_requisicao)

    try:
        await _abortar_se_desconectado(request)

        # Estágio 1: geocodificação paralela de origem e destino.
        ((origem, fb_origem), t_origem), ((destino, fb_destino), t_destino) = await asyncio.gather(
            _executar_cronometrado(geocodificar(client, payload.origem_cidade, payload.origem_uf)),
            _executar_cronometrado(
                geocodificar(client, payload.destino_cidade, payload.destino_uf)
            ),
        )
        await _abortar_se_desconectado(request)

        # Estágio 2: clima no destino e rota rodoviária ao mesmo tempo.
        ((clima, fb_clima), t_clima), ((rota_calc, fb_rota), t_rota) = await asyncio.gather(
            _executar_cronometrado(consultar_clima(client, destino)),
            _executar_cronometrado(
                consultar_rota(client, origem, destino, payload.preferencia_rota)
            ),
        )
        await _abortar_se_desconectado(request)

        # Estágio 3: guia do Gemini alimentado pelo clima real e pelo catálogo.
        atrativos, gastronomia = atrativos_do_destino(destino.cidade, destino.uf)
        (guia, diag_ia), t_ia = await _executar_cronometrado(
            gerar_guia_ia_async(
                destino=destino.nome,
                dias_estadia=payload.dias_estadia,
                estilo_viagem=combinar_perfis(payload.estilo_viagem, payload.perfis),
                clima_info=clima,
                atrativos=[a.nome for a in atrativos],
                gastronomia=[g.nome for g in gastronomia],
            )
        )
        await _abortar_se_desconectado(request)
    finally:
        async with lock_requisicoes:
            REQUISICOES_ATIVAS.discard(chave_requisicao)

    resposta = RoteiroResponse(
        id=uuid4().hex,
        criado_em=datetime.now(UTC),
        origem=origem,
        destino=destino,
        dias_estadia=payload.dias_estadia,
        estilo_viagem=payload.estilo_viagem,
        perfis=payload.perfis or [payload.estilo_viagem],
        clima=clima,
        rota=para_rota_info(rota_calc) if rota_calc else rota_fallback(),
        guia=guia,
        guia_fallback=diag_ia["fallback"],
        atrativos=[
            AtrativoItem(id=f"{tipo}-{slug(i.nome)}", nome=i.nome, descricao=i.descricao, tipo=tipo)
            for tipo, itens in (("atrativo", atrativos), ("gastronomia", gastronomia))
            for i in itens
        ],
        provedores={
            "geocoding": ProvedorTelemetria(
                tempo_ms=max(t_origem, t_destino), fallback=fb_origem or fb_destino
            ),
            "clima": ProvedorTelemetria(tempo_ms=t_clima, fallback=fb_clima),
            "rota": ProvedorTelemetria(tempo_ms=t_rota, fallback=fb_rota or rota_calc is None),
            "gemini": ProvedorTelemetria(tempo_ms=t_ia, fallback=diag_ia["fallback"]),
        },
    )
    metricas.roteiro_gerado()

    # Persistência em segundo plano: a resposta sai sem esperar o disco.
    background_tasks.add_task(
        storage_service.salvar_nova_viagem,
        usuario.user_id,
        resposta.model_dump(mode="json"),
        _persistente(usuario),
    )
    return resposta


@router.post(
    "/mapa-rota",
    response_model=MapaRotaResponse,
    summary="Geometria, rotas alternativas, relevo, paradas e custos",
)
async def mapa_rota(
    payload: MapaRotaRequest, client: HttpClient, _usuario: UsuarioAtivo
) -> MapaRotaResponse:
    async def chamar() -> list[RotaCalculada]:
        try:
            return await calcular_rotas_osrm_async(
                client,
                payload.origem.lat,
                payload.origem.lon,
                payload.destino.lat,
                payload.destino.lon,
                alternativas=payload.alternativas,
            )
        except SemRotaRodoviaria:
            return []

    rotas, _ = await obter_breaker("rota").chamar(chamar, list)
    if not rotas:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Não há rota rodoviária entre esses pontos."
        )

    rotas = rotas[:2]
    altimetrias = await asyncio.gather(
        *(consultar_altimetria(client, r, payload.veiculo.propulsao) for r in rotas)
    )
    mais_curta = min(range(len(rotas)), key=lambda i: rotas[i].distancia_km)

    alternativas: list[RotaAlternativa] = []
    for i, (rota, alt) in enumerate(zip(rotas, altimetrias, strict=True)):
        rotulo = f"Sugestão {i + 1:02d} · " + (
            "Menor tempo" if i == 0 else "Mais econômica" if i == mais_curta else "Alternativa"
        )
        alternativas.append(
            RotaAlternativa(
                indice=i,
                rotulo=rotulo,
                rota=para_rota_info(rota),
                altimetria=alt,
                autonomia=calcular_paradas(
                    rota.geometria, payload.veiculo, alt.penalizacao_pct, rota.distancia_km
                ),
                custos=calcular_custos(
                    rota.distancia_km,
                    payload.veiculo,
                    payload.origem_uf,
                    payload.destino_uf,
                    payload.passageiros,
                    alt.penalizacao_pct,
                ),
            )
        )
    return MapaRotaResponse(rotas=alternativas)


@router.post(
    "/custos",
    response_model=CustosInfo,
    summary="Calculadora de combustível/energia, pedágio e rateio",
)
async def custos(payload: CustosRequest) -> CustosInfo:
    return calcular_custos(
        payload.distancia_km,
        payload.veiculo,
        payload.origem_uf,
        payload.destino_uf,
        payload.passageiros,
        payload.penalizacao_pct,
    )


@router.post("/stream-guia", summary="Geração do guia por IA em streaming (SSE)")
async def stream_guia_ia(payload: GuiaStreamRequest, request: Request) -> StreamingResponse:
    """Server-Sent Events: cada evento é `data: {"chunk": "...", "done": false}`."""
    return StreamingResponse(
        eventos_sse_guia(
            request,
            destino=payload.destino,
            dias_estadia=payload.dias_estadia,
            estilo_viagem=combinar_perfis(payload.estilo_viagem, payload.perfis),
            clima_info=payload.clima_info,
            atrativos=payload.atrativos,
            gastronomia=payload.gastronomia,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/exportar/gpx", summary="Download do roteiro salvo em GPX 1.1")
async def exportar_gpx(payload: GpxRequest, usuario: UsuarioAtivo) -> Response:
    roteiro = await storage_service.buscar_viagem(
        usuario.user_id, payload.roteiro_id, _persistente(usuario)
    )
    if roteiro is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Roteiro não encontrado.")
    return Response(
        content=gerar_gpx(roteiro),
        media_type="application/gpx+xml",
        headers={"Content-Disposition": f'attachment; filename="{nome_arquivo_gpx(roteiro)}"'},
    )


# ---------------------------------------------------------------------------
# Histórico
# ---------------------------------------------------------------------------


@router.get("/minhas-viagens", summary="Viagens salvas do usuário ativo (X-User-Id)")
async def minhas_viagens(usuario: UsuarioAtivo) -> list[dict[str, Any]]:
    return await storage_service.listar_viagens(usuario.user_id, _persistente(usuario))


@router.delete(
    "/{roteiro_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Exclui um roteiro salvo"
)
async def excluir_roteiro(roteiro_id: str, usuario: UsuarioAtivo) -> Response:
    if not await storage_service.remover_viagem(usuario.user_id, roteiro_id, _persistente(usuario)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Roteiro não encontrado.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{roteiro_id}/visitas", summary="Marca um atrativo como visitado")
async def marcar_visita(
    roteiro_id: str, payload: VisitaUpdate, usuario: UsuarioAtivo
) -> dict[str, Any]:
    try:
        roteiro = await storage_service.marcar_visita(
            usuario.user_id,
            roteiro_id,
            payload.atrativo_id,
            payload.visitado,
            _persistente(usuario),
        )
    except KeyError as erro:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Atrativo não existe neste roteiro."
        ) from erro
    if roteiro is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Roteiro não encontrado.")
    return roteiro


async def despachar_compartilhamento_background(
    roteiro_id: str, canal: str, destinatario: str
) -> None:
    """Simula o envio (webhook/e-mail) sem atrasar a resposta. Aqui entraria a integração real."""
    await asyncio.sleep(0)
    logger.info("Roteiro %s compartilhado via %s com %s", roteiro_id, canal, destinatario)


@router.post(
    "/{roteiro_id}/compartilhar",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Compartilha em segundo plano",
)
async def compartilhar(
    roteiro_id: str,
    payload: CompartilharRequest,
    background_tasks: BackgroundTasks,
    usuario: UsuarioAtivo,
) -> dict[str, str]:
    roteiro = await storage_service.buscar_viagem(
        usuario.user_id, roteiro_id, _persistente(usuario)
    )
    if roteiro is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Roteiro não encontrado.")
    resumo = (
        f"Roteiro {roteiro['origem']['nome']} → {roteiro['destino']['nome']}: "
        f"{roteiro['rota']['resumo']}. Clima: {roteiro['clima']['condicao']}."
    )
    background_tasks.add_task(
        despachar_compartilhamento_background,
        roteiro_id=roteiro_id,
        canal=payload.canal,
        destinatario=payload.destinatario or "contato@guiadoturista.com.br",
    )
    return {"status": "agendado", "link_whatsapp": f"https://wa.me/?text={quote(resumo)}"}


@router.get("/destinos", summary="Catálogo de destinos curados (para sugestões por proximidade)")
async def destinos() -> list[dict[str, Any]]:
    return [
        {"cidade": d.cidade, "uf": d.uf, "lat": d.lat, "lon": d.lon, "resumo": d.resumo}
        for d in DESTINOS
    ]
