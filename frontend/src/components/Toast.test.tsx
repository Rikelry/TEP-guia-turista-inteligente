import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import Toast from "./Toast";
import type { ToastItem } from "./Toast";

const TOASTS: ToastItem[] = [
  { id: "1", tipo: "success", mensagem: "Roteiro criado." },
  { id: "2", tipo: "error", titulo: "Falha", mensagem: "Serviço indisponível." },
];

describe("Toast", () => {
  it("não renderiza nada sem notificações", () => {
    const { container } = render(<Toast toasts={[]} onFechar={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("usa role=alert para erros e status para os demais", () => {
    render(<Toast toasts={TOASTS} onFechar={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Serviço indisponível.");
    expect(screen.getByRole("status")).toHaveTextContent("Roteiro criado.");
    expect(screen.getByRole("region", { name: /notificações/i })).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("fecha a notificação clicada", async () => {
    const usuario = userEvent.setup();
    const fechar = vi.fn();
    render(<Toast toasts={TOASTS} onFechar={fechar} />);

    await usuario.click(screen.getAllByRole("button", { name: /fechar notificação/i })[1]!);
    expect(fechar).toHaveBeenCalledWith("2");
  });
});
