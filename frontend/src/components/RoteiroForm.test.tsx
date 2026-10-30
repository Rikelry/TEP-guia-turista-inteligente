import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { ufsDaCidade } from "../services/municipios";
import RoteiroForm, { ESTADO_INICIAL, montarRequisicao, validarFormulario } from "./RoteiroForm";

const DESTINOS = [
  { cidade: "Piripiri", uf: "PI", lat: -4.272, lon: -41.777, resumo: "" },
  { cidade: "Natal", uf: "RN", lat: -5.795, lon: -35.209, resumo: "" },
  { cidade: "Recife", uf: "PE", lat: -8.048, lon: -34.877, resumo: "" },
];
const ufsCatalogo = (cidade: string) => ufsDaCidade(cidade, null, DESTINOS);

describe("validação e payload", () => {
  it("monta o corpo exato do POST /planejar (veículo aninhado e perfis)", () => {
    const pedido = montarRequisicao({
      ...ESTADO_INICIAL,
      origem_cidade: " <b>Piripiri</b> ",
      destino_cidade: "Natal",
      destino_uf: "RN",
      perfis: ["gastronomico", "cultural"],
      passageiros: "4",
    });
    expect(pedido).toMatchObject({
      origem_cidade: "Piripiri",
      estilo_viagem: "gastronomico",
      perfis: ["gastronomico", "cultural"],
      passageiros: 4,
      veiculo: { propulsao: "combustao", consumo_km_l: 12, tanque_litros: 50, preco_litro: 6.2 },
    });
  });

  it("recusa o que o backend recusaria (422)", () => {
    const erros = validarFormulario({
      ...ESTADO_INICIAL,
      origem_cidade: "123",
      destino_cidade: "",
      passageiros: "9",
      perfis: [],
    });
    expect(Object.keys(erros).sort()).toEqual([
      "destino_cidade",
      "origem_cidade",
      "passageiros",
      "perfis",
    ]);
  });
});

describe("RoteiroForm", () => {
  it("sugere destinos a mais de 400 km da origem e preenche ao clicar", async () => {
    render(<RoteiroForm onEnviar={vi.fn()} destinos={DESTINOS} />);
    await userEvent.type(screen.getByLabelText("Cidade de origem"), "Piripiri");
    const natal = screen.getByRole("button", { name: /Natal \(RN\)/ });
    expect(natal).toHaveTextContent(/\d+ km/);
    await userEvent.click(natal);
    expect(screen.getByLabelText("Cidade de destino")).toHaveValue("Natal");
  });

  it("envia o pedido válido e bloqueia o botão enquanto carrega", async () => {
    const onEnviar = vi.fn();
    const { rerender } = render(
      <RoteiroForm onEnviar={onEnviar} destinos={DESTINOS} ufsDaCidade={ufsCatalogo} />,
    );
    await userEvent.type(screen.getByLabelText("Cidade de origem"), "Piripiri");
    await userEvent.type(screen.getByLabelText("Cidade de destino"), "Natal");
    await userEvent.click(screen.getByRole("radio", { name: "3 dias" }));
    await userEvent.click(screen.getByRole("radio", { name: /100% Elétrico/ }));
    await userEvent.click(screen.getByRole("button", { name: "Planejar viagem" }));
    expect(onEnviar).toHaveBeenCalledWith(
      expect.objectContaining({
        destino_uf: "RN",
        dias_estadia: 3,
        veiculo: expect.objectContaining({ propulsao: "eletrico" }),
      }),
    );

    rerender(
      <RoteiroForm onEnviar={onEnviar} destinos={DESTINOS} ufsDaCidade={ufsCatalogo} carregando />,
    );
    expect(screen.getByRole("button", { name: /Planejando/ })).toBeDisabled();
  });

  it("mostra os erros e não envia", async () => {
    const onEnviar = vi.fn();
    render(<RoteiroForm onEnviar={onEnviar} />);
    await userEvent.click(screen.getByRole("button", { name: "Planejar viagem" }));
    expect(onEnviar).not.toHaveBeenCalled();
    expect(screen.getByText("Informe uma cidade de origem válida.")).toBeInTheDocument();
  });

  it("perfil aceita de 1 a todos", async () => {
    render(<RoteiroForm onEnviar={vi.fn()} />);
    const cultural = screen.getByRole("button", { name: /Cultural/ });
    expect(cultural).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /Família/ }));
    expect(screen.getByRole("button", { name: /Família/ })).toHaveAttribute("aria-pressed", "true");
    expect(cultural).toHaveAttribute("aria-pressed", "true");
  });

  it("corrige o UF ao digitar a cidade e avisa nomes repetidos", async () => {
    const ufs: Record<string, string[]> = { natal: ["RN"], "bom jesus": ["PI", "RS"] };
    render(
      <RoteiroForm onEnviar={vi.fn()} ufsDaCidade={(c) => ufs[c.trim().toLowerCase()] ?? []} />,
    );
    const ufDestino = screen.getAllByLabelText("UF")[1]!;
    await userEvent.type(screen.getByLabelText("Cidade de destino"), "Natal");
    expect(ufDestino).toHaveValue("RN");
    expect(screen.getByText("UF corrigido para RN.")).toBeInTheDocument();

    const ufOrigem = screen.getAllByLabelText("UF")[0]!;
    await userEvent.type(screen.getByLabelText("Cidade de origem"), "Bom Jesus");
    expect(ufOrigem).toHaveValue("PI");
    expect(screen.getByText("Existe em PI, RS. Confira o UF.")).toBeInTheDocument();
  });
});
