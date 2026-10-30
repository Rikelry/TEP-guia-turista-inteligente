// Cliente HTTP da SPA: envia X-User-Id, aplica timeout, padroniza erros (inclusive o 422 do
// Pydantic), mede a telemetria (X-Process-Time, X-Request-ID e tempo total no navegador) e lê
// o streaming Server-Sent Events do guia por IA.

import { API_BASE_URL, API_TIMEOUT_MS } from "../config";

export interface Medicao {
  /** Tempo de processamento informado pelo servidor (header X-Process-Time), em ms. */
  latenciaApiMs: number | null;
  /** Tempo total percebido no navegador, do fetch até o corpo lido, em ms. */
  tempoTotalMs: number;
  /** Correlation-ID devolvido no header X-Request-ID. */
  requestId: string | null;
}

export interface RespostaApi<T> {
  dados: T;
  medicao: Medicao;
}

export interface OpcoesRequisicao {
  metodo?: "GET" | "POST" | "PATCH" | "DELETE";
  corpo?: unknown;
  signal?: AbortSignal;
  /** 0 desliga o timeout. */
  timeoutMs?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;

  constructor(status: number, mensagem: string, requestId: string | null = null) {
    super(mensagem);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

// --- Usuário ativo ----------------------------------------------------------

let usuarioAtivoId: string | null = null;

/** Definido pelo useAuth a cada login, troca de modo e logout. */
export function definirUsuarioAtivo(id: string | null): void {
  usuarioAtivoId = id;
}

// --- Auxiliares -------------------------------------------------------------

export function montarUrl(caminho: string): string {
  return `${API_BASE_URL}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}

/** Lê o X-Process-Time em ms ("812.4", "812ms" ou "0.81s"). */
export function lerProcessTime(valor: string | null): number | null {
  const m = valor ? /^\s*([\d.]+)\s*(ms|s)?\s*$/i.exec(valor) : null;
  if (!m?.[1]) return null;
  const numero = Number(m[1]);
  if (!Number.isFinite(numero)) return null;
  return Math.round((m[2]?.toLowerCase() === "s" ? numero * 1000 : numero) * 10) / 10;
}

const MENSAGENS: Record<number, string> = {
  401: "Sua sessão expirou. Entre novamente.",
  404: "Não encontramos o que você pediu.",
  409: "Já existe uma consulta igual em andamento. Aguarde ela terminar.",
  422: "Alguns dados estão inválidos. Confira o formulário.",
  499: "A consulta foi cancelada.",
  503: "Um serviço externo está fora do ar. Tente de novo em instantes.",
};

/** Transforma o corpo de erro do FastAPI ({ detail }) numa frase legível. */
export function extrairMensagemErro(status: number, corpo: unknown): string {
  const detail =
    typeof corpo === "object" && corpo !== null
      ? (corpo as { detail?: unknown }).detail
      : undefined;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const frases = detail.flatMap((item: unknown) => {
      if (typeof item !== "object" || item === null) return [];
      const { loc, msg } = item as { loc?: unknown; msg?: unknown };
      if (typeof msg !== "string") return [];
      const campo = Array.isArray(loc) ? loc.filter((p) => p !== "body").join(".") : "";
      return [campo ? `${campo}: ${msg}` : msg];
    });
    if (frases.length) return frases.join("; ");
  }
  return (
    MENSAGENS[status] ??
    (status >= 500 ? "O servidor teve um problema. Tente de novo." : `Erro ${status}.`)
  );
}

function cabecalhos(temCorpo: boolean): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (temCorpo) h["Content-Type"] = "application/json";
  if (usuarioAtivoId) h["X-User-Id"] = usuarioAtivoId;
  return h;
}

function sinalCombinado(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal | undefined {
  const sinais = [signal, timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined].filter(
    (s): s is AbortSignal => s !== undefined,
  );
  if (sinais.length <= 1) return sinais[0];
  return AbortSignal.any(sinais);
}

async function executarFetch(
  caminho: string,
  opcoes: OpcoesRequisicao,
  accept?: string,
): Promise<{ resposta: Response; inicio: number }> {
  const { metodo = "GET", corpo, signal, timeoutMs = API_TIMEOUT_MS } = opcoes;
  const init: RequestInit = { method: metodo, headers: cabecalhos(corpo !== undefined) };
  if (accept) (init.headers as Record<string, string>).Accept = accept;
  if (corpo !== undefined) init.body = JSON.stringify(corpo);
  const sinal = sinalCombinado(signal, timeoutMs);
  if (sinal) init.signal = sinal;

  const inicio = performance.now();
  try {
    return { resposta: await fetch(montarUrl(caminho), init), inicio };
  } catch (erro) {
    if (signal?.aborted) throw erro;
    if (erro instanceof DOMException && erro.name === "TimeoutError") {
      throw new ApiError(0, "O servidor demorou demais para responder. Tente de novo.");
    }
    throw new ApiError(0, "Sem conexão com a API. Verifique a internet e se o backend está no ar.");
  }
}

async function lerCorpo(resposta: Response): Promise<unknown> {
  if (resposta.status === 204) return null;
  const texto = await resposta.text();
  if (!texto) return null;
  if ((resposta.headers.get("Content-Type") ?? "").includes("application/json")) {
    try {
      return JSON.parse(texto) as unknown;
    } catch {
      return texto;
    }
  }
  return texto;
}

// --- API pública -------------------------------------------------------------

/** Chamada REST com JSON. Lança ApiError em erro HTTP, timeout ou falta de rede. */
export async function requisitar<T>(
  caminho: string,
  opcoes: OpcoesRequisicao = {},
): Promise<RespostaApi<T>> {
  const { resposta, inicio } = await executarFetch(caminho, opcoes);
  const dados = await lerCorpo(resposta);
  const requestId = resposta.headers.get("X-Request-ID");
  if (!resposta.ok)
    throw new ApiError(resposta.status, extrairMensagemErro(resposta.status, dados), requestId);
  return {
    dados: dados as T,
    medicao: {
      latenciaApiMs: lerProcessTime(resposta.headers.get("X-Process-Time")),
      tempoTotalMs: Math.round(performance.now() - inicio),
      requestId,
    },
  };
}

/** Download de arquivo (ex.: GPX). Devolve o Blob e o nome sugerido pelo Content-Disposition. */
export async function baixarArquivo(
  caminho: string,
  opcoes: OpcoesRequisicao = {},
): Promise<{ blob: Blob; nome: string | null }> {
  const { resposta } = await executarFetch(caminho, opcoes, "*/*");
  if (!resposta.ok) {
    throw new ApiError(
      resposta.status,
      extrairMensagemErro(resposta.status, await lerCorpo(resposta)),
    );
  }
  const nome =
    /filename="?([^";]+)"?/i.exec(resposta.headers.get("Content-Disposition") ?? "")?.[1] ?? null;
  return { blob: await resposta.blob(), nome };
}

/**
 * Consome um endpoint Server-Sent Events via fetch + ReadableStream (o EventSource nativo
 * não aceita POST). Chama `aoReceber` para cada fragmento até o evento com done=true.
 */
export async function lerStreamSSE(
  caminho: string,
  corpo: unknown,
  aoReceber: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { resposta } = await executarFetch(
    caminho,
    { metodo: "POST", corpo, ...(signal && { signal }), timeoutMs: 0 },
    "text/event-stream",
  );
  if (!resposta.ok || !resposta.body) {
    throw new ApiError(
      resposta.status,
      extrairMensagemErro(resposta.status, await lerCorpo(resposta)),
    );
  }

  const leitor = resposta.body.getReader();
  const decodificador = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    buffer += decodificador.decode(value, { stream: true });
    // Cada evento termina com uma linha em branco: "data: {...}\n\n".
    let fim = buffer.indexOf("\n\n");
    while (fim !== -1) {
      const bloco = buffer.slice(0, fim);
      buffer = buffer.slice(fim + 2);
      for (const linha of bloco.split("\n")) {
        if (!linha.startsWith("data:")) continue;
        const evento = JSON.parse(linha.slice(5).trim()) as { chunk?: string; done?: boolean };
        if (evento.chunk) aoReceber(evento.chunk);
        if (evento.done) {
          await leitor.cancel();
          return;
        }
      }
      fim = buffer.indexOf("\n\n");
    }
  }
}

/**
 * POST que sobrevive ao fechamento da aba. Vai como text/plain (com JSON dentro) porque o
 * sendBeacon não faz preflight de CORS; o backend lê o corpo bruto.
 */
export function enviarBeacon(caminho: string, corpo: unknown): boolean {
  if (typeof navigator.sendBeacon !== "function") return false;
  return navigator.sendBeacon(
    montarUrl(caminho),
    new Blob([JSON.stringify(corpo)], { type: "text/plain;charset=UTF-8" }),
  );
}
