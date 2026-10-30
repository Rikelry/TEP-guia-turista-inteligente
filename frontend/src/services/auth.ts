import type { Usuario } from "../types/schemas";
import { AUTH_MOCK_ENABLED } from "../config";
import { apiRequest } from "./api";

interface UsuarioAPI {
  user_id: string;
  nome: string;
  tipo: "google" | "visitante";
  email: string | null;
  foto: string | null;
  expira_em?: string | null;
}

interface LoginResponse {
  usuario: UsuarioAPI;
}

const CHAVE_USUARIO = "tep_usuario_mock";

function converterUsuario(usuario: UsuarioAPI): Usuario {
  return {
    id: usuario.user_id,
    nome: usuario.nome,
    tipo: usuario.tipo,
    email: usuario.email,
    foto: usuario.foto,
    ...(usuario.expira_em !== undefined && {
      expira_em: usuario.expira_em,
    }),
  };
}

function salvarUsuario(usuario: Usuario): void {
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
}

function lerUsuarioSalvo(): Usuario | null {
  const salvo = localStorage.getItem(CHAVE_USUARIO);

  if (!salvo) return null;

  try {
    return JSON.parse(salvo) as Usuario;
  } catch {
    localStorage.removeItem(CHAVE_USUARIO);
    return null;
  }
}

export async function obterSessao(): Promise<Usuario | null> {
  const usuarioSalvo = lerUsuarioSalvo();

  if (!usuarioSalvo) return null;

  if (AUTH_MOCK_ENABLED) {
    return usuarioSalvo;
  }

  const resposta = await apiRequest<LoginResponse>("/api/v1/auth/sessao", {
    headers: {
      "X-User-Id": usuarioSalvo.id,
    },
  });

  const usuario = converterUsuario(resposta.usuario);
  salvarUsuario(usuario);

  return usuario;
}

export async function entrarComoVisitante(): Promise<Usuario> {
  if (AUTH_MOCK_ENABLED) {
    const usuario: Usuario = {
      id: "visitante-mock",
      nome: "Viajante de Demonstração",
      tipo: "visitante",
      email: null,
      foto: null,
    };

    salvarUsuario(usuario);
    return usuario;
  }

  const resposta = await apiRequest<LoginResponse>("/api/v1/auth/visitante", { method: "POST" });

  const usuario = converterUsuario(resposta.usuario);
  salvarUsuario(usuario);

  return usuario;
}

export async function sairDaConta(): Promise<void> {
  const usuario = lerUsuarioSalvo();

  if (!usuario) return;

  try {
    if (!AUTH_MOCK_ENABLED) {
      await apiRequest<void>("/api/v1/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: usuario.id }),
      });
    }
  } finally {
    localStorage.removeItem(CHAVE_USUARIO);
  }
}
