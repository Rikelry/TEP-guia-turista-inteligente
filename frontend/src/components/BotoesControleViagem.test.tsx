import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import BotoesControleViagem from "./BotoesControleViagem";

describe("BotoesControleViagem", () => {
  it("dispara exportação e compartilhamento", async () => {
    const usuario = userEvent.setup();
    const exportar = vi.fn();
    const compartilhar = vi.fn();
    render(<BotoesControleViagem onExportar={exportar} onCompartilhar={compartilhar} />);

    await usuario.click(screen.getByRole("button", { name: /^exportar$/i }));
    await usuario.click(screen.getByRole("button", { name: /^compartilhar$/i }));

    expect(exportar).toHaveBeenCalledTimes(1);
    expect(compartilhar).toHaveBeenCalledTimes(1);
  });

  it("mostra o progresso e bloqueia as ações durante a exportação", () => {
    render(<BotoesControleViagem onExportar={vi.fn()} onCompartilhar={vi.fn()} exportando />);

    expect(screen.getByRole("button", { name: /exportando/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^compartilhar$/i })).toBeDisabled();
  });

  it("exibe ações opcionais quando informadas", async () => {
    const usuario = userEvent.setup();
    const novaViagem = vi.fn();
    render(
      <BotoesControleViagem
        onExportar={vi.fn()}
        onCompartilhar={vi.fn()}
        onNovaViagem={novaViagem}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /nova viagem/i }));
    expect(novaViagem).toHaveBeenCalledTimes(1);
  });
});
