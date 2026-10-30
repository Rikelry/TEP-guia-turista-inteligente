import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { USUARIO_GOOGLE, USUARIO_VISITANTE } from "../test/fixtures";
import Header from "./Header";
import type { HeaderProps } from "./Header";

function montar(extra: Partial<HeaderProps> = {}) {
  const props: HeaderProps = {
    usuario: null,
    googleSalvo: null,
    tema: "claro",
    onAlternarTema: vi.fn(),
    onEntrarGoogle: vi.fn(),
    onEntrarVisitante: vi.fn(),
    onVoltarGoogle: vi.fn(),
    onSair: vi.fn(),
    ...extra,
  };
  render(<Header {...props} />);
  return props;
}

describe("Header", () => {
  it("alterna o tema com rótulo acessível", async () => {
    const props = montar();
    await userEvent.click(screen.getByRole("button", { name: "Ativar tema escuro" }));
    expect(props.onAlternarTema).toHaveBeenCalledOnce();
  });

  it("sem sessão oferece entrar como visitante", async () => {
    const props = montar();
    await userEvent.click(screen.getByRole("button", { name: /Entrar como visitante/ }));
    expect(props.onEntrarVisitante).toHaveBeenCalledOnce();
  });

  it("usuário Google pode virar visitante pelo menu", async () => {
    const props = montar({ usuario: USUARIO_GOOGLE });
    expect(screen.getByText("Google conectado")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Ana Souza/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Usar como visitante/ }));
    expect(props.onEntrarVisitante).toHaveBeenCalledOnce();
  });

  it("visitante vê a contagem e volta para a conta Google", async () => {
    const props = montar({
      usuario: USUARIO_VISITANTE,
      googleSalvo: USUARIO_GOOGLE,
      restanteVisitante: "1h 59min",
    });
    expect(screen.getByText("Visitante · expira em 1h 59min")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Visitante/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Voltar para Ana" }));
    expect(props.onVoltarGoogle).toHaveBeenCalledOnce();
  });

  it("o menu fecha com Esc", async () => {
    montar({ usuario: USUARIO_GOOGLE });
    await userEvent.click(screen.getByRole("button", { name: /Ana Souza/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
