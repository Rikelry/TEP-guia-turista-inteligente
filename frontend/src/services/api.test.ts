import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { resposta } from "../test/fixtures";
import {
  ApiError,
  definirUsuarioAtivo,
  enviarBeacon,
  extrairMensagemErro,
  lerProcessTime,
  lerStreamSSE,
  requisitar,
} from "./api";

afterEach(() => {
  definirUsuarioAtivo(null);
  vi.unstubAllGlobals();
});

describe("requisitar", () => {
  it("envia X-User-Id e mede X-Process-Time e Correlation-ID", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        resposta({ ok: true }, 200, { "X-Process-Time": "742.31", "X-Request-ID": "req-1" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    definirUsuarioAtivo("visitante-1");

    const { dados, medicao } = await requisitar<{ ok: boolean }>("/api/v1/roteiros/planejar", {
      metodo: "POST",
      corpo: { a: 1 },
    });

    expect(dados).toEqual({ ok: true });
    expect(medicao.latenciaApiMs).toBe(742.3);
    expect(medicao.requestId).toBe("req-1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/roteiros/planejar");
    expect(init.headers).toMatchObject({
      "X-User-Id": "visitante-1",
      "Content-Type": "application/json",
    });
  });

  it("transforma o 422 do Pydantic em mensagem por campo", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          resposta({ detail: [{ loc: ["body", "origem_uf"], msg: "UF inválida" }] }, 422),
        ),
    );
    await expect(requisitar("/x")).rejects.toMatchObject({
      status: 422,
      message: "origem_uf: UF inválida",
    });
  });

  it("falha de rede vira ApiError de status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const erro = await requisitar("/x").catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).status).toBe(0);
  });

  it("lê X-Process-Time em ms ou s", () => {
    expect(lerProcessTime("812ms")).toBe(812);
    expect(lerProcessTime("0.5s")).toBe(500);
    expect(lerProcessTime(null)).toBeNull();
    expect(extrairMensagemErro(409, null)).toMatch(/em andamento/);
  });
});

describe("lerStreamSSE", () => {
  it("junta os fragmentos mesmo quando um evento chega partido em dois pedaços", async () => {
    const pedacos = [
      'data: {"chunk": "Olá ", "done": false}\n\ndata: {"chu',
      'nk": "mundo", "done": false}\n\n',
      'data: {"chunk": "", "done": true}\n\n',
    ];
    const corpo = new ReadableStream<Uint8Array>({
      start(c) {
        pedacos.forEach((p) => c.enqueue(new TextEncoder().encode(p)));
        c.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(corpo, { headers: { "Content-Type": "text/event-stream" } }),
        ),
    );

    const recebidos: string[] = [];
    await lerStreamSSE("/api/v1/roteiros/stream-guia", { destino: "Natal" }, (c) =>
      recebidos.push(c),
    );
    expect(recebidos.join("")).toBe("Olá mundo");
  });
});

describe("enviarBeacon", () => {
  it("manda text/plain para não exigir preflight de CORS", async () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
    expect(enviarBeacon("/api/v1/auth/logout", { user_id: "v1" })).toBe(true);
    const blob = beacon.mock.calls[0]![1] as Blob;
    expect(blob.type).toBe("text/plain;charset=utf-8");
    const texto = await new Promise<string>((ok) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(leitor.result as string);
      leitor.readAsText(blob);
    });
    expect(texto).toBe('{"user_id":"v1"}');
  });
});
