import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import TelemetriaCard from "./TelemetriaCard";

describe("TelemetriaCard", () => {
  it("mostra o estado vazio sem métricas", () => {
    render(<TelemetriaCard telemetria={null} />);
    expect(screen.getByText(/nenhuma métrica disponível/i)).toBeInTheDocument();
  });

  it("mostra o carregamento enquanto coleta métricas", () => {
    render(<TelemetriaCard telemetria={null} carregando />);
    expect(screen.getByRole("status")).toHaveTextContent(/coletando métricas/i);
  });

  it("formata tempos e marca os provedores ativos", () => {
    render(
      <TelemetriaCard
        telemetria={{
          tempo_processamento_ms: 812,
          tempo_total_front_ms: 1500,
          provedores_ativos: ["open-meteo", "gemini"],
          provedores_total: 3,
          total_roteiros: 5,
          correlation_id: "abc-123",
        }}
      />,
    );

    expect(screen.getByTestId("metricas-backend")).toHaveTextContent("812 ms");
    expect(screen.getByText("1.50 s")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
    expect(screen.getAllByText(": ativo")).toHaveLength(2);
    expect(screen.getAllByText(": inativo")).toHaveLength(1);
  });
});
