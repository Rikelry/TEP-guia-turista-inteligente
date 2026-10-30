import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { ROTEIRO } from "../test/fixtures";
import HistoricoViagens from "./HistoricoViagens";

describe("HistoricoViagens", () => {
  it("lista com clima, distância e duração; abre e exclui pontualmente", async () => {
    const onSelecionar = vi.fn();
    const onExcluir = vi.fn();
    render(
      <HistoricoViagens
        viagens={[ROTEIRO]}
        roteiroAtivoId="r1"
        logado
        onSelecionar={onSelecionar}
        onExcluir={onExcluir}
      />,
    );

    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByText(/27.1°C · 992.5 km/)).toBeInTheDocument();
    expect(screen.getByText("14h 22min")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveAttribute("aria-current", "true");

    await userEvent.click(screen.getByRole("button", { name: /27.1°C/ }));
    expect(onSelecionar).toHaveBeenCalledWith("r1");
    await userEvent.click(
      screen.getByRole("button", { name: "Excluir viagem Piripiri - PI → Natal - RN" }),
    );
    expect(onExcluir).toHaveBeenCalledWith("r1");
  });

  it("estados vazios", () => {
    const { rerender } = render(
      <HistoricoViagens
        viagens={[]}
        roteiroAtivoId={null}
        logado={false}
        onSelecionar={vi.fn()}
        onExcluir={vi.fn()}
      />,
    );
    expect(screen.getByText("Entre para ver e salvar suas viagens.")).toBeInTheDocument();
    rerender(
      <HistoricoViagens
        viagens={[]}
        roteiroAtivoId={null}
        logado
        onSelecionar={vi.fn()}
        onExcluir={vi.fn()}
      />,
    );
    expect(screen.getByText("Nenhuma viagem salva ainda.")).toBeInTheDocument();
  });
});
