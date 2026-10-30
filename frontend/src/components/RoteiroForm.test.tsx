import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import RoteiroForm, { ESTADO_INICIAL, montarRequisicao, validarRoteiro } from "./RoteiroForm";

describe("RoteiroForm — validação unitária", () => {
  it("acusa erros nos campos obrigatórios vazios", () => {
    const erros = validarRoteiro(ESTADO_INICIAL);
    expect(erros.origem_cidade).toBeDefined();
    expect(erros.destino_uf).toBeDefined();
  });

  it("ignora os campos de combustão quando a propulsão é elétrica", () => {
    const erros = validarRoteiro({
      ...ESTADO_INICIAL,
      origem_cidade: "Recife",
      origem_uf: "PE",
      destino_cidade: "Natal",
      destino_uf: "RN",
      propulsao: "eletrico",
      eficiencia_km_kwh: "0",
    });
    expect(erros.eficiencia_km_kwh).toBeDefined();
    expect(erros.consumo_km_l).toBeUndefined();
  });

  it("converte o estado em um payload tipado", () => {
    const payload = montarRequisicao({
      ...ESTADO_INICIAL,
      origem_cidade: " São Paulo ",
      origem_uf: "sp",
      destino_cidade: "Rio de Janeiro",
      destino_uf: "rj",
      dias_estadia: "4",
      passageiros: "3",
    });
    expect(payload.origem_cidade).toBe("São Paulo");
    expect(payload.origem_uf).toBe("SP");
    expect(payload.destino_uf).toBe("RJ");
    expect(payload.dias_estadia).toBe(4);
    expect(payload.passageiros).toBe(3);
    expect(typeof payload.consumo_km_l).toBe("number");
  });
});

describe("RoteiroForm — interação", () => {
  it("bloqueia o envio e sinaliza os campos inválidos", async () => {
    const usuario = userEvent.setup();
    const enviar = vi.fn();
    render(<RoteiroForm onEnviar={enviar} />);

    await usuario.click(screen.getByRole("button", { name: /gerar roteiro/i }));

    expect(enviar).not.toHaveBeenCalled();
    const origem = screen.getByLabelText(/cidade de origem/i);
    expect(origem).toHaveAttribute("aria-invalid", "true");
    expect(origem).toHaveAttribute("aria-describedby", "erro-origem_cidade");
    expect(screen.getByText("Informe a cidade de origem.")).toBeInTheDocument();
  });

  it("envia o roteiro preenchido", async () => {
    const usuario = userEvent.setup();
    const enviar = vi.fn();
    render(<RoteiroForm onEnviar={enviar} />);

    await usuario.type(screen.getByLabelText(/cidade de origem/i), "São Paulo");
    await usuario.type(screen.getByLabelText(/uf de origem/i), "SP");
    await usuario.type(screen.getByLabelText(/cidade de destino/i), "Rio de Janeiro");
    await usuario.type(screen.getByLabelText(/uf de destino/i), "RJ");
    await usuario.click(screen.getByRole("button", { name: /gerar roteiro/i }));

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]![0]).toMatchObject({
      origem_cidade: "São Paulo",
      origem_uf: "SP",
      destino_cidade: "Rio de Janeiro",
      destino_uf: "RJ",
      propulsao: "combustao",
    });
  });

  it("troca os campos de veículo ao selecionar propulsão elétrica", async () => {
    const usuario = userEvent.setup();
    render(<RoteiroForm onEnviar={vi.fn()} />);

    await usuario.click(screen.getByRole("button", { name: /elétrico/i }));

    expect(screen.getByLabelText(/eficiência \(km\/kwh\)/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/consumo \(km\/l\)/i)).not.toBeInTheDocument();
  });

  it("mostra o estado de carregamento no botão", () => {
    render(<RoteiroForm onEnviar={vi.fn()} carregando />);

    const botao = screen.getByRole("button", { name: /gerando roteiro/i });
    expect(botao).toBeDisabled();
  });
});
