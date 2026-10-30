import { API_BASE_URL } from "../config";

let usuarioIdAtual: string | null = null;

export function definirUsuarioApi(usuarioId: string | null): void {
  usuarioIdAtual = usuarioId;
}

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

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (usuarioIdAtual && path.startsWith("/api/v1/roteiros")) {
    headers.set("X-User-Id", usuarioIdAtual);
  }

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
      // Mantém a mensagem padrão.
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
