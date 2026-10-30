import { useCallback, useEffect, useState } from "react";
import { entrarComGoogle, entrarComoVisitante, obterSessao, sairDaConta } from "../services/auth";
import type { Usuario } from "../types/schemas";

interface UseAuthReturn {
  usuario: Usuario | null;
  carregando: boolean;
  erro: string | null;
  loginGoogle: (credential: string) => Promise<void>;
  loginVisitante: () => Promise<void>;
  logout: () => Promise<void>;
  atualizarSessao: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const atualizarSessao = useCallback(async (): Promise<void> => {
    setCarregando(true);
    setErro(null);

    try {
      const usuarioAtual = await obterSessao();
      setUsuario(usuarioAtual);
    } catch (error) {
      setUsuario(null);
      setErro(error instanceof Error ? error.message : "Não foi possível verificar a sessão.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void atualizarSessao();
  }, [atualizarSessao]);

  const loginGoogle = useCallback(async (credential: string): Promise<void> => {
    setCarregando(true);
    setErro(null);

    try {
      const novoUsuario = await entrarComGoogle(credential);
      setUsuario(novoUsuario);
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Não foi possível entrar com a Conta Google.",
      );
      throw error;
    } finally {
      setCarregando(false);
    }
  }, []);

  const loginVisitante = useCallback(async (): Promise<void> => {
    setCarregando(true);
    setErro(null);

    try {
      const novoUsuario = await entrarComoVisitante();
      setUsuario(novoUsuario);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível entrar como visitante.");
      throw error;
    } finally {
      setCarregando(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setCarregando(true);
    setErro(null);

    try {
      await sairDaConta();
      setUsuario(null);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível encerrar a sessão.");
      throw error;
    } finally {
      setCarregando(false);
    }
  }, []);

  return {
    usuario,
    carregando,
    erro,
    loginVisitante,
    loginGoogle,
    logout,
    atualizarSessao,
  };
}
