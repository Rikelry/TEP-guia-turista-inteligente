import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import BotoesControleViagem from "./BotoesControleViagem";

describe("BotoesControleViagem", () => {
  it("Maps abre em nova aba; WhatsApp, GPX, Imprimir e Excluir chamam suas ações", async () => {
    const props = {
      linkMaps: "https://www.google.com/maps/dir/?api=1",
      onWhatsApp: vi.fn(),
      onGpx: vi.fn(),
      onExcluir: vi.fn(),
      onImprimir: vi.fn(),
    };
    render(<BotoesControleViagem {...props} />);

    expect(screen.getByRole("link", { name: /Abrir no Maps/ })).toHaveAttribute("target", "_blank");
    await userEvent.click(screen.getByRole("button", { name: /WhatsApp/ }));
    await userEvent.click(screen.getByRole("button", { name: /GPX/ }));
    await userEvent.click(screen.getByRole("button", { name: /Imprimir/ }));
    await userEvent.click(screen.getByRole("button", { name: /Excluir/ }));
    expect(props.onWhatsApp).toHaveBeenCalledOnce();
    expect(props.onGpx).toHaveBeenCalledOnce();
    expect(props.onImprimir).toHaveBeenCalledOnce();
    expect(props.onExcluir).toHaveBeenCalledOnce();
  });
});
