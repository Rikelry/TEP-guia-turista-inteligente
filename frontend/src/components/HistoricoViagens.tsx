// Viagens salvas do usuário (GET /minhas-viagens), com abertura e exclusão pontual (DELETE).

import { duracao } from "./MapaRota";
import type { Roteiro } from "../types/schemas";

export interface HistoricoViagensProps {
  viagens: Roteiro[];
  roteiroAtivoId: string | null;
  logado: boolean;
  onSelecionar: (id: string) => void;
  onExcluir: (id: string) => void;
}

export function HistoricoViagens({
  viagens,
  roteiroAtivoId,
  logado,
  onSelecionar,
  onExcluir,
}: HistoricoViagensProps) {
  return (
    <aside className="card" aria-labelledby="historico-titulo">
      <div className="card__header">
        <svg className="icon icon--lg" aria-hidden="true">
          <use href="/icons.svg#ic-relogio" />
        </svg>
        <div>
          <h2 className="card__title" id="historico-titulo">
            Viagens salvas
          </h2>
          <p className="card__subtitle">
            {viagens.length} {viagens.length === 1 ? "viagem salva" : "viagens salvas"}
          </p>
        </div>
      </div>

      {!logado ? (
        <p className="vazio">Entre para ver e salvar suas viagens.</p>
      ) : viagens.length === 0 ? (
        <p className="vazio">Nenhuma viagem salva ainda.</p>
      ) : (
        <ul className="lista">
          {viagens.map((v) => (
            <li key={v.id} className="historico__item" aria-current={v.id === roteiroAtivoId}>
              <button type="button" className="historico__abrir" onClick={() => onSelecionar(v.id)}>
                <span className="historico__meta">
                  <span className="historico__rota">
                    <span aria-hidden="true">🚗</span> {v.origem.nome} → {v.destino.nome}
                  </span>
                  <span className="historico__data">
                    {v.clima.disponivel && v.clima.temperatura_c !== null
                      ? `${v.clima.temperatura_c.toFixed(1)}°C · `
                      : ""}
                    {v.rota.distancia_km !== null
                      ? `${v.rota.distancia_km.toFixed(1)} km`
                      : "sem rota"}
                    {" · "}
                    {new Date(v.criado_em).toLocaleDateString("pt-BR")}
                  </span>
                </span>
                {v.rota.duracao_min !== null && (
                  <span className="historico__duracao">{duracao(v.rota.duracao_min)}</span>
                )}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--pequeno"
                aria-label={`Excluir viagem ${v.origem.nome} → ${v.destino.nome}`}
                onClick={() => onExcluir(v.id)}
              >
                <svg className="icon" aria-hidden="true">
                  <use href="/icons.svg#ic-lixeira" />
                </svg>
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export default HistoricoViagens;
