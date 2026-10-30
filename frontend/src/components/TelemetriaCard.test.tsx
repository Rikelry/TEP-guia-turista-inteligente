import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { ROTEIRO, USUARIO_GOOGLE, USUARIO_VISITANTE } from "../test/fixtures";
import TelemetriaCard, { decompor } from "./TelemetriaCard";
import type { TelemetriaCardProps } from "./TelemetriaCard";

const MEDICAO = {
  latenciaApiMs: 2266.8,
  tempoTotalMs: 2310,
  requestId: "req-abc",
  provedores: ROTEIRO.provedores,
  rotulo: "Piripiri - PI → Natal - RN",
};
const REDE = { online: true, tipo: "4g", rttMs: 50, qualidade: "Excelente" as const };

function montar(extra: Partial<TelemetriaCardProps> = {}) {
  render(
    <TelemetriaCard
      medicao={MEDICAO}
      telemetria={{
        uptime_segundos: 3725,
        requisicoes_total: 40,
        latencia_media_ms: 300,
        roteiros_gerados: 3,
        total_roteiros_salvos: 15,
        provedores_ativos: 4,
        provedores_total: 5,
        circuit_breakers: [
          { nome: "rota", estado: "fechado" },
          { nome: "elevacao", estado: "aberto" },
        ],
      }}
      apiOnline
      usuario={USUARIO_GOOGLE}
      tempoSessao="1min 00s"
      restanteVisitante={null}
      rede={REDE}
      meusRoteiros={11}
      {...extra}
    />,
  );
}

describe("TelemetriaCard", () => {
  it("decompõe o tempo do servidor em APIs externas e processamento local", () => {
    // geocoding 340 + max(clima 190, rota 420) + gemini 1300 = 2060
    expect(decompor(MEDICAO)).toMatchObject({ externoMs: 2060 });
    expect(Math.round(decompor(MEDICAO).servidorMs!)).toBe(207);
    expect(decompor(MEDICAO).maisLento?.[0]).toBe("gemini");
  });

  it("acima de 1 s mostra o aviso apontando a API mais lenta", () => {
    montar();
    expect(screen.getByText("Aviso de latência em APIs externas")).toBeInTheDocument();
    expect(screen.getByText(/Mais lenta: IA \(Google Gemini\) com 1.30 s/)).toBeInTheDocument();
    expect(screen.getByText("req-abc")).toBeInTheDocument();
  });

  it("sem lentidão não mostra o aviso", () => {
    montar({ medicao: { ...MEDICAO, tempoTotalMs: 640 } });
    expect(screen.queryByText("Aviso de latência em APIs externas")).not.toBeInTheDocument();
  });

  it("mostra sessão, conexão, status, uptime e provedores", () => {
    montar();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText(/Google · 1098…4321/)).toBeInTheDocument();
    expect(screen.getByText("Permanente (conta Google)")).toBeInTheDocument();
    expect(screen.getByText("4G · RTT 50 ms · Excelente")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("1h 2min")).toBeInTheDocument();
    expect(screen.getByText("Provedores ativos: 4/5")).toBeInTheDocument();
    expect(screen.getByText(": circuito aberto")).toBeInTheDocument();
  });

  it("visitante mostra persistência temporária", () => {
    montar({ usuario: USUARIO_VISITANTE, restanteVisitante: "1h 59min", medicao: null });
    expect(screen.getByText("Temporária · expira em 1h 59min")).toBeInTheDocument();
    expect(screen.getByText("Planeje uma viagem para ver as métricas.")).toBeInTheDocument();
  });
});
