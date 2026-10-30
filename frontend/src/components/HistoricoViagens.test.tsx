import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import HistoricoViagens from "./HistoricoViagens";
import type { ViagemResumo } from "../types/schemas";

const VIAGENS: ViagemResumo[] = [
  {
    roteiro_id: "r1",
    origem: "São Paulo/SP",
    destino: "Rio de Janeiro/RJ",
    criado_em: "2026-10-30T12:00:00.000Z",
    distancia_km: 429.3,
  },
  {
    roteiro_id: "r2",
    origem: "Recife/PE",
    destino: "Natal/RN",
    criado_em: "2026-10-28T09:30:00.000Z",
    distancia_km: 287.4,
  },
];

describe("HistoricoViagens", () => {
  it("exibe o estado vazio", () => {
    render(<HistoricoViagens viagens={[]} onSelecionar={vi.fn()} />);
    expect(screen.getByText(/nenhuma viagem no histórico/i)).toBeInTheDocument();
  });

  it("lista as viagens e marca a ativa", () => {
    render(<HistoricoViagens viagens={VIAGENS} roteiroAtivoId="r2" onSelecionar={vi.fn()} />);

    expect(screen.getByText("São Paulo/SP → Rio de Janeiro/RJ")).toBeInTheDocument();
    const ativos = screen.getAllByRole("button", { current: true });
    expect(ativos).toHaveLength(1);
    expect(ativos[0]).toHaveTextContent("Recife/PE → Natal/RN");
  });

  it("seleciona a viagem clicada", async () => {
    const usuario = userEvent.setup();
    const selecionar = vi.fn();
    render(<HistoricoViagens viagens={VIAGENS} onSelecionar={selecionar} />);

    await usuario.click(screen.getByText("São Paulo/SP → Rio de Janeiro/RJ"));
    expect(selecionar).toHaveBeenCalledWith("r1");
  });

  it("permite limpar o histórico", async () => {
    const usuario = userEvent.setup();
    const limpar = vi.fn();
    render(<HistoricoViagens viagens={VIAGENS} onSelecionar={vi.fn()} onLimpar={limpar} />);

    await usuario.click(screen.getByRole("button", { name: /limpar histórico/i }));
    expect(limpar).toHaveBeenCalledTimes(1);
  });
});
