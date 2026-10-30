import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import TelaLogin from "./TelaLogin";

describe("TelaLogin", () => {
  it("entra como visitante e mostra o erro da sessão", async () => {
    const onVisitante = vi.fn();
    render(<TelaLogin onEntrarVisitante={onVisitante} erro="Sessão expirada." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sessão expirada.");
    await userEvent.click(screen.getByRole("button", { name: /Entrar como visitante/ }));
    expect(onVisitante).toHaveBeenCalled();
  });

  it("com conta Google guardada oferece voltar sem novo login", async () => {
    const onVoltar = vi.fn();
    render(
      <TelaLogin
        onEntrarVisitante={vi.fn()}
        acaoLoginGoogle={<span>botão google</span>}
        nomeGoogleSalvo="Ana"
        onVoltarGoogle={onVoltar}
      />,
    );
    expect(screen.queryByText("botão google")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Voltar para Ana" }));
    expect(onVoltar).toHaveBeenCalled();
  });

  it("desabilita o visitante enquanto carrega", () => {
    render(<TelaLogin onEntrarVisitante={vi.fn()} carregando />);
    expect(screen.getByRole("button", { name: /Aguarde/ })).toBeDisabled();
  });
});
