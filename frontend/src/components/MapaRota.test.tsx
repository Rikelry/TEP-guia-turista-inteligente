import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { MAPA, ROTEIRO } from "../test/fixtures";
import MapaRota from "./MapaRota";

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
    latLng: (lat: number, lng: number) => ({ lat, lng }),
  };
});

const VEICULO = {
  propulsao: "combustao",
  consumo_km_l: 12,
  tanque_litros: 50,
  preco_litro: 6.2,
} as const;

describe("MapaRota", () => {
  it("mostra métricas, sugestões, paradas, custo total e alterna rotas", async () => {
    const onSelecionar = vi.fn();
    render(
      <MapaRota roteiro={ROTEIRO} mapa={MAPA} rotaAtiva={0} onSelecionarRota={onSelecionar} />,
    );

    expect(screen.getByRole("img", { name: /Piripiri - PI até Natal - RN/ })).toBeInTheDocument();
    expect(screen.getByText("992,5 km")).toBeInTheDocument();
    expect(screen.getByText("+1200 m / -1250 m")).toBeInTheDocument();
    expect(screen.getByText("1 parada")).toBeInTheDocument();
    expect(screen.getByText("~593 km")).toBeInTheDocument();
    expect(screen.getByText(/Sugestões de trajeto rodoviário \(2 opções\)/)).toBeInTheDocument();
    expect(screen.getByText("✓ Em exibição")).toBeInTheDocument();
    expect(screen.getByText(/Parada 1 · Posto de combustível/)).toBeInTheDocument();
    expect(screen.getByText(/chega com 19%/)).toBeInTheDocument();
    expect(screen.getByText("Custo total previsto (combustão)")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Legenda do mapa" })).toHaveTextContent("Parada");

    await userEvent.click(screen.getByRole("tab", { name: "Sugestão 02" }));
    expect(onSelecionar).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByRole("button", { name: /Sugestão 02.*Mais econômica/ }));
    expect(onSelecionar).toHaveBeenCalledTimes(2);
  });

  it("alternador de propulsão pede o outro veículo", async () => {
    const onTrocar = vi.fn();
    render(
      <MapaRota
        roteiro={ROTEIRO}
        mapa={MAPA}
        rotaAtiva={0}
        onSelecionarRota={vi.fn()}
        onTrocarPropulsao={onTrocar}
      />,
    );
    expect(screen.getByRole("button", { name: /Combustão/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: /Elétrico \(EV\)/ }));
    expect(onTrocar).toHaveBeenCalledWith("eletrico");
  });

  it("topografia mostra consumo real, cotas e efeito no consumo", async () => {
    render(
      <MapaRota
        roteiro={ROTEIRO}
        mapa={MAPA}
        rotaAtiva={0}
        onSelecionarRota={vi.fn()}
        veiculo={VEICULO}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Topografia e relevo da rota/ }));
    expect(screen.getByText("Terreno plano (+1,2%)")).toBeInTheDocument();
    expect(screen.getByText("Rendimento real: 11,9 km/l")).toBeInTheDocument();
    expect(screen.getByText("Cota máx: 780 m")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /entre 5 e 780 metros/ })).toBeInTheDocument();
  });

  it("rateio recalcula o valor por pessoa", async () => {
    render(<MapaRota roteiro={ROTEIRO} mapa={MAPA} rotaAtiva={0} onSelecionarRota={vi.fn()} />);
    const sanfona = screen.getByRole("button", { name: /Divisão de custos/ });
    expect(sanfona).toHaveTextContent(/2 pessoas · R\$\s*274,39\/pessoa/);
    await userEvent.click(sanfona);
    await userEvent.click(screen.getByRole("button", { name: "Mais um passageiro" }));
    expect(sanfona).toHaveTextContent(/3 pessoas · R\$\s*182,93\/pessoa/);
  });

  it("sem rota rodoviária mostra o aviso do backend", () => {
    const ilha = {
      ...ROTEIRO,
      rota: {
        ...ROTEIRO.rota,
        disponivel: false,
        resumo: "Sem rota rodoviária direta.",
        geometria: [],
      },
    };
    render(<MapaRota roteiro={ilha} mapa={null} rotaAtiva={0} onSelecionarRota={vi.fn()} />);
    expect(screen.getByText("Sem rota rodoviária direta.")).toBeInTheDocument();
  });
});
