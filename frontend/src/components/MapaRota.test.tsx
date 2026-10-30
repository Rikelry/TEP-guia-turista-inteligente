import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import MapaRota from "./MapaRota";
import type { Percurso } from "../types/schemas";

// O Leaflet depende de um motor de layout real; no jsdom substituímos a API
// por dublês para validar apenas o comportamento do componente.
vi.mock("leaflet", () => {
  const criarCamada = () => {
    const camada = {
      addTo: () => camada,
      bindTooltip: () => camada,
      getBounds: () => ({ isValid: () => false }),
    };
    return camada;
  };
  return {
    map: () => ({ fitBounds: () => {}, remove: () => {} }),
    tileLayer: () => criarCamada(),
    polyline: () => criarCamada(),
    circleMarker: () => criarCamada(),
    latLng: (lat: number, lng: number) => ({ lat, lng }),
  };
});

const PERCURSO: Percurso = {
  distancia_km: 429,
  duracao_min: 320,
  pedagio_reais: 34.5,
  elevacao_ganho_m: 800,
  elevacao_perda_m: 760,
  altitudes_m: [600, 700, 650, 810],
  geometria: [
    [-23.55, -46.63],
    [-23.2, -45.0],
    [-22.91, -43.17],
  ],
  paradas: [
    {
      nome: "Posto Graal",
      latitude: -22.47,
      longitude: -44.45,
      km_do_inicio: 168,
      tipo: "combustivel",
      autonomia_restante_pct: 28,
      nivel: "atencao",
    },
  ],
};

describe("MapaRota", () => {
  it("exibe o placeholder quando não há percurso", () => {
    render(<MapaRota />);
    expect(
      screen.getByText(/o mapa aparece aqui depois que você gerar um roteiro/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renderiza o canvas e as paradas quando há percurso", () => {
    render(<MapaRota percurso={PERCURSO} origem="São Paulo" destino="Rio de Janeiro" />);

    expect(screen.getByRole("img", { name: /mapa do trajeto/i })).toBeInTheDocument();
    expect(screen.getByText("São Paulo → Rio de Janeiro")).toBeInTheDocument();
    expect(screen.getByText("Posto Graal")).toBeInTheDocument();
    expect(screen.getByText(/168 km do início/i)).toBeInTheDocument();
    expect(screen.getByText(/autonomia restante: 28%/i)).toBeInTheDocument();
  });
});
