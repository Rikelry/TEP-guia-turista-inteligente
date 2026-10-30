import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { MAPA, ROTEIRO } from "../test/fixtures";
import RoteiroResult, { separarSecoes } from "./RoteiroResult";

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

function montar(extra = {}) {
  const props = {
    roteiro: ROTEIRO,
    mapa: MAPA,
    rotaAtiva: 0,
    onSelecionarRota: vi.fn(),
    guia: ROTEIRO.guia,
    onAlternarVisita: vi.fn(),
    ...extra,
  };
  render(<RoteiroResult {...props} />);
  return props;
}

describe("RoteiroResult", () => {
  it("divide o guia nos blocos do prompt", () => {
    const s = separarSecoes(ROTEIRO.guia);
    expect(s.map((x) => x.titulo)).toEqual([
      "📍 Identidade",
      "🗓️ Roteiro",
      "🍽️ Gastronomia",
      "🌤️ Clima e dicas",
    ]);
    expect(s[1]!.corpo).toContain("Tarde: Dunas de Genipabu.");
  });

  it("visão geral: resumo, clima, guia resumido e catálogo com Maps", async () => {
    montar();
    expect(screen.getByRole("heading", { name: /Piripiri - PI → Natal - RN/ })).toBeInTheDocument();
    expect(screen.getByText("Cultural & Gastronômico · 1 dia")).toBeInTheDocument();
    expect(screen.getByText("27°C · Céu limpo")).toBeInTheDocument();
    expect(screen.getByText(/Natal une dunas/)).toBeInTheDocument();
    expect(screen.queryByText(/Dunas de Genipabu/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Ver roteiro completo/ }));
    expect(screen.getByText(/Dunas de Genipabu/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Ver no Maps/ })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("google.com/maps/search"),
    );
  });

  it("marca atrativo como visitado", async () => {
    const props = montar();
    await userEvent.click(
      screen.getByRole("button", { name: "Marcar Forte dos Reis Magos como visitado" }),
    );
    expect(props.onAlternarVisita).toHaveBeenCalledWith("atrativo-forte");
    expect(
      screen.getByRole("button", { name: "Desmarcar Ginga com tapioca como visitado" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("mapa na visão geral e aba do guia completo", async () => {
    montar({ streaming: true, guia: "📍 IDENTIDADE: Chegando" });
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Mapa da rota & paradas");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Paradas estratégicas");
    await userEvent.click(screen.getByRole("tab", { name: /Guia & clima/ }));
    expect(screen.getByText("Gerando em tempo real (SSE)...")).toBeInTheDocument();
    expect(screen.getByText(/Chegando/)).toBeInTheDocument();
  });
});
