"""Geração do Guia do Viajante com o Google Gemini, inteira ou em streaming SSE.

O prompt segue a diretriz de concisão do projeto: uma frase de identidade, um roteiro por turno,
uma frase de gastronomia e uma de clima, para leitura rápida no celular. Sem chave, com cota
esgotada ou timeout, entra um guia de contingência montado com o catálogo e o clima real.
"""

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator
from typing import Any

from fastapi import Request
from google import genai
from google.genai import types

from app.core.circuit_breaker import obter_breaker
from app.core.config import obter_settings
from app.schemas.roteiros import ClimaInfo

logger = logging.getLogger(__name__)

INSTRUCAO_SISTEMA = (
    "Você é um assistente de bordo ágil e ultraobjetivo para viagens no Brasil. "
    "Escreva em português do Brasil, em texto puro, sem markdown, sem asteriscos, sem títulos "
    "em negrito, sem saudações e sem adjetivação excessiva."
)

ESTILOS = {
    "cultural": "cultural (história, museus, patrimônio)",
    "gastronomico": "gastronômico (comida típica, mercados)",
    "ecoturismo": "ecoturismo e aventura (natureza, trilhas)",
    "familia": "família (programas para todas as idades)",
    "romantico": "romântico e econômico (lugares tranquilos e baratos)",
}


def combinar_perfis(estilo_viagem: str, perfis: list[str]) -> str:
    """Perfis escolhidos (sem repetir, na ordem) unidos por '+'; só o estilo se a lista vier vazia."""
    return "+".join(dict.fromkeys(perfis or [estilo_viagem]))


def descrever_perfis(estilo_viagem: str) -> str:
    """'cultural+gastronomico' → descrição legível de cada perfil."""
    return " e ".join(ESTILOS.get(e, e) for e in estilo_viagem.split("+"))


def descrever_clima(clima: ClimaInfo | None) -> str:
    if not clima or not clima.disponivel:
        return "clima indisponível no momento"
    partes = [f"{clima.temperatura_c:.0f} °C", clima.condicao.lower()]
    if clima.sensacao_c is not None:
        partes.append(f"sensação de {clima.sensacao_c:.0f} °C")
    if clima.vento_kmh is not None:
        partes.append(f"vento de {clima.vento_kmh:.0f} km/h")
    return ", ".join(partes)


def montar_prompt(
    destino: str,
    dias_estadia: int,
    estilo_viagem: str,
    clima: ClimaInfo | None,
    atrativos: list[str],
    gastronomia: list[str],
) -> str:
    turnos = "Manhã, Tarde e Noite" if dias_estadia == 1 else f"Dia 1 a Dia {dias_estadia}"
    return (
        f"Destino: {destino}. Estadia: {dias_estadia} dia(s). "
        f"Perfil: {descrever_perfis(estilo_viagem)}. "
        f"Clima agora: {descrever_clima(clima)}. "
        f"Atrativos conhecidos: {', '.join(atrativos) or 'não informados'}. "
        f"Gastronomia conhecida: {', '.join(gastronomia) or 'não informada'}.\n\n"
        "Responda exatamente em 4 blocos, cada um começando pelo rótulo e um emoji:\n"
        "📍 IDENTIDADE: 1 frase de no máximo 20 palavras com a essência cultural e histórica.\n"
        f"🗓️ ROTEIRO: uma linha por turno ({turnos}), cada uma com 1 frase de ação de no "
        "máximo 15 palavras.\n"
        "🍽️ GASTRONOMIA: 1 frase com 2 ou 3 pratos emblemáticos e onde provar.\n"
        "🌤️ CLIMA E DICAS: 1 frase ligando o clima informado à roupa e aos melhores horários."
    )


def limpar_formato_texto(texto: str) -> str:
    """Remove markdown residual (*, _, `, #) e linhas de saudação, mantendo os emojis."""
    sem_marcacao = re.sub(r"[*_`#]+", "", texto)
    saudacao = re.compile(
        r"^(ol[aá]|oi|claro|com certeza|certamente|aqui est[aá]|segue|perfeito)\b", re.IGNORECASE
    )
    linhas = [ln.rstrip() for ln in sem_marcacao.splitlines() if not saudacao.match(ln.strip())]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(linhas)).strip()


def guia_contingencia(
    destino: str,
    dias_estadia: int,
    clima: ClimaInfo | None,
    atrativos: list[str],
    gastronomia: list[str],
) -> str:
    """Guia montado sem IA, com os dados reais do catálogo e do clima."""
    a = atrativos or [f"o centro histórico de {destino}"]
    linhas = [
        f"📍 IDENTIDADE: {destino} combina história local, paisagens e cultura regional.",
        "🗓️ ROTEIRO:",
    ]
    for dia in range(1, dias_estadia + 1):
        linhas.append(f"Dia {dia}: conheça {a[(dia - 1) % len(a)]} e explore os arredores.")
    pratos = ", ".join(gastronomia[:3]) if gastronomia else "pratos regionais"
    linhas.append(f"🍽️ GASTRONOMIA: prove {pratos} nos restaurantes tradicionais da cidade.")
    if clima and clima.disponivel and clima.temperatura_c is not None:
        dica = "roupas leves e protetor solar" if clima.temperatura_c >= 26 else "um agasalho leve"
        linhas.append(f"🌤️ CLIMA E DICAS: {descrever_clima(clima)}; leve {dica}.")
    else:
        linhas.append("🌤️ CLIMA E DICAS: confira a previsão antes de sair e leve água.")
    return "\n".join(linhas)


def _cliente() -> genai.Client:
    return genai.Client(api_key=obter_settings().gemini_api_key)


def _config_geracao() -> types.GenerateContentConfig:
    # thinking_budget=0: sem isso o modelo gasta quase todo o limite "pensando" e o guia sai
    # cortado (finish_reason=MAX_TOKENS). O guia é curto e objetivo, não precisa de raciocínio.
    return types.GenerateContentConfig(
        system_instruction=INSTRUCAO_SISTEMA,
        temperature=0.6,
        max_output_tokens=1024,
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )


async def gerar_guia_ia_async(
    destino: str,
    dias_estadia: int,
    estilo_viagem: str,
    clima_info: ClimaInfo | None,
    atrativos: list[str],
    gastronomia: list[str],
) -> tuple[str, dict[str, Any]]:
    """Guia completo numa chamada. Devolve (texto, diagnóstico). Nunca lança: cai na contingência."""
    config = obter_settings()
    diagnostico: dict[str, Any] = {"modelo": config.gemini_modelo, "fallback": False}

    def contingencia() -> str:
        return guia_contingencia(destino, dias_estadia, clima_info, atrativos, gastronomia)

    if not config.gemini_api_key:
        diagnostico.update(fallback=True, motivo="chave_ausente")
        return contingencia(), diagnostico

    async def chamar() -> str:
        resposta = await asyncio.wait_for(
            _cliente().aio.models.generate_content(
                model=config.gemini_modelo,
                contents=montar_prompt(
                    destino, dias_estadia, estilo_viagem, clima_info, atrativos, gastronomia
                ),
                config=_config_geracao(),
            ),
            timeout=config.gemini_timeout_segundos,
        )
        if not resposta.text:
            raise ValueError("Gemini devolveu resposta vazia")
        return limpar_formato_texto(resposta.text)

    texto, usou_fallback = await obter_breaker("gemini").chamar(chamar, contingencia)
    if usou_fallback:
        diagnostico.update(
            fallback=True, motivo=obter_breaker("gemini").ultimo_erro or "circuito_aberto"
        )
    return texto, diagnostico


async def gerar_guia_ia_stream_async(
    destino: str,
    dias_estadia: int,
    estilo_viagem: str,
    clima_info: ClimaInfo | None,
    atrativos: list[str],
    gastronomia: list[str],
) -> AsyncIterator[str]:
    """Fragmentos de texto do Gemini conforme o modelo escreve.

    Sem chave, ou se o Gemini falhar antes do primeiro fragmento, transmite o guia de
    contingência linha a linha, para a interface ter o mesmo comportamento progressivo.
    """
    config = obter_settings()
    breaker = obter_breaker("gemini")

    async def contingencia() -> AsyncIterator[str]:
        for linha in guia_contingencia(
            destino, dias_estadia, clima_info, atrativos, gastronomia
        ).splitlines():
            yield linha + "\n"
            await asyncio.sleep(0)

    if not config.gemini_api_key or breaker.status()["estado"] == "aberto":
        async for parte in contingencia():
            yield parte
        return

    enviou_algo = False
    try:
        fluxo = await asyncio.wait_for(
            _cliente().aio.models.generate_content_stream(
                model=config.gemini_modelo,
                contents=montar_prompt(
                    destino, dias_estadia, estilo_viagem, clima_info, atrativos, gastronomia
                ),
                config=_config_geracao(),
            ),
            timeout=config.gemini_timeout_segundos,
        )
        async for pedaco in fluxo:
            if pedaco.text:
                enviou_algo = True
                yield re.sub(r"[*_`#]+", "", pedaco.text)
        await breaker.registrar_sucesso()
    except asyncio.CancelledError:
        raise
    except Exception as erro:  # noqa: BLE001 - o streaming nunca deve terminar com erro cru
        await breaker.registrar_falha(erro)
        logger.warning("Falha no streaming do Gemini: %s", erro)
        if not enviou_algo:
            async for parte in contingencia():
                yield parte


def evento_sse(dados: dict[str, Any]) -> str:
    """Formata um evento Server-Sent Events: 'data: <json>' seguido de linha em branco."""
    return f"data: {json.dumps(dados, ensure_ascii=False)}\n\n"


async def eventos_sse_guia(
    request: Request,
    destino: str,
    dias_estadia: int,
    estilo_viagem: str,
    clima_info: ClimaInfo | None,
    atrativos: list[str],
    gastronomia: list[str],
) -> AsyncIterator[str]:
    """Gerador consumido pelo StreamingResponse do /stream-guia.

    Para de gerar assim que o navegador fecha a conexão (request.is_disconnected()),
    economizando a cota do Gemini. O último evento sempre traz done=true.
    """
    try:
        async for chunk in gerar_guia_ia_stream_async(
            destino, dias_estadia, estilo_viagem, clima_info, atrativos, gastronomia
        ):
            if await request.is_disconnected():
                logger.info("Cliente fechou o streaming do guia; interrompendo.")
                return
            yield evento_sse({"chunk": chunk, "done": False})
        yield evento_sse({"chunk": "", "done": True})
    except Exception as erro:  # noqa: BLE001
        yield evento_sse({"chunk": f"\n\n[Erro no streaming: {erro}]", "done": True})
