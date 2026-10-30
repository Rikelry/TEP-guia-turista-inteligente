import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import App from "./App";
import { MAPA, ROTEIRO, resposta } from "./test/fixtures";

vi.mock("leaflet", () => {
  const camada = () => {
    const c = { addTo: () => c, bindTooltip: () => c, getBounds: () => ({ isValid: () => true }) };
    return c;
  };
  return {
    map: () => ({ fitBounds: () => {}, remove: () => {} }),
    tileLayer: camada,
    polyline: camada,
    circleMarker: camada,
    marker: camada,
    divIcon: () => ({}),
    latLng: () => ({}),
  };
});

function sse(...chunks: string[]): Response {
  const corpo =
    chunks.map((c) => `data: ${JSON.stringify({ chunk: c, done: false })}\n\n`).join("") +
    'data: {"chunk":"","done":true}\n\n';
  return new Response(corpo, { headers: { "Content-Type": "text/event-stream" } });
}

let salvas: unknown[] = [];
let pedidos: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  localStorage.clear();
  salvas = [];
  pedidos = [];
  const expira = new Date(Date.now() + 7200_000).toISOString();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      pedidos.push({ url, ...(init && { init }) });
      if (url.endsWith("/roteiros/destinos"))
        return Promise.resolve(
          resposta([{ cidade: "Natal", uf: "RN", lat: -5.79, lon: -35.21, resumo: "" }]),
        );
      if (url.endsWith("/telemetria"))
        return Promise.resolve(
          resposta({
            uptime_segundos: 60,
            requisicoes_total: 1,
            latencia_media_ms: 5,
            roteiros_gerados: 0,
            total_roteiros_salvos: salvas.length,
            provedores_ativos: 5,
            provedores_total: 5,
            circuit_breakers: [],
          }),
        );
      if (url.endsWith("/auth/visitante"))
        return Promise.resolve(
          resposta({
            usuario: {
              user_id: "visitante-1",
              nome: "Visitante",
              tipo: "visitante",
              expira_em: expira,
            },
          }),
        );
      if (url.endsWith("/roteiros/planejar")) {
        salvas = [ROTEIRO];
        return Promise.resolve(
          resposta(ROTEIRO, 200, { "X-Process-Time": "640.5", "X-Request-ID": "req-xyz" }),
        );
      }
      if (url.endsWith("/roteiros/mapa-rota")) return Promise.resolve(resposta(MAPA));
      if (url.endsWith("/roteiros/stream-guia"))
        return Promise.resolve(sse("📍 IDENTIDADE: ", "Natal ao vivo."));
      if (url.endsWith("/roteiros/minhas-viagens")) return Promise.resolve(resposta(salvas));
      return Promise.resolve(new Response(null, { status: 204 }));
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("App (integração com a API simulada)", () => {
  it("visitante planeja, recebe mapa, guia por SSE, telemetria e histórico", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /Entrar como visitante/ }));
    await screen.findByText(/Visitante · expira em/);

    await userEvent.type(screen.getByLabelText("Cidade de origem"), "Piripiri");
    await userEvent.type(screen.getByLabelText("Cidade de destino"), "Natal");
    await userEvent.selectOptions(screen.getAllByLabelText("UF")[1]!, "RN");
    await userEvent.click(screen.getByRole("button", { name: "Planejar viagem" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: /Piripiri - PI → Natal - RN/ }),
    ).toBeInTheDocument();
    await screen.findByText(/Natal ao vivo\./);

    const planejar = pedidos.find((p) => p.url.endsWith("/roteiros/planejar"))!;
    expect(planejar.init?.headers).toMatchObject({ "X-User-Id": "visitante-1" });
    expect(JSON.parse(planejar.init?.body as string)).toMatchObject({
      destino_uf: "RN",
      veiculo: { propulsao: "combustao" },
    });

    expect(screen.getByText("req-xyz")).toBeInTheDocument();
    const historico = screen.getByRole("complementary");
    await waitFor(() =>
      expect(within(historico).getByText(/Piripiri - PI → Natal - RN/)).toBeInTheDocument(),
    );

    expect(screen.getByRole("heading", { name: "Mapa da rota & paradas" })).toBeInTheDocument();
    expect(await screen.findByText(/Parada 1 · Posto de combustível/)).toBeInTheDocument();

    // Trocar para elétrico recalcula o /mapa-rota com o veículo elétrico padrão.
    await userEvent.click(screen.getByRole("button", { name: /Elétrico \(EV\)/ }));
    await waitFor(() =>
      expect(
        pedidos.filter((p) => p.url.endsWith("/roteiros/mapa-rota")).at(-1)?.init?.body,
      ).toContain('"propulsao":"eletrico"'),
    );
  });

  it("sem sessão mostra a tela de login no lugar do planejador", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Acesse para começar" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Cidade de origem")).not.toBeInTheDocument();
    expect(pedidos.some((p) => p.url.endsWith("/planejar"))).toBe(false);
  });
});
