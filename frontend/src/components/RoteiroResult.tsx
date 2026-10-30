// Resultado da viagem em abas: Visão geral (mapa da rota & paradas, clima, guia resumido e
// catálogo) e Guia & clima (streaming SSE completo).

import { useState } from "react";
import type { ReactNode } from "react";

import { linkBuscaMaps } from "../services/roteiros";
import { ESTILOS_VIAGEM } from "../types/schemas";
import type {
  AtrativoItem,
  ClimaInfo,
  MapaRotaResponse,
  Propulsao,
  Roteiro,
  Veiculo,
} from "../types/schemas";
import MapaRota, { duracao } from "./MapaRota";

type Aba = "visao" | "guia";

export interface RoteiroResultProps {
  roteiro: Roteiro;
  mapa: MapaRotaResponse | null;
  rotaAtiva: number;
  onSelecionarRota: (indice: number) => void;
  carregandoMapa?: boolean;
  veiculoMapa?: Veiculo | null;
  onTrocarPropulsao?: (propulsao: Propulsao) => void;
  guia: string;
  streaming?: boolean;
  onAlternarVisita: (atrativoId: string) => void;
  /** Botões de ação (Maps, WhatsApp, GPX, Imprimir, Excluir). */
  acoes?: ReactNode;
}

const ABAS: { id: Aba; rotulo: string; icone: string }[] = [
  { id: "visao", rotulo: "Visão geral", icone: "ic-estrela" },
  { id: "guia", rotulo: "Guia & clima", icone: "ic-nuvem" },
];

/** Divide o guia nos blocos do prompt (📍 IDENTIDADE, 🗓️ ROTEIRO, 🍽️ GASTRONOMIA, 🌤️ CLIMA). */
export function separarSecoes(texto: string): { titulo: string; corpo: string }[] {
  const secoes: { titulo: string; corpo: string }[] = [];
  for (const linha of texto.split("\n")) {
    const m = /^\s*(\S+)\s+([A-ZÀ-Ú ]{4,}):\s*(.*)$/u.exec(linha);
    if (m)
      secoes.push({
        titulo: `${m[1]} ${m[2]!.charAt(0)}${m[2]!.slice(1).toLowerCase()}`,
        corpo: m[3] ?? "",
      });
    else if (linha.trim() && secoes.length) secoes[secoes.length - 1]!.corpo += `\n${linha.trim()}`;
    else if (linha.trim()) secoes.push({ titulo: "", corpo: linha.trim() });
  }
  return secoes.map((s) => ({ ...s, corpo: s.corpo.trim() }));
}

function CardClima({ clima, destino }: { clima: ClimaInfo; destino: string }) {
  return (
    <section className="clima" aria-label={`Clima em ${destino}`}>
      <svg className="icon icon--lg" aria-hidden="true">
        <use href="/icons.svg#ic-termometro" />
      </svg>
      <div className="clima__info">
        <p className="eyebrow">Clima no destino ({destino})</p>
        {clima.disponivel && clima.temperatura_c !== null ? (
          <p className="clima__temp">
            {Math.round(clima.temperatura_c)}°C · {clima.condicao}
          </p>
        ) : (
          <p className="clima__temp clima__temp--off">Clima indisponível agora</p>
        )}
      </div>
      {clima.disponivel && (
        <ul className="clima__lista">
          {clima.sensacao_c !== null && <li>Sensação: {Math.round(clima.sensacao_c)}°C</li>}
          {clima.vento_kmh !== null && <li>Vento: {Math.round(clima.vento_kmh)} km/h</li>}
          {clima.umidade_pct !== null && <li>Umidade: {Math.round(clima.umidade_pct)}%</li>}
        </ul>
      )}
    </section>
  );
}

function Guia({
  texto,
  streaming,
  fallback,
  resumido,
}: {
  texto: string;
  streaming: boolean;
  fallback: boolean;
  resumido: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const secoes = separarSecoes(texto);
  const visiveis = resumido && !aberto ? secoes.slice(0, 1) : secoes;

  return (
    <section className="card card--plano" aria-labelledby="guia-titulo" aria-busy={streaming}>
      <div className="card__header">
        <svg className="icon icon--lg" aria-hidden="true">
          <use href="/icons.svg#ic-estrela" />
        </svg>
        <div>
          <h3 className="card__title" id="guia-titulo">
            Guia do viajante
          </h3>
          <p className="card__subtitle">
            {streaming
              ? "Gerando em tempo real (SSE)..."
              : fallback
                ? "Guia de contingência (IA indisponível)"
                : "Gerado pelo Google Gemini"}
          </p>
        </div>
      </div>
      {secoes.length === 0 ? (
        <p className="guia__stream" aria-live="polite">
          {streaming ? (
            <span className="guia__cursor" aria-hidden="true" />
          ) : (
            "O guia aparece aqui."
          )}
        </p>
      ) : (
        <div className="guia__secoes" aria-live="polite">
          {visiveis.map((s, i) => (
            <div className="guia__secao" key={i}>
              {s.titulo && <h4 className="guia__titulo">{s.titulo}</h4>}
              <p className="guia__texto">
                {s.corpo}
                {streaming && i === visiveis.length - 1 && (
                  <span className="guia__cursor" aria-hidden="true" />
                )}
              </p>
            </div>
          ))}
        </div>
      )}
      {resumido && secoes.length > 1 && (
        <button
          type="button"
          className="btn btn--link guia__mais"
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? "Mostrar menos" : `Ver roteiro completo (${secoes.length - 1} seções)`}
        </button>
      )}
    </section>
  );
}

function Catalogo({
  titulo,
  icone,
  itens,
  cidade,
  onAlternar,
}: {
  titulo: string;
  icone: string;
  itens: AtrativoItem[];
  cidade: string;
  onAlternar: (id: string) => void;
}) {
  if (itens.length === 0) return null;
  const visitados = itens.filter((a) => a.visitado).length;
  return (
    <section className="card" aria-label={titulo}>
      <div className="card__header card__header--entre">
        <div className="card__header">
          <svg className="icon icon--lg" aria-hidden="true">
            <use href={`/icons.svg#${icone}`} />
          </svg>
          <div>
            <h3 className="card__title">{titulo}</h3>
            <p className="card__subtitle">
              {visitados} de {itens.length} marcados como visitados
            </p>
          </div>
        </div>
        <span className="pill">{itens.length} locais</span>
      </div>
      <ul className="atrativos">
        {itens.map((a) => (
          <li key={a.id} className={`atrativo${a.visitado ? " atrativo--visitado" : ""}`}>
            <div className="atrativo__content">
              <p className="eyebrow">{a.tipo === "atrativo" ? "Atrativo" : "Gastronomia"}</p>
              <p className="atrativo__nome">{a.nome}</p>
              <p className="atrativo__desc">{a.descricao}</p>
              <a
                className="atrativo__link"
                href={linkBuscaMaps(a.nome, cidade)}
                target="_blank"
                rel="noreferrer"
              >
                Ver no Maps ↗
              </a>
            </div>
            <button
              type="button"
              className="btn btn--icon"
              aria-pressed={a.visitado}
              aria-label={
                a.visitado ? `Desmarcar ${a.nome} como visitado` : `Marcar ${a.nome} como visitado`
              }
              onClick={() => onAlternar(a.id)}
            >
              <svg className="icon" aria-hidden="true">
                <use href="/icons.svg#ic-check" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RoteiroResult({
  roteiro,
  mapa,
  rotaAtiva,
  onSelecionarRota,
  carregandoMapa = false,
  veiculoMapa = null,
  onTrocarPropulsao,
  guia,
  streaming = false,
  onAlternarVisita,
  acoes,
}: RoteiroResultProps) {
  const [aba, setAba] = useState<Aba>("visao");
  const perfis = (roteiro.perfis ?? [roteiro.estilo_viagem])
    .map((p) => ESTILOS_VIAGEM.find((e) => e.valor === p)?.rotulo ?? p)
    .join(" & ");
  const atrativos = roteiro.atrativos.filter((a) => a.tipo === "atrativo");
  const gastronomia = roteiro.atrativos.filter((a) => a.tipo === "gastronomia");
  const textoGuia = guia || (streaming ? "" : roteiro.guia);

  return (
    <div className="lista lista--folgada resultado">
      <div className="abas-resultado" role="tablist" aria-label="Detalhes da viagem">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`aba-${a.id}`}
            aria-controls={`painel-${a.id}`}
            aria-selected={aba === a.id}
            className="aba-resultado"
            onClick={() => setAba(a.id)}
          >
            <svg className="icon" aria-hidden="true">
              <use href={`/icons.svg#${a.icone}`} />
            </svg>
            {a.rotulo}
          </button>
        ))}
      </div>

      {acoes}

      <section className="card viagem-topo" aria-label="Resumo da viagem">
        <span className="pill pill--perfil">
          {perfis} · {roteiro.dias_estadia} {roteiro.dias_estadia === 1 ? "dia" : "dias"}
        </span>
        <h2 className="viagem-topo__titulo">
          <span aria-hidden="true">🚗</span> {roteiro.origem.nome} → {roteiro.destino.nome}
        </h2>
        <p className="card__subtitle">
          {roteiro.rota.disponivel
            ? `${Math.round(roteiro.rota.distancia_km ?? 0)} km · ${duracao(roteiro.rota.duracao_min)} de carro`
            : roteiro.rota.resumo}
        </p>
      </section>

      {aba === "visao" && (
        <div
          className="lista lista--folgada"
          role="tabpanel"
          id="painel-visao"
          aria-labelledby="aba-visao"
        >
          <MapaRota
            roteiro={roteiro}
            mapa={mapa}
            rotaAtiva={rotaAtiva}
            onSelecionarRota={onSelecionarRota}
            carregando={carregandoMapa}
            veiculo={veiculoMapa}
            {...(onTrocarPropulsao && { onTrocarPropulsao })}
          />
          <CardClima clima={roteiro.clima} destino={roteiro.destino.nome} />
          <Guia texto={textoGuia} streaming={streaming} fallback={roteiro.guia_fallback} resumido />
          <Catalogo
            titulo="Pontos turísticos & atrativos"
            icone="ic-pin"
            itens={atrativos}
            cidade={roteiro.destino.nome}
            onAlternar={onAlternarVisita}
          />
          <Catalogo
            titulo="Restaurantes & gastronomia"
            icone="ic-estrela"
            itens={gastronomia}
            cidade={roteiro.destino.nome}
            onAlternar={onAlternarVisita}
          />
        </div>
      )}

      {aba === "guia" && (
        <div
          className="lista lista--folgada"
          role="tabpanel"
          id="painel-guia"
          aria-labelledby="aba-guia"
        >
          <CardClima clima={roteiro.clima} destino={roteiro.destino.nome} />
          <Guia
            texto={textoGuia}
            streaming={streaming}
            fallback={roteiro.guia_fallback}
            resumido={false}
          />
        </div>
      )}
    </div>
  );
}

export default RoteiroResult;
