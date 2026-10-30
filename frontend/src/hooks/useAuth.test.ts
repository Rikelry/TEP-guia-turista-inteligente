import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { entrarComoVisitante, obterSessao, sairDaConta } from "../services/auth";
import type { Usuario } from "../types/schemas";
import { useAuth } from "./useAuth";

vi.mock("../services/auth", () => ({
  entrarComoVisitante: vi.fn(),
  obterSessao: vi.fn(),
  sairDaConta: vi.fn(),
}));

const usuarioMock: Usuario = {
  tipo: "visitante",
  id: "visitante-teste",
  nome: "Viajante Convidado",
  email: null,
  foto: null,
};

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("consulta a sessão ao inicializar", async () => {
    vi.mocked(obterSessao).mockResolvedValue(null);

    const { result } = renderHook(() => useAuth());

    expect(result.current.carregando).toBe(true);

    await waitFor(() => {
      expect(result.current.carregando).toBe(false);
    });

    expect(obterSessao).toHaveBeenCalledOnce();
    expect(result.current.usuario).toBeNull();
  });

  it("armazena o usuário quando existe uma sessão válida", async () => {
    vi.mocked(obterSessao).mockResolvedValue(usuarioMock);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.usuario).toEqual(usuarioMock);
    });

    expect(result.current.erro).toBeNull();
  });

  it("registra erro quando não consegue consultar a sessão", async () => {
    vi.mocked(obterSessao).mockRejectedValue(new Error("Falha na comunicação com o servidor."));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.carregando).toBe(false);
    });

    expect(result.current.usuario).toBeNull();
    expect(result.current.erro).toBe("Falha na comunicação com o servidor.");
  });

  it("realiza login como visitante", async () => {
    vi.mocked(obterSessao).mockResolvedValue(null);
    vi.mocked(entrarComoVisitante).mockResolvedValue(usuarioMock);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.carregando).toBe(false);
    });

    await act(async () => {
      await result.current.loginVisitante();
    });

    expect(entrarComoVisitante).toHaveBeenCalledOnce();
    expect(result.current.usuario).toEqual(usuarioMock);
    expect(result.current.erro).toBeNull();
  });

  it("realiza logout", async () => {
    vi.mocked(obterSessao).mockResolvedValue(usuarioMock);
    vi.mocked(sairDaConta).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.usuario).toEqual(usuarioMock);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(sairDaConta).toHaveBeenCalledOnce();
    expect(result.current.usuario).toBeNull();
  });

  it("registra erro quando o login falha", async () => {
    vi.mocked(obterSessao).mockResolvedValue(null);
    vi.mocked(entrarComoVisitante).mockRejectedValue(new Error("Falha no login."));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.carregando).toBe(false);
    });

    await act(async () => {
      await expect(result.current.loginVisitante()).rejects.toThrow("Falha no login.");
    });

    expect(result.current.erro).toBe("Falha no login.");
  });

  it("registra erro quando o logout falha", async () => {
    vi.mocked(obterSessao).mockResolvedValue(usuarioMock);
    vi.mocked(sairDaConta).mockRejectedValue(new Error("Falha no logout."));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.usuario).toEqual(usuarioMock);
    });

    await act(async () => {
      await expect(result.current.logout()).rejects.toThrow("Falha no logout.");
    });

    expect(result.current.usuario).toEqual(usuarioMock);
    expect(result.current.erro).toBe("Falha no logout.");
  });
});
