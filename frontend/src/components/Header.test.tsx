import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import Header from "./Header";
import type { Usuario } from "../types/schemas";

const USUARIO: Usuario = {
  tipo: "visitante",
  id: "v1",
  nome: "Geovany",
};

describe("Header", () => {
  it("alterna o tema com estado acessível", async () => {
    const usuario = userEvent.setup();
    const alternar = vi.fn();
    render(
      <Header
        usuario={null}
        tema="claro"
        onAlternarTema={alternar}
        onEntrarVisitante={vi.fn()}
        onSair={vi.fn()}
      />,
    );

    const botao = screen.getByRole("button", { name: /ativar tema escuro/i });
    expect(botao).toHaveAttribute("aria-pressed", "false");

    await usuario.click(botao);
    expect(alternar).toHaveBeenCalledTimes(1);
  });

  it("reflete o tema escuro no rótulo", () => {
    render(
      <Header
        usuario={null}
        tema="escuro"
        onAlternarTema={vi.fn()}
        onEntrarVisitante={vi.fn()}
        onSair={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /ativar tema claro/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("permite entrar como visitante quando não há sessão", async () => {
    const usuario = userEvent.setup();
    const entrar = vi.fn();
    render(
      <Header
        usuario={null}
        tema="claro"
        onAlternarTema={vi.fn()}
        onEntrarVisitante={entrar}
        onSair={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole("button", { name: /entrar como visitante/i }));
    expect(entrar).toHaveBeenCalledTimes(1);
  });

  it("abre o menu do usuário e encerra a sessão", async () => {
    const usuario = userEvent.setup();
    const sair = vi.fn();
    render(
      <Header
        usuario={USUARIO}
        tema="claro"
        onAlternarTema={vi.fn()}
        onEntrarVisitante={vi.fn()}
        onSair={sair}
      />,
    );

    const chip = screen.getByRole("button", { name: /geovany/i });
    expect(chip).toHaveAttribute("aria-expanded", "false");

    await usuario.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "true");

    await usuario.click(screen.getByRole("menuitem", { name: /encerrar sessão/i }));
    expect(sair).toHaveBeenCalledTimes(1);
  });
});
