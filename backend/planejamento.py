# Módulo de Inteligência Artificial Gemini & Fallback (Guia Turístico e Culinária)

import concurrent.futures
import re
from typing import Any

from google import genai
from google.genai import errors as genai_errors

from config import GEMINI_KEY

# ==============================================================================
# 👤 RESPONSABILIDADE DO ALUNO 2: Inteligência Artificial (Gemini AI) & Fallback
# ==============================================================================

MODELO_GEMINI = "gemini-3.6-flash"
TIMEOUT_GEMINI = 6.0


def limpar_formato_texto(texto: str) -> str:
    """Remove marcações residuais de markdown (** ou *), hashtags, crases e saudações, mantendo apenas emojis."""
    if not texto:
        return ""

    # Remove marcações de negrito/itálico (*), títulos (#) e blocos de código (`).
    # Os emojis (📍, 🍽️, 💡) não batem com essa classe de caracteres, então
    # sobrevivem — é o "marcador visual" que substitui o markdown no prompt.
    texto_sem_marcacao = re.sub(r"[*_`#]+", "", texto)

    # Mesmo pedindo "sem saudação" no prompt, o modelo às vezes começa com
    # "Olá! Claro, aqui está..." — filtramos qualquer linha que COMECE com
    # uma dessas palavras (não usamos "contém" pra não apagar frases legítimas
    # que citem, por exemplo, "segue a costa" no meio do texto).
    padrao_saudacao = re.compile(
        r"^(ol[aá]|oi|claro|com certeza|certamente|aqui est[aá]|segue|"
        r"perfeito|beleza)\b",
        re.IGNORECASE,
    )
    linhas_validas = [
        linha.strip()
        for linha in texto_sem_marcacao.splitlines()
        if not padrao_saudacao.match(linha.strip())
    ]

    texto_limpo = "\n".join(linhas_validas)
    # Normaliza 3+ quebras de linha seguidas (que sobram depois de remover
    # linhas de saudação) para no máximo uma linha em branco entre blocos.
    texto_limpo = re.sub(r"\n{3,}", "\n\n", texto_limpo)

    return texto_limpo.strip()


def _montar_prompt(destino: str) -> str:
    """Monta o prompt restringindo o modelo a texto puro com emojis, sem markdown."""
    return (
        f"Crie um guia turístico curto para o destino '{destino}', no Brasil. "
        "Responda somente em texto puro, sem markdown, sem asteriscos, sem "
        "hashtags e sem títulos em negrito. Use um emoji no início de cada linha. "
        "Estruture a resposta em três blocos, cada um em sua própria linha de "
        "título: 'PONTOS TURÍSTICOS PRINCIPAIS' (liste 3 atrações, cada uma "
        "precedida pelo emoji 📍), 'CULINÁRIA TÍPICA' (liste 2 pratos, cada um "
        "precedido pelo emoji 🍽️) e 'DICA DE OURO' (uma dica prática precedida "
        "pelo emoji 💡). Não escreva saudações nem introduções: comece direto "
        "pelo primeiro bloco."
    )


def _chamar_gemini(destino: str) -> str:
    """Executa a chamada síncrona ao SDK do Gemini (roda isolada no ThreadPoolExecutor)."""
    cliente = genai.Client(api_key=GEMINI_KEY)
    resposta = cliente.models.generate_content(
        model=MODELO_GEMINI,
        contents=_montar_prompt(destino),
    )

    texto = getattr(resposta, "text", None)
    if not texto:
        raise ValueError("Resposta vazia retornada pelo modelo Gemini")

    return texto


def _guia_contingencia(destino: str) -> str:
    """Gera o roteiro de contingência estruturado em texto puro com emojis, sem depender da IA."""
    return (
        "🏛️ PONTOS TURÍSTICOS PRINCIPAIS\n"
        f"📍 Centro histórico e principais praças de {destino}\n"
        "📍 Museus e centros culturais da região\n"
        "📍 Mirantes e paisagens naturais nas proximidades\n"
        "\n"
        "🍽️ CULINÁRIA TÍPICA\n"
        "🍽️ Pratos regionais servidos nos restaurantes tradicionais locais\n"
        "🍽️ Doces e quitutes típicos vendidos no comércio da cidade\n"
        "\n"
        "💡 DICA DE OURO\n"
        "💡 Consulte a secretaria de turismo local para roteiros e horários atualizados"
    )


def obter_guia_destino_com_diagnostico(destino: str) -> tuple[str, dict[str, Any]]:
    """Invoca o modelo 'gemini-3.6-flash' com timeout de 6.0s em ThreadPoolExecutor.

    Em caso de timeout, chave inválida ou ausência de cota, aciona automaticamente
    o gerador de contingência com roteiro estruturado em texto puro com emojis.
    Retorna a tupla (texto_guia, diagnostico_metadados).
    """
    diagnostico: dict[str, Any] = {
        "status": "sucesso",
        "modelo": MODELO_GEMINI,
        "fallback_utilizado": False,
    }

    if not GEMINI_KEY:
        diagnostico.update(
            status="fallback", fallback_utilizado=True, motivo="chave_ausente"
        )
        return _guia_contingencia(destino), diagnostico

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            futuro = executor.submit(_chamar_gemini, destino)
            texto_bruto = futuro.result(timeout=TIMEOUT_GEMINI)

        return limpar_formato_texto(texto_bruto), diagnostico

    except concurrent.futures.TimeoutError:
        diagnostico.update(status="fallback", fallback_utilizado=True, motivo="timeout")

    except genai_errors.ClientError as erro:
        motivo = "cota_excedida" if erro.code == 429 else "chave_invalida"
        diagnostico.update(status="fallback", fallback_utilizado=True, motivo=motivo)

    except Exception:  # noqa: BLE001 - fronteira defensiva: nunca deixar a IA gerar 500
        diagnostico.update(
            status="fallback", fallback_utilizado=True, motivo="erro_desconhecido"
        )

    return _guia_contingencia(destino), diagnostico


def obter_guia_destino(destino: str) -> str:
    """Wrapper utilitário que retorna apenas o texto do guia."""
    texto, _ = obter_guia_destino_com_diagnostico(destino)
    return texto
