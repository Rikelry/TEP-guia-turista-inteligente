// Painel de telemetria: tempo de processamento, provedores ativos e volume.

import type { Telemetria } from "../types/schemas";

export interface TelemetriaCardProps {
  telemetria: Telemetria | null;
  carregando?: boolean;
}

const PROVEDORES: { chave: string; rotulo: string }[] = [
  { chave: "open-meteo", rotulo: "Open-Meteo (clima)" },
  { chave: "osrm", rotulo: "OSRM (rotas)" },
  { chave: "gemini", rotulo: "Gemini (guia IA)" },
];

function formatarTempo(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}

export function TelemetriaCard({ telemetria, carregando = false }: TelemetriaCardProps) {
  const ativos = new Set((telemetria?.provedores_ativos ?? []).map((nome) => nome.toLowerCase()));

  return (
    <section className="card" aria-labelledby="telemetria-titulo">
      <div className="card__header">
        <svg className="icon icon--lg" aria-hidden="true">
          <use href="/icons.svg#ic-raio" />
        </svg>
        <div>
          <h2 className="card__title" id="telemetria-titulo">
            Telemetria
          </h2>
          <p className="card__subtitle">Desempenho da última consulta ao microsserviço.</p>
        </div>
      </div>

      {carregando && !telemetria ? (
        <p className="vazio" role="status">
          Coletando métricas...
        </p>
      ) : !telemetria ? (
        <p className="vazio">Nenhuma métrica disponível ainda.</p>
      ) : (
        <>
          <div className="telemetria__grid">
            <div className="badge">
              <span className="metrica__label">Backend</span>
              <span className="metrica__value" data-testid="metricas-backend">
                {formatarTempo(telemetria.tempo_processamento_ms)}
              </span>
            </div>
            <div className="badge">
              <span className="metrica__label">Total (front)</span>
              <span className="metrica__value">
                {formatarTempo(telemetria.tempo_total_front_ms)}
              </span>
            </div>
            <div className="badge">
              <span className="metrica__label">Provedores</span>
              <span className="metrica__value">
                {telemetria.provedores_ativos.length}/{telemetria.provedores_total}
              </span>
            </div>
            <div className="badge">
              <span className="metrica__label">Roteiros</span>
              <span className="metrica__value">{telemetria.total_roteiros}</span>
            </div>
          </div>

          <ul className="provedores" aria-label="Status dos provedores externos">
            {PROVEDORES.map(({ chave, rotulo }) => {
              const ativo = ativos.has(chave);
              return (
                <li className="provedor" key={chave}>
                  <span className={`dot ${ativo ? "dot--ok" : "dot--off"}`} aria-hidden="true" />
                  <span>
                    {rotulo}
                    <span className="sr-only">{ativo ? ": ativo" : ": inativo"}</span>
                  </span>
                </li>
              );
            })}
          </ul>

          {telemetria.correlation_id && (
            <p className="field__hint">Correlation ID: {telemetria.correlation_id}</p>
          )}
        </>
      )}
    </section>
  );
}

export default TelemetriaCard;
