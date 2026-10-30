import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ErrorBoundary } from "./ErrorBoundary";

function Balao(): never {
  throw new Error("falha simulada");
}

describe("ErrorBoundary", () => {
  it("renderiza os filhos quando não há erro", () => {
    render(
      <ErrorBoundary>
        <p>Conteúdo seguro</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Conteúdo seguro")).toBeInTheDocument();
  });

  it("captura o erro e exibe o fallback acessível", () => {
    const erroOriginal = console.error;
    console.error = vi.fn();
    try {
      render(
        <ErrorBoundary>
          <Balao />
        </ErrorBoundary>,
      );
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/algo deu errado/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument();
    } finally {
      console.error = erroOriginal;
    }
  });
});
