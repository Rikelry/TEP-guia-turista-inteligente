// Identidade da SPA: login Google (JWT validado no backend), visitante com TTL de 2 horas e
// sessão híbrida não destrutiva. Ao virar visitante, a conta Google fica guardada em
// `guia_turista_saved_google_user` e volta com um clique, sem novo login no Google.

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, definirUsuarioAtivo, enviarBeacon, requisitar } from "../services/api";
import {
  lerGoogleSalvo,
  lerSessao,
  salvarGoogle,
  salvarSessao,
} from "../services/visitanteStorage";
import { parseLoginResponse } from "../types/schemas";
import type { Usuario } from "../types/schemas";

const ROTA_LOGOUT = "/api/v1/auth/logout";

export interface AuthApi {
  usuario: Usuario | null;
  /** Conta Google guardada durante o modo visitante. */
  googleSalvo: Usuario | null;
  carregando: boolean;
  erro: string | null;
  entrarComGoogle: (credential: string) => Promise<Usuario | null>;
  entrarComoVisitante: () => Promise<Usuario | null>;
  voltarParaGoogle: () => void;
  sair: () => void;
  /** Chamado pelo temporizador quando as 2 horas do visitante acabam. */
  expirarVisitante: () => void;
}

function mensagemDe(erro: unknown): string {
  if (erro instanceof ApiError) return erro.message;
  if (erro instanceof Error && erro.name === "ErroContrato")
    return "O servidor respondeu num formato inesperado.";
  return "Não foi possível entrar agora. Tente de novo.";
}

function encerrarNoServidor(usuario: Usuario, viaBeacon = false): void {
  const corpo = { user_id: usuario.id };
  if (viaBeacon && enviarBeacon(ROTA_LOGOUT, corpo)) return;
  // Melhor esforço: a sessão local já foi limpa.
  requisitar(ROTA_LOGOUT, { metodo: "POST", corpo }).catch(() => undefined);
}

export function useAuth(): AuthApi {
  const [usuario, setUsuario] = useState<Usuario | null>(() => lerSessao());
  const [googleSalvo, setGoogleSalvo] = useState<Usuario | null>(() => lerGoogleSalvo());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const usuarioRef = useRef(usuario);

  // A ref, o X-User-Id do cliente da API e o localStorage acompanham o usuário ativo.
  useEffect(() => {
    usuarioRef.current = usuario;
    definirUsuarioAtivo(usuario?.id ?? null);
    salvarSessao(usuario);
  }, [usuario]);

  // A sessão salva pode ter morrido no servidor (reinício, TTL): confere uma vez ao abrir.
  useEffect(() => {
    const salvo = lerSessao();
    if (!salvo) return;
    requisitar("/api/v1/auth/sessao").catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        setUsuario((atual) => (atual?.id === salvo.id ? null : atual));
      }
    });
  }, []);

  // Visitante é volátil: fechar a aba encerra a sessão no servidor via sendBeacon.
  useEffect(() => {
    const aoSair = () => {
      const atual = usuarioRef.current;
      if (atual?.tipo !== "visitante") return;
      encerrarNoServidor(atual, true);
      salvarSessao(null);
    };
    window.addEventListener("pagehide", aoSair);
    return () => window.removeEventListener("pagehide", aoSair);
  }, []);

  const login = useCallback(async (rota: string, corpo: unknown) => {
    setCarregando(true);
    setErro(null);
    try {
      const { dados } = await requisitar<unknown>(rota, { metodo: "POST", corpo });
      return parseLoginResponse(dados);
    } catch (e) {
      setErro(mensagemDe(e));
      return null;
    } finally {
      setCarregando(false);
    }
  }, []);

  const entrarComGoogle = useCallback(
    async (credential: string) => {
      const novo = await login("/api/v1/auth/google", { credential });
      if (novo) {
        const anterior = usuarioRef.current;
        if (anterior?.tipo === "visitante") encerrarNoServidor(anterior);
        salvarGoogle(null);
        setGoogleSalvo(null);
        setUsuario(novo);
      }
      return novo;
    },
    [login],
  );

  const entrarComoVisitante = useCallback(async () => {
    const novo = await login("/api/v1/auth/visitante", {});
    if (novo) {
      const anterior = usuarioRef.current;
      // Não desconecta o Google: guarda a conta para o "Voltar para [Nome]".
      if (anterior?.tipo === "google") {
        salvarGoogle(anterior);
        setGoogleSalvo(anterior);
      }
      setUsuario(novo);
    }
    return novo;
  }, [login]);

  const voltarParaGoogle = useCallback(() => {
    const salvo = lerGoogleSalvo();
    if (!salvo) return;
    const atual = usuarioRef.current;
    if (atual?.tipo === "visitante") encerrarNoServidor(atual);
    salvarGoogle(null);
    setGoogleSalvo(null);
    setErro(null);
    setUsuario(salvo);
  }, []);

  const sair = useCallback(() => {
    const atual = usuarioRef.current;
    setErro(null);
    setUsuario(null);
    if (!atual) return;
    encerrarNoServidor(atual);
    if (atual.tipo === "google") window.google?.accounts.id.disableAutoSelect();
  }, []);

  const expirarVisitante = useCallback(() => {
    if (usuarioRef.current?.tipo !== "visitante") return;
    setUsuario(null);
    setErro("Sua sessão de visitante terminou. Entre de novo para continuar.");
  }, []);

  return {
    usuario,
    googleSalvo,
    carregando,
    erro,
    entrarComGoogle,
    entrarComoVisitante,
    voltarParaGoogle,
    sair,
    expirarVisitante,
  };
}
