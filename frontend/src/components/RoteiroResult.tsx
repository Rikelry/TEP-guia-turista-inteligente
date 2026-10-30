// Apresentação dos resultados: clima, custos, rotas alternativas, guia e atrativos.

import { useState } from "react";

import type { Atrativo, Percurso, RoteiroResposta } from "../types/schemas";

export interface RoteiroResultProps {
  resultado: RoteiroResposta;
  /** Texto do guia em streaming; sobrepõe guia_texto enquanto chega. */
  guiaTexto?: string;
  streamingAtivo?: boolean;
  /** Id da rota ativa ("principal" ou o id de uma alternativa). */
  rotaAtivaId?: string | null;
  onSelecionarRota?: (rotaId: string) => void;
  onAlternarAtrativo?: (atrativoId: string) => void;
}

const ID_PRINCIPAL = "principal";

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function duracao(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const min = Math.round(minutos % 60);
  if (horas === 0) return `${min} min`;
  return min === 0 ? `${horas} h` : `${horas} h ${min} min`;
}

export function Altimetria({ altitudes }: { altitudes: number[] }) {
  if (altitudes.length === 0) return null;
  const maximo = Math.max(...altitudes, 1);
  const minimo = Math.min(...altitudes);
  return (
    <div>
      <p className="field__hint">
        Altitude entre {Math.round(minimo)} m e {Math.round(maximo)} m.
      </p>
      <div className="altimetria__bar" role="img" aria-label="Perfil de altimetria da rota">
        {altitudes.map((altitude, indice) => (
          <span
            key={indice}
            className="altimetria__col"
            style={{ height: `${Math.max(4, (altitude / maximo) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function PainelPercurso({ percurso }: { percurso: Percurso }) {
  const [altimetriaAberta, setAltimetriaAberta] = useState(false);

  return (
    <div className="lista">
      <div className="badge-grid">
        <div className="badge">
          <span className="metrica__label">Distância</span>
          <span className="metrica__value">{Math.round(percurso.distancia_km)} km</span>
        </div>
        <div className="badge">
          <span className="metrica__label">Duração</span>
          <span className="metrica__value">{duracao(percurso.duracao_min)}</span>
        </div>
        <div className="badge">
          <span className="metrica__label">Pedágio</span>
          <span className="metrica__value">{moeda(percurso.pedagio_reais)}</span>
        </div>
        <div className="badge">
          <span className="metrica__label">Ganho de elevação</span>
          <span className="metrica__value">{Math.round(percurso.elevacao_ganho_m)} m</span>
        </div>
      </div>

      <div className="accordion">
        <button
          type="button"
          className="accordion__header"
          aria-expanded={altimetriaAberta}
          onClick={() => setAltimetriaAberta((aberta) => !aberta)}
        >
          <svg className="icon" aria-hidden="true">
            <use href="/icons.svg#ic-chevron" />
          </svg>
          Perfil de altimetria
        </button>
        {altimetriaAberta && (
          <div className="accordion__panel">
            <Altimetria altitudes={percurso.altitudes_m} />
          </div>
        )}
      </div>
    </div>
  );
}

function CartaoAtrativo({
  atrativo,
  onAlternar,
}: {
  atrativo: Atrativo;
  onAlternar?: ((id: string) => void) | undefined;
}) {
  return (
    <article className={`atrativo ${atrativo.visitado ? "atrativo--visitado" : ""}`}>
      <svg className="icon" aria-hidden="true">
        <use
          href={
            atrativo.categoria === "gastronomia" ? "/icons.svg#ic-moeda" : "/icons.svg#ic-estrela"
          }
        />
      </svg>
      <div className="atrativo__content">
        <p className="atrativo__nome">{atrativo.nome}</p>
        <p className="atrativo__desc">{atrativo.descricao}</p>
      </div>
      {onAlternar && (
        <button
          type="button"
          className="btn btn--icon"
          aria-pressed={atrativo.visitado}
          onClick={() => onAlternar(atrativo.id)}
        >
          <svg className="icon" aria-hidden="true">
            <use href="/icons.svg#ic-check" />
          </svg>
          <span className="sr-only">
            {atrativo.visitado ? "Desmarcar como visitado" : "Marcar como visitado"}
          </span>
        </button>
      )}
    </article>
  );
}

export function RoteiroResult({
  resultado,
  guiaTexto,
  streamingAtivo = false,
  rotaAtivaId,
  onSelecionarRota,
  onAlternarAtrativo,
}: RoteiroResultProps) {
  const [abaLocal, setAbaLocal] = useState<string>(ID_PRINCIPAL);
  const abaAtiva = rotaAtivaId ?? abaLocal;

  const rotas: { id: string; rotulo: string; descricao?: string; percurso: Percurso }[] = [
    {
      id: ID_PRINCIPAL,
      rotulo: "Rota principal",
      percurso: resultado.percurso,
    },
    ...resultado.rotas_alternativas.map((alternativa) => ({
      id: alternativa.id,
      rotulo: alternativa.rotulo,
      descricao: alternativa.descricao,
      percurso: alternativa.percurso,
    })),
  ];

  const rotaSelecionada = rotas.find((rota) => rota.id === abaAtiva) ?? rotas[0];
  if (!rotaSelecionada) return null;

  const textoGuia = guiaTexto ?? resultado.guia_texto;

  const selecionar = (id: string): void => {
    setAbaLocal(id);
    onSelecionarRota?.(id);
  };

  return (
    <div className="lista" aria-label="Resultado do roteiro">
      <section className="card" aria-labelledby="clima-titulo">
        <div className="card__header">
          <svg className="icon icon--lg" aria-hidden="true">
            <use href="/icons.svg#ic-nuvem" />
          </svg>
          <div>
            <h2 className="card__title" id="clima-titulo">
              Clima em {resultado.destino}
            </h2>
            <p className="card__subtitle">{resultado.clima.descricao}</p>
          </div>
        </div>
        <div className="clima">
          <span className="clima__temp">{Math.round(resultado.clima.temperatura)}°C</span>
          <ul className="clima__lista">
            <li>
              <svg className="icon" aria-hidden="true">
                <use href="/icons.svg#ic-termometro" />
              </svg>{" "}
              Sensação: {Math.round(resultado.clima.sensacao_termica)}°C
            </li>
            <li>
              <svg className="icon" aria-hidden="true">
                <use href="/icons.svg#ic-vento" />
              </svg>{" "}
              Vento: {Math.round(resultado.clima.vento_kmh)} km/h
            </li>
          </ul>
        </div>
      </section>

      <section className="card" aria-labelledby="custos-titulo">
        <div className="card__header">
          <svg className="icon icon--lg" aria-hidden="true">
            <use href="/icons.svg#ic-moeda" />
          </svg>
          <div>
            <h2 className="card__title" id="custos-titulo">
              Custos estimados
            </h2>
            <p className="card__subtitle">
              Emissão de {resultado.custos.emissao_co2_kg.toFixed(1)} kg de CO₂
            </p>
          </div>
        </div>
        <div className="badge-grid">
          <div className="badge">
            <span className="metrica__label">Combustível / energia</span>
            <span className="metrica__value">{moeda(resultado.custos.combustivel_reais)}</span>
          </div>
          <div className="badge">
            <span className="metrica__label">Pedágios</span>
            <span className="metrica__value">{moeda(resultado.custos.pedagio_reais)}</span>
          </div>
          <div className="badge">
            <span className="metrica__label">Total</span>
            <span className="metrica__value">{moeda(resultado.custos.total_reais)}</span>
          </div>
          <div className="badge">
            <span className="metrica__label">Por passageiro</span>
            <span className="metrica__value">{moeda(resultado.custos.por_passageiro_reais)}</span>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="rotas-titulo">
        <div className="card__header">
          <svg className="icon icon--lg" aria-hidden="true">
            <use href="/icons.svg#ic-rota" />
          </svg>
          <div>
            <h2 className="card__title" id="rotas-titulo">
              Rotas
            </h2>
            <p className="card__subtitle">{rotaSelecionada.descricao ?? rotaSelecionada.rotulo}</p>
          </div>
        </div>

        {rotas.length > 1 && (
          <div className="tabs" role="tablist" aria-label="Rotas disponíveis">
            {rotas.map((rota) => (
              <button
                key={rota.id}
                type="button"
                role="tab"
                id={`tab-${rota.id}`}
                aria-selected={rota.id === rotaSelecionada.id}
                aria-controls={`painel-${rota.id}`}
                className="tabs__tab"
                onClick={() => selecionar(rota.id)}
              >
                {rota.rotulo}
              </button>
            ))}
          </div>
        )}

        <div
          role="tabpanel"
          id={`painel-${rotaSelecionada.id}`}
          aria-labelledby={`tab-${rotaSelecionada.id}`}
        >
          <PainelPercurso percurso={rotaSelecionada.percurso} />
        </div>
      </section>

      <section className="card" aria-labelledby="guia-titulo">
        <div className="card__header">
          <svg className="icon icon--lg" aria-hidden="true">
            <use href="/icons.svg#ic-estrela" />
          </svg>
          <div>
            <h2 className="card__title" id="guia-titulo">
              Guia turístico
            </h2>
            <p className="card__subtitle">Gerado por {resultado.diagnostico_guia.modelo}</p>
          </div>
        </div>
        <div className="guia__stream" aria-live="polite" data-testid="guia-stream">
          {textoGuia || (streamingAtivo ? "" : "Guia indisponível para este roteiro.")}
          {streamingAtivo && <span className="guia__cursor" aria-hidden="true" />}
        </div>
        {resultado.diagnostico_guia.fallback_utilizado && (
          <p className="guia__aviso">
            <svg className="icon" aria-hidden="true">
              <use href="/icons.svg#ic-aviso" />
            </svg>
            {resultado.diagnostico_guia.motivo ?? "O guia foi gerado com conteúdo alternativo."}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="atrativos-titulo">
        <div className="card__header">
          <svg className="icon icon--lg" aria-hidden="true">
            <use href="/icons.svg#ic-pin" />
          </svg>
          <div>
            <h2 className="card__title" id="atrativos-titulo">
              Atrativos
            </h2>
            <p className="card__subtitle">
              {resultado.atrativos.filter((atrativo) => atrativo.visitado).length} de{" "}
              {resultado.atrativos.length} marcados como visitados
            </p>
          </div>
        </div>

        {resultado.atrativos.length === 0 ? (
          <p className="vazio">Nenhum atrativo sugerido para este destino.</p>
        ) : (
          <div className="atrativos">
            {resultado.atrativos.map((atrativo) => (
              <CartaoAtrativo
                key={atrativo.id}
                atrativo={atrativo}
                onAlternar={onAlternarAtrativo}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default RoteiroResult;
