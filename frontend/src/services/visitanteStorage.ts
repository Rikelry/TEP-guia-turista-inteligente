// Acesso defensivo ao localStorage: nunca lança (aba anônima, cota cheia, storage bloqueado)
// e descarta dados corrompidos em vez de quebrar a SPA.

import { CHAVES_STORAGE } from "../config";
import type { Usuario } from "../types/schemas";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function lerTexto(chave: string): string | null {
  try {
    return storage()?.getItem(chave) ?? null;
  } catch {
    return null;
  }
}

export function gravarTexto(chave: string, valor: string): void {
  try {
    storage()?.setItem(chave, valor);
  } catch {
    /* cota cheia ou bloqueado */
  }
}

export function remover(chave: string): void {
  try {
    storage()?.removeItem(chave);
  } catch {
    /* bloqueado */
  }
}

export function ehUsuario(valor: unknown): valor is Usuario {
  if (typeof valor !== "object" || valor === null) return false;
  const v = valor as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id !== "" &&
    typeof v.nome === "string" &&
    (v.tipo === "google" || v.tipo === "visitante") &&
    typeof v.desde === "number" &&
    (v.tipo === "google" || typeof v.expiraEm === "number")
  );
}

function lerUsuario(chave: string): Usuario | null {
  const bruto = lerTexto(chave);
  if (!bruto) return null;
  try {
    const valor: unknown = JSON.parse(bruto);
    if (ehUsuario(valor)) return valor;
  } catch {
    /* corrompido */
  }
  remover(chave);
  return null;
}

/** Sessão ativa. Visitante vencido é apagado e devolve null. */
export function lerSessao(agora: number = Date.now()): Usuario | null {
  const usuario = lerUsuario(CHAVES_STORAGE.sessao);
  if (usuario?.tipo === "visitante" && (usuario.expiraEm ?? 0) <= agora) {
    remover(CHAVES_STORAGE.sessao);
    return null;
  }
  return usuario;
}

export function salvarSessao(usuario: Usuario | null): void {
  if (usuario) gravarTexto(CHAVES_STORAGE.sessao, JSON.stringify(usuario));
  else remover(CHAVES_STORAGE.sessao);
}

/** Conta Google guardada enquanto se usa o modo visitante (botão "Voltar para [Nome]"). */
export function lerGoogleSalvo(): Usuario | null {
  const usuario = lerUsuario(CHAVES_STORAGE.googleSalvo);
  return usuario?.tipo === "google" ? usuario : null;
}

export function salvarGoogle(usuario: Usuario | null): void {
  if (usuario?.tipo === "google") gravarTexto(CHAVES_STORAGE.googleSalvo, JSON.stringify(usuario));
  else remover(CHAVES_STORAGE.googleSalvo);
}
