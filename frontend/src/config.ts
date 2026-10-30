// Configuração da SPA. Valores vêm do .env.local (prefixo VITE_), com padrões de desenvolvimento.

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

/** Base da API. Vazio = mesma origem (o proxy do Vite repassa /api para a porta 8001). */
export const API_BASE_URL = configuredApiBaseUrl ? configuredApiBaseUrl.replace(/\/+$/, "") : "";

/** Client ID OAuth do Google Identity Services. Vazio desliga o botão do Google. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";

/** Tempo máximo de uma chamada REST comum (o streaming SSE não usa). */
export const API_TIMEOUT_MS = 20000;

/** Acima disso a telemetria mostra o aviso de latência (meta do projeto: < 1 s). */
export const LIMITE_LATENCIA_MS = 1000;

/** Sugestões de destino: só cidades a mais de 400 km do ponto de partida. */
export const RAIO_SUGESTOES_KM = 400;

/** Chaves do localStorage. */
export const CHAVES_STORAGE = {
  sessao: "guia_turista_sessao",
  googleSalvo: "guia_turista_saved_google_user",
  tema: "guia_turista_tema",
} as const;
