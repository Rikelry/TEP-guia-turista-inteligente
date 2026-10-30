import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { CHAVES_STORAGE } from "../config";
import { resposta, USUARIO_GOOGLE } from "../test/fixtures";
import { useAuth } from "./useAuth";

const expira = new Date(Date.now() + 2 * 3600_000).toISOString();
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn((url: string) => {
    if (url.endsWith("/auth/visitante")) {
      return Promise.resolve(
        resposta({
          usuario: {
            user_id: "visitante-7",
            nome: "Visitante",
            tipo: "visitante",
            expira_em: expira,
          },
        }),
      );
    }
    if (url.endsWith("/auth/google")) {
      return Promise.resolve(
        resposta({ usuario: { user_id: "109876543214321", nome: "Ana Souza", tipo: "google" } }),
      );
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("useAuth", () => {
  it("entra como visitante com sessão de 2 horas", async () => {
    const { result } = renderHook(() => useAuth());
    await act(() => result.current.entrarComoVisitante());
    expect(result.current.usuario).toMatchObject({
      id: "visitante-7",
      tipo: "visitante",
      expiraEm: Date.parse(expira),
    });
    expect(localStorage.getItem(CHAVES_STORAGE.sessao)).toContain("visitante-7");
  });

  it("sessão híbrida: guarda a conta Google e volta em 1 clique, sem novo login", async () => {
    localStorage.setItem(CHAVES_STORAGE.sessao, JSON.stringify(USUARIO_GOOGLE));
    const { result } = renderHook(() => useAuth());
    expect(result.current.usuario?.tipo).toBe("google");

    await act(() => result.current.entrarComoVisitante());
    expect(result.current.usuario?.tipo).toBe("visitante");
    expect(localStorage.getItem("guia_turista_saved_google_user")).toContain("Ana Souza");

    act(() => result.current.voltarParaGoogle());
    expect(result.current.usuario?.id).toBe(USUARIO_GOOGLE.id);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/auth/google"))).toBe(false);
  });

  it("mostra a mensagem do servidor quando o login falha", async () => {
    fetchMock.mockResolvedValueOnce(resposta({ detail: "Token do Google inválido." }, 401));
    const { result } = renderHook(() => useAuth());
    await act(() => result.current.entrarComGoogle("token-ruim"));
    expect(result.current.usuario).toBeNull();
    expect(result.current.erro).toBe("Token do Google inválido.");
  });

  it("fechar a aba encerra o visitante por sendBeacon", async () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
    const { result } = renderHook(() => useAuth());
    await act(() => result.current.entrarComoVisitante());
    window.dispatchEvent(new Event("pagehide"));
    expect(beacon).toHaveBeenCalledWith("/api/v1/auth/logout", expect.any(Blob));
    expect(localStorage.getItem(CHAVES_STORAGE.sessao)).toBeNull();
  });

  it("sessão salva que expirou no servidor é descartada ao abrir", async () => {
    localStorage.setItem(CHAVES_STORAGE.sessao, JSON.stringify(USUARIO_GOOGLE));
    fetchMock.mockImplementation(() =>
      Promise.resolve(resposta({ detail: "Sessão expirada" }, 401)),
    );
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.usuario).toBeNull();
  });

  it("expirarVisitante encerra só o visitante", async () => {
    const { result } = renderHook(() => useAuth());
    await act(() => result.current.entrarComoVisitante());
    act(() => result.current.expirarVisitante());
    expect(result.current.usuario).toBeNull();
    expect(result.current.erro).toMatch(/visitante terminou/);
  });
});
