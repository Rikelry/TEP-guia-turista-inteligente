// Listagem visual do histórico de viagens planejadas.

import type { ViagemResumo } from "../types/schemas";

export interface HistoricoViagensProps {
  viagens: ViagemResumo[];
  roteiroAtivoId?: string | null;
  onSelecionar: (roteiroId: string) => void;
  onLimpar?: () => void;
  carregando?: boolean;
}

function formatarData(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoricoViagens({
  viagens,
  roteiroAtivoId,
  onSelecionar,
  onLimpar,
  carregando = false,
}: HistoricoViagensProps) {
  return (
    <section className="card" aria-labelledby="historico-titulo">
      <div className="card__header">
        <svg className="icon icon--lg" aria-hidden="true">
          <use href="/icons.svg#ic-relogio" />
        </svg>
        <div>
          <h2 className="card__title" id="historico-titulo">
            Histórico
          </h2>
          <p className="card__subtitle">
            {viagens.length === 1 ? "1 viagem planejada" : `${viagens.length} viagens planejadas`}
          </p>
        </div>
        {onLimpar && viagens.length > 0 && (
          <button type="button" className="btn btn--icon" onClick={onLimpar}>
            <svg className="icon" aria-hidden="true">
              <use href="/icons.svg#ic-lixeira" />
            </svg>
            <span className="sr-only">Limpar histórico</span>
          </button>
        )}
      </div>

      {carregando ? (
        <p className="vazio" role="status">
          Carregando histórico...
        </p>
      ) : viagens.length === 0 ? (
        <p className="vazio">Nenhuma viagem no histórico ainda.</p>
      ) : (
        <ul className="lista">
          {viagens.map((viagem) => {
            const ativo = viagem.roteiro_id === roteiroAtivoId;
            return (
              <li key={viagem.roteiro_id}>
                <button
                  type="button"
                  className="historico__item"
                  aria-current={ativo ? "true" : undefined}
                  onClick={() => onSelecionar(viagem.roteiro_id)}
                >
                  <svg className="icon" aria-hidden="true">
                    <use href="/icons.svg#ic-mapa" />
                  </svg>
                  <span className="historico__meta">
                    <span className="historico__rota">
                      {viagem.origem} → {viagem.destino}
                    </span>
                    <span className="historico__data">
                      {formatarData(viagem.criado_em)} · {Math.round(viagem.distancia_km)} km
                    </span>
                  </span>
                  <svg className="icon" aria-hidden="true">
                    <use href="/icons.svg#ic-chevron" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default HistoricoViagens;
