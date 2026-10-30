// Painel "Mapa da rota & paradas": alterna combustão/elétrico e as sugestões de trajeto, mostra
// as métricas da rota ativa, o mapa Leaflet (rota, alternativas tracejadas, origem, destino e
// paradas numeradas), a topografia com o efeito no consumo, o custo total e o rateio.

import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
// O CSS do Leaflet vem do index.html (link com integridade SRI).

import { LIMITES } from "../types/schemas";
import type {
  AltimetriaInfo,
  MapaRotaResponse,
  Propulsao,
  RotaAlternativa,
  Roteiro,
  Veiculo,
} from "../types/schemas";

export interface MapaRotaProps {
  roteiro: Roteiro;
  mapa: MapaRotaResponse | null;
  rotaAtiva: number;
  onSelecionarRota: (indice: number) => void;
  carregando?: boolean;
  /** Veículo usado no cálculo do /mapa-rota (consumo nominal da topografia). */
  veiculo?: Veiculo | null;
  /** Sem callback, o alternador combustão/elétrico não aparece. */
  onTrocarPropulsao?: (propulsao: Propulsao) => void;
}

export const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const km = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
const decimal = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function duracao(minutos: number | null): string {
  if (minutos === null) return "—";
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m} min`;
}

/** "Sugestão 01 · Menor tempo" → ["Sugestão 01", "Menor tempo"]. */
function partesRotulo(rotulo: string): [string, string] {
  const [numero, nome] = rotulo.split(" · ");
  return [numero ?? rotulo, nome ?? rotulo];
}

/** Classifica o relevo pela penalização de consumo calculada no backend. */
export function classificarRelevo(alt: AltimetriaInfo): string {
  if (!alt.disponivel) return "Relevo indisponível";
  const p = alt.penalizacao_pct;
  if (p < 0) return "Predomínio de descidas";
  if (p <= 2) return "Terreno plano";
  if (p <= 5) return "Terreno suave";
  if (p <= 10) return "Terreno ondulado";
  return "Terreno montanhoso";
}

const comSinal = (v: number) => `${v > 0 ? "+" : ""}${decimal(v)}`;

/** Cor de um token do tema (o Leaflet desenha em SVG e não entende var()). */
function corDoTema(token: string, reserva: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return valor || reserva;
}

export function PerfilRelevo({ perfil }: { perfil: number[] }) {
  if (perfil.length < 2) return null;
  const max = Math.max(...perfil);
  const min = Math.min(...perfil);
  const faixa = Math.max(1, max - min);
  const pontos = perfil
    .map((alt, i) => {
      const x = (i / (perfil.length - 1)) * 300;
      const y = 76 - ((alt - min) / faixa) * 68;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <figure className="perfil">
      <figcaption className="perfil__topo">
        <span className="pill pill--info">Cota mín: {Math.round(min)} m</span>
        <span className="perfil__titulo">Perfil topográfico de elevação</span>
        <span className="pill pill--erro">Cota máx: {Math.round(max)} m</span>
      </figcaption>
      <svg
        className="perfil__grafico"
        viewBox="0 0 300 80"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Perfil de relevo entre ${Math.round(min)} e ${Math.round(max)} metros`}
      >
        <polygon className="perfil__area" points={`0,80 ${pontos} 300,80`} />
        <polyline className="perfil__linha" points={pontos} />
      </svg>
    </figure>
  );
}

function Estatistica({ icone, rotulo, valor }: { icone: string; rotulo: string; valor: string }) {
  return (
    <div className="estatistica">
      <svg className="icon icon--lg" aria-hidden="true">
        <use href={`/icons.svg#${icone}`} />
      </svg>
      <span className="estatistica__rotulo">{rotulo}</span>
      <span className="estatistica__valor">{valor}</span>
    </div>
  );
}

function Sugestoes({
  alternativas,
  ativa,
  onSelecionar,
}: {
  alternativas: RotaAlternativa[];
  ativa: RotaAlternativa;
  onSelecionar: (indice: number) => void;
}) {
  const [numeroAtiva, nomeAtiva] = partesRotulo(ativa.rotulo);
  const outras = alternativas.filter((a) => a.indice !== ativa.indice);
  const maisRapidaOutra = Math.min(...outras.map((a) => a.rota.duracao_min ?? Infinity));
  const ganho = Math.round(maisRapidaOutra - (ativa.rota.duracao_min ?? 0));
  const comparacao =
    Number.isFinite(ganho) && ganho !== 0
      ? `, ~${Math.abs(ganho)} min mais ${ganho > 0 ? "rápida" : "lenta"} que a outra opção`
      : "";

  return (
    <section className="sugestoes-trajeto" aria-labelledby="sugestoes-titulo">
      <h4 className="sugestoes-trajeto__titulo" id="sugestoes-titulo">
        <svg className="icon" aria-hidden="true">
          <use href="/icons.svg#ic-rota" />
        </svg>
        Sugestões de trajeto rodoviário ({alternativas.length} opções)
      </h4>
      <p className="card__subtitle">
        {numeroAtiva} selecionada: {nomeAtiva.toLowerCase()} ({km(ativa.rota.distancia_km ?? 0)}
        {comparacao}).
      </p>
      <ul className="sugestoes-trajeto__lista">
        {alternativas.map((alt) => {
          const [numero, nome] = partesRotulo(alt.rotulo);
          const selecionada = alt.indice === ativa.indice;
          return (
            <li key={alt.indice}>
              <button
                type="button"
                className="sugestao-trajeto"
                aria-pressed={selecionada}
                onClick={() => onSelecionar(alt.indice)}
              >
                <strong>{numero}</strong>
                <span>
                  {km(alt.rota.distancia_km ?? 0)} · {duracao(alt.rota.duracao_min)}
                  {alt.altimetria.disponivel && ` · ⛰ +${Math.round(alt.altimetria.ganho_m)} m`}
                </span>
                <span className="sugestao-trajeto__nota">
                  {nome} · {moeda(alt.custos.custo_total)}
                </span>
                {selecionada && <span className="pill pill--perfil">✓ Em exibição</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Topografia({
  altimetria,
  veiculo,
}: {
  altimetria: AltimetriaInfo;
  veiculo: Veiculo | null;
}) {
  const [aberto, setAberto] = useState(false);
  const classe = classificarRelevo(altimetria);
  const nominal = veiculo
    ? veiculo.propulsao === "combustao"
      ? { valor: veiculo.consumo_km_l, unidade: "km/l" }
      : { valor: veiculo.eficiencia_km_kwh, unidade: "km/kWh" }
    : null;
  const real = nominal ? nominal.valor / (1 + altimetria.penalizacao_pct / 100) : null;

  return (
    <div className="accordion">
      <button
        type="button"
        className="accordion__header accordion__header--entre"
        aria-expanded={aberto}
        aria-controls="relevo-painel"
        onClick={() => setAberto((v) => !v)}
      >
        <span className="accordion__titulo">
          <svg className="icon" aria-hidden="true">
            <use href="/icons.svg#ic-chevron" />
          </svg>
          Topografia e relevo da rota
        </span>
        <span className="pill pill--info">
          {classe}
          {altimetria.disponivel && ` (${comSinal(altimetria.penalizacao_pct)}%)`}
        </span>
      </button>
      {aberto && (
        <div
          className={`accordion__panel${altimetria.disponivel ? " relevo" : ""}`}
          id="relevo-painel"
        >
          {altimetria.disponivel ? (
            <>
              {nominal && real !== null && (
                <div className="relevo__consumo">
                  <span>
                    Consumo nominal:{" "}
                    <strong>
                      {decimal(nominal.valor)} {nominal.unidade}
                    </strong>
                  </span>
                  <span className="pill pill--erro">
                    Rendimento real: {decimal(real)} {nominal.unidade}
                  </span>
                </div>
              )}
              <p className="relevo__numeros">
                <span>
                  Subidas acumuladas: <strong>+{Math.round(altimetria.ganho_m)} m</strong>
                </span>
                <span>
                  Descidas acumuladas: <strong>-{Math.round(altimetria.perda_m)} m</strong>
                </span>
                <span>
                  Desnível líquido: <strong>{Math.round(altimetria.desnivel_liquido_m)} m</strong>
                </span>
                {altimetria.altitude_max_m !== null && (
                  <span>
                    Altitude máxima: <strong>{Math.round(altimetria.altitude_max_m)} m</strong>
                  </span>
                )}
              </p>
              <p className="relevo__texto">
                {classe} (+{Math.round(altimetria.ganho_m)} m de subidas / -
                {Math.round(altimetria.perda_m)} m de descidas). Efeito no consumo de{" "}
                {comSinal(altimetria.penalizacao_pct)}% por causa das retomadas de aceleração.
              </p>
              <PerfilRelevo perfil={altimetria.perfil} />
            </>
          ) : (
            <p className="field__hint">
              Perfil de relevo indisponível agora (Open-Elevation fora do ar). O consumo usa o valor
              nominal.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Rateio({ total, passageirosIniciais }: { total: number; passageirosIniciais: number }) {
  const [aberto, setAberto] = useState(false);
  const [pessoas, setPessoas] = useState(passageirosIniciais);
  const porPessoa = total / pessoas;
  const rotuloPessoas = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  return (
    <div className="accordion">
      <button
        type="button"
        className="accordion__header accordion__header--entre"
        aria-expanded={aberto}
        aria-controls="rateio-painel"
        onClick={() => setAberto((v) => !v)}
      >
        <span className="accordion__titulo">
          <svg className="icon" aria-hidden="true">
            <use href="/icons.svg#ic-chevron" />
          </svg>
          Divisão de custos entre passageiros
        </span>
        <span className="pill pill--info">
          {rotuloPessoas(pessoas, "pessoa", "pessoas")} · {moeda(porPessoa)}/pessoa
        </span>
      </button>
      {aberto && (
        <div className="accordion__panel rateio" id="rateio-painel">
          <div className="rateio__controle">
            <button
              type="button"
              className="btn btn--icon"
              aria-label="Menos um passageiro"
              disabled={pessoas <= LIMITES.passageirosMin}
              onClick={() => setPessoas((n) => n - 1)}
            >
              −
            </button>
            <output aria-live="polite" className="rateio__valor">
              {rotuloPessoas(pessoas, "passageiro", "passageiros")}
            </output>
            <button
              type="button"
              className="btn btn--icon"
              aria-label="Mais um passageiro"
              disabled={pessoas >= LIMITES.passageirosMax}
              onClick={() => setPessoas((n) => n + 1)}
            >
              +
            </button>
          </div>
          <p>
            Cada pessoa paga <strong>{moeda(porPessoa)}</strong> de {moeda(total)}.
          </p>
        </div>
      )}
    </div>
  );
}

const PROPULSOES = [
  { valor: "combustao", icone: "ic-combustivel", rotulo: "Combustão" },
  { valor: "eletrico", icone: "ic-raio", rotulo: "Elétrico (EV)" },
] as const;

export function MapaRota({
  roteiro,
  mapa,
  rotaAtiva,
  onSelecionarRota,
  carregando = false,
  veiculo = null,
  onTrocarPropulsao,
}: MapaRotaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const alternativas = mapa?.rotas ?? [];
  const ativa = alternativas[rotaAtiva] ?? alternativas[0] ?? null;
  const rota = ativa?.rota ?? roteiro.rota;
  const temRota = roteiro.rota.disponivel && rota.geometria.length > 1;
  const propulsao = ativa?.custos.propulsao ?? veiculo?.propulsao ?? "combustao";
  const paradas = ativa?.autonomia.paradas ?? [];

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !roteiro.rota.disponivel) return;
    // Recalcula aqui dentro para o efeito depender só de dados estáveis (mapa, rotaAtiva, roteiro).
    const alternativas = mapa?.rotas ?? [];
    const ativa = alternativas[rotaAtiva] ?? alternativas[0] ?? null;
    const geometria = ativa?.rota.geometria ?? roteiro.rota.geometria;
    if (geometria.length < 2) return;

    const cores = {
      rota: corDoTema("--md-primary", "#0b6e4f"),
      alternativa: corDoTema("--md-outline", "#717a72"),
      origem: corDoTema("--md-secondary", "#0f4c81"),
      destino: corDoTema("--md-error", "#b3261e"),
    };

    const mapaLeaflet = L.map(container, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(mapaLeaflet);

    // As outras alternativas aparecem tracejadas por baixo da ativa.
    alternativas
      .filter((alt) => alt.indice !== ativa?.indice)
      .forEach((alt) => {
        L.polyline(
          alt.rota.geometria.map(([a, b]) => L.latLng(a, b)),
          { color: cores.alternativa, weight: 4, opacity: 0.6, dashArray: "6 8" },
        )
          .bindTooltip(alt.rotulo)
          .addTo(mapaLeaflet);
      });

    const linha = L.polyline(
      geometria.map(([lat, lon]) => L.latLng(lat, lon)),
      { color: cores.rota, weight: 5, opacity: 0.9 },
    ).addTo(mapaLeaflet);

    const ponto = (lat: number, lon: number, cor: string, texto: string) =>
      L.circleMarker(L.latLng(lat, lon), {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: cor,
        fillOpacity: 1,
      })
        .bindTooltip(texto)
        .addTo(mapaLeaflet);
    ponto(roteiro.origem.lat, roteiro.origem.lon, cores.origem, `Origem: ${roteiro.origem.nome}`);
    ponto(
      roteiro.destino.lat,
      roteiro.destino.lon,
      cores.destino,
      `Destino: ${roteiro.destino.nome}`,
    );

    ativa?.autonomia.paradas.forEach((p) => {
      L.marker(L.latLng(p.lat, p.lon), {
        icon: L.divIcon({
          className: "mapa__parada",
          html: `<span>${p.ordem}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        keyboard: false,
      })
        .bindTooltip(
          `Parada ${p.ordem} · ${p.tipo === "eletroposto" ? "Eletroposto" : "Posto"} · km ${Math.round(p.km)}`,
        )
        .addTo(mapaLeaflet);
    });

    const limites = linha.getBounds();
    if (limites.isValid()) mapaLeaflet.fitBounds(limites, { padding: [24, 24] });
    return () => {
      mapaLeaflet.remove();
    };
  }, [mapa, rotaAtiva, roteiro]);

  return (
    <section className="card mapa-painel" aria-labelledby="mapa-titulo">
      <div className="card__header">
        <svg className="icon icon--lg" aria-hidden="true">
          <use href="/icons.svg#ic-mapa" />
        </svg>
        <div>
          <h3 className="card__title" id="mapa-titulo">
            Mapa da rota & paradas
          </h3>
          <p className="card__subtitle">Traçado rodoviário e paradas calculadas pela autonomia.</p>
        </div>
      </div>

      {!temRota ? (
        <div className="mapa__placeholder">
          <svg className="icon icon--lg" aria-hidden="true">
            <use href="/icons.svg#ic-aviso" />
          </svg>
          <p>{roteiro.rota.resumo}</p>
        </div>
      ) : (
        <div className="lista lista--folgada">
          <div className="mapa-painel__controles">
            {onTrocarPropulsao && (
              <div className="segmented" role="group" aria-label="Veículo do cálculo">
                {PROPULSOES.map((p) => (
                  <button
                    key={p.valor}
                    type="button"
                    className="segmented__option"
                    aria-pressed={propulsao === p.valor}
                    disabled={carregando}
                    onClick={() => propulsao !== p.valor && onTrocarPropulsao(p.valor)}
                  >
                    <svg className="icon" aria-hidden="true">
                      <use href={`/icons.svg#${p.icone}`} />
                    </svg>
                    {p.rotulo}
                  </button>
                ))}
              </div>
            )}
            {alternativas.length > 1 && (
              <div className="segmented" role="tablist" aria-label="Rotas alternativas">
                {alternativas.map((alt) => (
                  <button
                    key={alt.indice}
                    type="button"
                    role="tab"
                    className="segmented__option"
                    aria-selected={alt.indice === ativa?.indice}
                    title={alt.rotulo}
                    onClick={() => onSelecionarRota(alt.indice)}
                  >
                    {partesRotulo(alt.rotulo)[0]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="estatisticas">
            <Estatistica
              icone="ic-rota"
              rotulo="Distância"
              valor={rota.distancia_km !== null ? km(rota.distancia_km) : "—"}
            />
            <Estatistica icone="ic-relogio" rotulo="Duração" valor={duracao(rota.duracao_min)} />
            {ativa && (
              <>
                <Estatistica
                  icone="ic-pin"
                  rotulo="Paradas"
                  valor={
                    paradas.length === 0
                      ? "Sem paradas"
                      : `${paradas.length} ${paradas.length === 1 ? "parada" : "paradas"}`
                  }
                />
                <Estatistica
                  icone={propulsao === "eletrico" ? "ic-raio" : "ic-combustivel"}
                  rotulo="Autonomia"
                  valor={`~${Math.round(ativa.autonomia.autonomia_ajustada_km)} km`}
                />
                <Estatistica
                  icone="ic-estrela"
                  rotulo="Sugestão de rota"
                  valor={partesRotulo(ativa.rotulo)[1]}
                />
                <Estatistica
                  icone="ic-mapa"
                  rotulo="Topografia"
                  valor={
                    ativa.altimetria.disponivel
                      ? `+${Math.round(ativa.altimetria.ganho_m)} m / -${Math.round(ativa.altimetria.perda_m)} m`
                      : "—"
                  }
                />
              </>
            )}
          </div>

          {ativa && alternativas.length > 1 && (
            <Sugestoes alternativas={alternativas} ativa={ativa} onSelecionar={onSelecionarRota} />
          )}

          <div className="mapa__moldura">
            <div
              ref={containerRef}
              className="mapa__canvas"
              role="img"
              aria-label={`Mapa do trajeto de ${roteiro.origem.nome} até ${roteiro.destino.nome}`}
            />
            <ul className="mapa__legenda" aria-label="Legenda do mapa">
              <li>
                <span className="mapa__cor mapa__cor--origem" aria-hidden="true" />
                Origem
              </li>
              <li>
                <span className="mapa__cor mapa__cor--destino" aria-hidden="true" />
                Destino
              </li>
              <li>
                <span className="mapa__cor mapa__cor--rota" aria-hidden="true" />
                Rota
              </li>
              <li>
                <span className="mapa__cor mapa__cor--parada" aria-hidden="true" />
                Parada
              </li>
            </ul>
          </div>
          {carregando && (
            <p className="field__hint" role="status">
              Calculando relevo, paradas e custos...
            </p>
          )}

          {ativa && (
            <>
              <section aria-labelledby="paradas-titulo">
                <h4 className="secao__titulo" id="paradas-titulo">
                  Paradas estratégicas (reserva de {ativa.autonomia.reserva_pct}%)
                </h4>
                {paradas.length === 0 ? (
                  <p className="field__hint">
                    A autonomia de {Math.round(ativa.autonomia.autonomia_ajustada_km)} km cobre a
                    viagem sem parar.
                  </p>
                ) : (
                  <ul className="lista">
                    {paradas.map((p) => (
                      <li className="parada-item" key={p.ordem}>
                        <span className="parada-item__numero" aria-hidden="true">
                          {p.ordem}
                        </span>
                        <span className="historico__meta">
                          <span className="historico__rota">
                            Parada {p.ordem} ·{" "}
                            {p.tipo === "eletroposto" ? "Eletroposto" : "Posto de combustível"}
                          </span>
                          <span className="historico__data">
                            km {Math.round(p.km)} · chega com {Math.round(p.nivel_chegada_pct)}%
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Topografia altimetria={ativa.altimetria} veiculo={veiculo} />

              <section className="custo-total" aria-labelledby="custos-titulo">
                <div>
                  <h4 className="custo-total__rotulo" id="custos-titulo">
                    Custo total previsto ({propulsao === "eletrico" ? "elétrico" : "combustão"})
                  </h4>
                  <p className="custo-total__valor">{moeda(ativa.custos.custo_total)}</p>
                </div>
                <ul className="custo-total__itens">
                  <li>
                    {ativa.custos.unidade === "kWh" ? "Energia" : "Combustível"} (
                    {decimal(ativa.custos.quantidade_energia)} {ativa.custos.unidade}):{" "}
                    <strong>{moeda(ativa.custos.custo_energia)}</strong>
                  </li>
                  <li>
                    Pedágios: <strong>{moeda(ativa.custos.custo_pedagio)}</strong>
                  </li>
                </ul>
              </section>

              <Rateio
                key={`${ativa.indice}-${ativa.custos.custo_total}`}
                total={ativa.custos.custo_total}
                passageirosIniciais={ativa.custos.passageiros}
              />

              <p className="field__hint">
                Emissão de {decimal(ativa.custos.emissoes_kg_co2)} kg de CO₂.{" "}
                {ativa.custos.observacao}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default MapaRota;
