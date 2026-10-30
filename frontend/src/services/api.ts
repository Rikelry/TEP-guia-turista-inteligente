import { API_BASE_URL } from "../config";

export class ApiError extends Error {
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);

    this.name = "ApiError";
    this.status = status;

    if (details !== undefined) {
      this.details = details;
    }
  }
}

/**
 * Cliente HTTP compartilhado pela aplicação.
 *
 * Utiliza a URL definida em VITE_API_BASE_URL.
 * Quando vazia, utiliza a origem atual do frontend.
 */
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...options,
    headers,
    credentials: options.credentials ?? "include",
  });

  if (!response.ok) {
    let details: unknown;
    let message = `Erro na comunicação com o servidor (${response.status}).`;

    try {
      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        details = await response.json();

        if (typeof details === "object" && details !== null) {
          const body = details as Record<string, unknown>;

          if (typeof body.message === "string") {
            message = body.message;
          } else if (typeof body.error === "string") {
            message = body.error;
          } else if (typeof body.detail === "string") {
            message = body.detail;
          }
        }
      } else {
        details = await response.text();
      }
    } catch {
      // Mantém a mensagem padrão caso não seja possível ler o erro.
    }

    throw new ApiError(message, response.status, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}
