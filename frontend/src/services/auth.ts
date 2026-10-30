import type { Usuario } from "../types/schemas";
import { apiRequest } from "./api";

interface SessaoResposta {
  usuario: Usuario | null;
}

/**
 * Consulta o usuário autenticado na sessão Flask.
 *
 * Depende da implementação de GET /api/sessao no backend.
 */
export async function obterSessao(): Promise<Usuario | null> {
  const resposta = await apiRequest<SessaoResposta>("/api/sessao");

  return resposta.usuario;
}

/**
 * Inicia uma sessão de visitante no Flask.
 */
export function entrarComoVisitante(): void {
  window.location.assign("/auth/demo");
}

/**
 * Encerra a sessão atual no Flask.
 */
export function sairDaConta(): void {
  window.location.assign("/auth/logout");
}
