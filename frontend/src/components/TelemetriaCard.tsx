// Painel de telemetria: latência da última consulta (X-Process-Time, tempo total no navegador e
// tempo de cada provedor), Correlation-ID, sessão do usuário, conexão e status da API.

import { LIMITE_LATENCIA_MS } from "../config";
import type { MedicaoViagem } from "../hooks/useViagem";
import type { StatusRede } from "../hooks/useNetworkStatus";
import { mascararId } from "../types/schemas";
import type { TelemetriaApi, Usuario } from "../types/schemas";

export interface TelemetriaCardProps {
  medicao: MedicaoViagem | null;
  telemetria: TelemetriaApi | null;
  apiOnline: boolean | null;
  usuario: Usuario | null;
  tempoSessao: string;
  restanteVisitante: string | null;
  rede: StatusRede;
  meusRoteiros: number;
}

const NOMES_PROVEDOR: Record<string, string> = {
  geocoding: "Geocoding (Open-Meteo)",
  clima: "Clima (Open-Meteo)",
  rota: "Rotas (OSRM)",
  elevacao: "Relevo (Open-Elevation)",
  gemini: "IA (Google Gemini)",
};

export function formatarMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

function formatarUptime(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return h ? `${h}h ${m}min` : m ? `${m}min` : `${Math.round(segundos)}s`;
}

/** Quebra o tempo do servidor em: chamadas externas (pelos estágios do /planejar) e processamento local. */
export function decompor(m: MedicaoViagem) {
  const t = (nome: string) => m.provedores[nome]?.tempo_ms ?? 0;
  const externoMs = t("geocoding") + Math.max(t("clima"), t("rota")) + t("gemini");
  const servidorMs = m.latenciaApiMs === null ? null : Math.max(0, m.latenciaApiMs - externoMs);
  const [maisLento] = Object.entries(m.provedores).sort((a, b) => b[1].tempo_ms - a[1].tempo_ms);
  return { externoMs, servidorMs, maisLento };
}

export function TelemetriaCard({
  medicao,
  telemetria,
  apiOnline,
  usuario,
  tempoSessao,
  restanteVisitante,
  rede,
  meusRoteiros,
}: TelemetriaCardProps) {
  const partes = medicao ? decompor(medicao) : null;
  const lento = medicao !== null && medicao.tempoTotalMs > LIMITE_LATENCIA_MS;

  return (
    <section className="card" aria-labelledby="telemetria-titulo">
      <div className="card__header">
        <svg className="icon icon--lg" aria-hidden="true">
          <use href="/icons.svg#ic-raio" />
        </svg>
        <div>
          <h2 className="card__title" id="telemetria-titulo">
            Telemetria e desempenho
          </h2>
          <p className="card__subtitle">Latência da última consulta e saúde do microsserviço.</p>
        </div>
      </div>

      {lento && partes && medicao && (
        <div className="aviso aviso--atencao" role="status">
          <p className="aviso__titulo">
            <svg className="icon" aria-hidden="true">
              <use href="/icons.svg#ic-aviso" />
            </svg>
            Aviso de latência em APIs externas
          </p>
          <ul className="aviso__lista">
            <li>
              Tempo total de {formatarMs(medicao.tempoTotalMs)}; {formatarMs(partes.externoMs)}{" "}
              foram de consultas a serviços externos.
            </li>
            {partes.maisLento && (
              <li>
                Mais lenta: {NOMES_PROVEDOR[partes.maisLento[0]] ?? partes.maisLento[0]} com{" "}
                {formatarMs(partes.maisLento[1].tempo_ms)}.
              </li>
            )}
            {partes.servidorMs !== null && (
              <li>Processamento interno do FastAPI: {formatarMs(partes.servidorMs)}.</li>
            )}
          </ul>
        </div>
      )}

      <div className="painel-secao">
        <h3 className="painel-secao__titulo">
          {medicao ? `Última viagem (${medicao.rotulo})` : "Última viagem"}
        </h3>
        {!medicao || !partes ? (
          <p className="vazio">Planeje uma viagem para ver as métricas.</p>
        ) : (
          <>
            <div className="telemetria__grid">
              <div className="badge">
                <span className="metrica__label">Tempo total (front)</span>
                <span className={`metrica__value${lento ? " metrica__value--alerta" : ""}`}>
                  {formatarMs(medicao.tempoTotalMs)}
                </span>
              </div>
              <div className="badge">
                <span className="metrica__label">Backend (X-Process-Time)</span>
                <span className="metrica__value">{formatarMs(medicao.latenciaApiMs)}</span>
              </div>
              <div className="badge">
                <span className="metrica__label">APIs externas + IA</span>
                <span className="metrica__value">{formatarMs(partes.externoMs)}</span>
              </div>
              <div className="badge">
                <span className="metrica__label">Servidor local</span>
                <span className="metrica__value">{formatarMs(partes.servidorMs)}</span>
              </div>
            </div>
            <ul className="detalhe-apis" aria-label="Tempo por provedor">
              {Object.entries(medicao.provedores).map(([nome, p]) => (
                <li key={nome}>
                  <span
                    className={`dot ${p.fallback ? "dot--off" : "dot--ok"}`}
                    aria-hidden="true"
                  />
                  {NOMES_PROVEDOR[nome] ?? nome}: <strong>{formatarMs(p.tempo_ms)}</strong>
                  {p.fallback && <span className="sr-only"> (usou contingência)</span>}
                  {p.fallback && <em> · contingência</em>}
                </li>
              ))}
            </ul>
            {medicao.requestId && (
              <p className="field__hint">
                Correlation-ID: <code>{medicao.requestId}</code>
              </p>
            )}
          </>
        )}
      </div>

      <div className="painel-secao">
        <h3 className="painel-secao__titulo">Sessão do usuário e conexão</h3>
        <dl className="sessao">
          <div>
            <dt>Usuário ativo</dt>
            <dd>
              {usuario ? (
                <>
                  <strong>{usuario.nome}</strong> (
                  {usuario.tipo === "google"
                    ? `Google · ${mascararId(usuario.id)}`
                    : "Visitante temporário"}
                  )
                </>
              ) : (
                "Nenhum"
              )}
            </dd>
          </div>
          {usuario && (
            <>
              <div>
                <dt>Início da sessão</dt>
                <dd>{new Date(usuario.desde).toLocaleString("pt-BR")}</dd>
              </div>
              <div>
                <dt>Tempo de sessão</dt>
                <dd>{tempoSessao}</dd>
              </div>
              <div>
                <dt>Persistência</dt>
                <dd className={usuario.tipo === "google" ? "texto-ok" : "texto-atencao"}>
                  {usuario.tipo === "google"
                    ? "Permanente (conta Google)"
                    : `Temporária · expira em ${restanteVisitante ?? "—"}`}
                </dd>
              </div>
              <div>
                <dt>Meus roteiros</dt>
                <dd>{meusRoteiros}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Conexão</dt>
            <dd>
              <span className={`pill ${rede.online ? "pill--ok" : "pill--erro"}`}>
                {rede.online
                  ? `${rede.tipo ? `${rede.tipo.toUpperCase()} · ` : ""}${rede.rttMs !== null ? `RTT ${rede.rttMs} ms · ` : ""}${rede.qualidade}`
                  : "Offline"}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="telemetria__grid telemetria__grid--3">
        <div className="badge">
          <span className="metrica__label">Status da API</span>
          <span className="metrica__value status-api">
            <span
              className={`dot ${apiOnline ? "dot--ok" : apiOnline === false ? "dot--off" : ""}`}
              aria-hidden="true"
            />
            {apiOnline === null ? "…" : apiOnline ? "Online" : "Offline"}
          </span>
        </div>
        <div className="badge">
          <span className="metrica__label">Uptime</span>
          <span className="metrica__value">
            {telemetria ? formatarUptime(telemetria.uptime_segundos) : "—"}
          </span>
        </div>
        <div className="badge">
          <span className="metrica__label">Roteiros totais</span>
          <span className="metrica__value">{telemetria?.total_roteiros_salvos ?? "—"}</span>
        </div>
      </div>

      {telemetria && (
        <div className="provedores" aria-label="Provedores concorrentes">
          <span className="metrica__label">
            Provedores ativos: {telemetria.provedores_ativos}/{telemetria.provedores_total}
          </span>
          {telemetria.circuit_breakers.map((b) => (
            <span className="provedor" key={b.nome}>
              <span
                className={`dot ${b.estado === "aberto" ? "dot--off" : "dot--ok"}`}
                aria-hidden="true"
              />
              {NOMES_PROVEDOR[b.nome] ?? b.nome}
              {b.estado !== "fechado" && <span className="sr-only">: circuito {b.estado}</span>}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export default TelemetriaCard;
