import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import RoteiroResult from "./RoteiroResult";
import type { RoteiroResposta } from "../types/schemas";

const RESULTADO: RoteiroResposta = {
  roteiro_id: "r1",
  user_id: "u1",
  origem: "São Paulo/SP",
  destino: "Rio de Janeiro/RJ",
  clima: {
    temperatura: 28.4,
    sensacao_termica: 30,
    vento_kmh: 12.3,
    descricao: "Ensolarado",
  },
  percurso: {
    distancia_km: 429.3,
    duracao_min: 320,
    pedagio_reais: 34.5,
    elevacao_ganho_m: 800,
    elevacao_perda_m: 760,
    altitudes_m: [600, 700, 650, 810],
    geometria: [
      [-23.55, -46.63],
      [-22.91, -43.17],
    ],
    paradas: [],
  },
  rotas_alternativas: [
    {
      id: "alt1",
      rotulo: "Rota secundária",
      descricao: "Trajeto sem pedágio.",
      percurso: {
        distancia_km: 451,
        duracao_min: 360,
        pedagio_reais: 0,
        elevacao_ganho_m: 900,
        elevacao_perda_m: 880,
        altitudes_m: [620, 720, 700],
        geometria: [
          [-23.55, -46.63],
          [-22.2, -44.0],
          [-22.91, -43.17],
        ],
        paradas: [],
      },
    },
  ],
  custos: {
    combustivel_reais: 200,
    pedagio_reais: 34.5,
    total_reais: 234.5,
    por_passageiro_reais: 117.25,
    emissao_co2_kg: 61.4,
  },
  atrativos: [
    {
      id: "a1",
      nome: "Centro Histórico",
      descricao: "Casarões coloniais.",
      categoria: "ponto_turistico",
      visitado: false,
    },
  ],
  guia_texto: "Guia completo do destino.",
  diagnostico_guia: {
    status: "sucesso",
    modelo: "gemini-3.6-flash",
    fallback_utilizado: false,
  },
  criado_em: "2026-10-30T12:00:00.000Z",
};

describe("RoteiroResult", () => {
  it("apresenta clima, custos e atrativos", () => {
    render(<RoteiroResult resultado={RESULTADO} />);

    expect(screen.getByText("28°C")).toBeInTheDocument();
    expect(screen.getByText("Ensolarado")).toBeInTheDocument();
    expect(screen.getByText(/234,50/)).toBeInTheDocument();
    expect(screen.getByText(/429 km/)).toBeInTheDocument();
    expect(screen.getByText("Centro Histórico")).toBeInTheDocument();
    expect(screen.getByText("Guia completo do destino.")).toBeInTheDocument();
  });

  it("troca de rota pela aba e notifica o orquestrador", async () => {
    const usuario = userEvent.setup();
    const selecionar = vi.fn();
    render(<RoteiroResult resultado={RESULTADO} onSelecionarRota={selecionar} />);

    await usuario.click(screen.getByRole("tab", { name: /rota secundária/i }));

    expect(selecionar).toHaveBeenCalledWith("alt1");
    expect(screen.getByText(/trajeto sem pedágio/i)).toBeInTheDocument();
  });

  it("mostra o cursor enquanto o guia está em streaming", () => {
    const { container } = render(
      <RoteiroResult resultado={RESULTADO} guiaTexto="Em gera" streamingAtivo />,
    );
    expect(screen.getByTestId("guia-stream")).toHaveTextContent("Em gera");
    expect(container.querySelector(".guia__cursor")).toBeInTheDocument();
  });

  it("alerta quando o guia usa conteúdo alternativo", () => {
    render(
      <RoteiroResult
        resultado={{
          ...RESULTADO,
          diagnostico_guia: {
            status: "fallback",
            modelo: "gemini-3.6-flash",
            fallback_utilizado: true,
            motivo: "Limite de cota atingido.",
          },
        }}
      />,
    );
    expect(screen.getByText("Limite de cota atingido.")).toBeInTheDocument();
  });

  it("alterna o atrativo como visitado", async () => {
    const usuario = userEvent.setup();
    const alternar = vi.fn();
    render(<RoteiroResult resultado={RESULTADO} onAlternarAtrativo={alternar} />);

    const cartao = screen.getByRole("article");
    await usuario.click(within(cartao).getByRole("button", { name: /marcar como visitado/i }));
    expect(alternar).toHaveBeenCalledWith("a1");
  });

  it("abre o perfil de altimetria no acordeão", async () => {
    const usuario = userEvent.setup();
    render(<RoteiroResult resultado={RESULTADO} />);

    await usuario.click(screen.getByRole("button", { name: /perfil de altimetria/i }));
    expect(screen.getByRole("img", { name: /perfil de altimetria da rota/i })).toBeInTheDocument();
  });
});
