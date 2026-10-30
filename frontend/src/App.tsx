// Composição de demonstração da SPA — reúne todos os componentes visuais.
// Observação: a versão final do App (estado global, hooks e serviços) é
// responsabilidade do Rikelry; este arquivo existe para permitir a prévia e a
// validação visual dos componentes de interface.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./hooks/useAuth";

import TelaLogin from "./components/TelaLogin";
import GoogleLoginButton from "./components/GoogleLoginButton";
import BotoesControleViagem from "./components/BotoesControleViagem";
import Footer from "./components/Footer";
import Header from "./components/Header";
import type { Tema } from "./components/Header";
import HistoricoViagens from "./components/HistoricoViagens";
import MapaRota from "./components/MapaRota";
import RoteiroForm from "./components/RoteiroForm";
import RoteiroResult from "./components/RoteiroResult";
import TelemetriaCard from "./components/TelemetriaCard";
import Toast from "./components/Toast";
import type { ToastItem, ToastTipo } from "./components/Toast";
import type {
  Percurso,
  RoteiroRequest,
  RoteiroResposta,
  Telemetria,
  ViagemResumo,
} from "./types/schemas";

const GUIA_DEMO = `## Bem-vindo
import type {

Este é um guia de demonstração gerado localmente no frontend. Quando o
microsserviço FastAPI estiver conectado, o texto chega em streaming via SSE.

- Prove a gastronomia típica da região.
- Reserve um dia para o centro histórico.
- Leve água e protetor solar para os passeios ao ar livre.`;

function interpolar(
  inicio: [number, number],
  fim: [number, number],
  total: number,
): [number, number][] {
  return Array.from({ length: total }, (_, indice) => {
    const t = indice / (total - 1);
    const desvio = Math.sin(t * Math.PI) * 0.08;
    return [inicio[0] + (fim[0] - inicio[0]) * t + desvio, inicio[1] + (fim[1] - inicio[1]) * t];
  });
}

function gerarPercurso(distancia: number, paradas: Percurso["paradas"]): Percurso {
  const geometria = interpolar([-23.55, -46.63], [-22.91, -43.17], 12);
  return {
    distancia_km: distancia,
    duracao_min: distancia * 0.75,
    pedagio_reais: 34.5,
    elevacao_ganho_m: 820,
    elevacao_perda_m: 780,
    altitudes_m: geometria.map((_, indice) => 620 + Math.sin(indice / 2) * 140 + indice * 12),
    geometria,
    paradas,
  };
}

function montarRoteiroDemo(dados: RoteiroRequest): RoteiroResposta {
  const distancia = 429;
  const percurso = gerarPercurso(distancia, [
    {
      nome: "Posto Graal — Resende",
      latitude: -22.47,
      longitude: -44.45,
      km_do_inicio: 168,
      tipo: dados.propulsao === "eletrico" ? "recarga" : "combustivel",
      autonomia_restante_pct: 28,
      nivel: "atencao",
    },
  ]);

  const alternativa = gerarPercurso(451, []);

  return {
    roteiro_id: `demo-${Date.now()}`,
    user_id: "visitante-demo",
    origem: `${dados.origem_cidade}/${dados.origem_uf}`,
    destino: `${dados.destino_cidade}/${dados.destino_uf}`,
    clima: {
      temperatura: 27,
      sensacao_termica: 29,
      vento_kmh: 14,
      descricao: "Parcialmente nublado",
    },
    percurso,
    rotas_alternativas: [
      {
        id: "alternativa-1",
        rotulo: "Rota secundária",
        descricao: "Trajeto mais longo, porém sem pedágio.",
        percurso: alternativa,
      },
    ],
    custos: {
      combustivel_reais: 214.8,
      pedagio_reais: 34.5,
      total_reais: 249.3,
      por_passageiro_reais: 249.3 / Math.max(1, dados.passageiros),
      emissao_co2_kg: 61.4,
    },
    atrativos: [
      {
        id: "a1",
        nome: "Centro Histórico",
        descricao: "Casarões coloniais e museus a céu aberto.",
        categoria: "ponto_turistico",
        visitado: false,
      },
      {
        id: "a2",
        nome: "Feira Gastronômica",
        descricao: "Comida de rua regional aos sábados.",
        categoria: "gastronomia",
        visitado: true,
      },
    ],
    guia_texto: GUIA_DEMO,
    diagnostico_guia: {
      status: "sucesso",
      modelo: "demo-local",
      fallback_utilizado: false,
    },
    criado_em: new Date().toISOString(),
  };
}

export function App() {
  const [tema, setTema] = useState<Tema>("claro");
  const {
    usuario,
    carregando: authCarregando,
    erro: authErro,
    loginVisitante,
    loginGoogle,
    logout,
  } = useAuth();
  const [resultado, setResultado] = useState<RoteiroResposta | null>(null);
  const [roteiroAtivoId, setRoteiroAtivoId] = useState<string | null>(null);
  const [guiaTexto, setGuiaTexto] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [viagens, setViagens] = useState<ViagemResumo[]>([]);
  const [telemetria, setTelemetria] = useState<Telemetria | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema === "escuro" ? "dark" : "light");
  }, [tema]);

  const handleLoginGoogle = async (credential: string): Promise<void> => {
    try {
      await loginGoogle(credential);
    } catch {
      // O erro já é armazenado pelo hook.
    }
  };

  const handleEntrarVisitante = async (): Promise<void> => {
    try {
      await loginVisitante();
    } catch {
      // O erro já é armazenado pelo hook useAuth.
    }
  };

  const notificar = (tipo: ToastTipo, mensagem: string, titulo?: string): void => {
    const id = Math.random().toString(36).slice(2);
    setToasts((atual) => [...atual, { id, tipo, mensagem, titulo }]);
    window.setTimeout(() => {
      setToasts((atual) => atual.filter((toast) => toast.id !== id));
    }, 5000);
  };

  const percursoAtivo = useMemo(() => {
    if (!resultado) return null;
    if (!roteiroAtivoId || roteiroAtivoId === "principal") return resultado.percurso;
    return (
      resultado.rotas_alternativas.find((rota) => rota.id === roteiroAtivoId)?.percurso ??
      resultado.percurso
    );
  }, [resultado, roteiroAtivoId]);

  const gerarRoteiro = (dados: RoteiroRequest): void => {
    setCarregando(true);
    const inicio = performance.now();

    window.setTimeout(() => {
      const resposta = montarRoteiroDemo(dados);
      setResultado(resposta);
      setRoteiroAtivoId("principal");
      setViagens((atual) => [
        {
          roteiro_id: resposta.roteiro_id,
          origem: resposta.origem,
          destino: resposta.destino,
          criado_em: resposta.criado_em,
          distancia_km: resposta.percurso.distancia_km,
        },
        ...atual,
      ]);
      setTelemetria({
        tempo_processamento_ms: 812,
        tempo_total_front_ms: performance.now() - inicio,
        provedores_ativos: ["open-meteo", "osrm", "gemini"],
        provedores_total: 3,
        total_roteiros: viagens.length + 1,
        correlation_id: "demo-0001",
      });
      setCarregando(false);
      notificar("success", "Roteiro gerado com dados de demonstração.");
      iniciarStreaming(resposta.guia_texto);
    }, 600);
  };

  const iniciarStreaming = (texto: string): void => {
    setGuiaTexto("");
    setStreaming(true);
    let indice = 0;
    const intervalo = window.setInterval(() => {
      indice += 6;
      setGuiaTexto(texto.slice(0, indice));
      if (indice >= texto.length) {
        window.clearInterval(intervalo);
        setStreaming(false);
      }
    }, 30);
  };

  const exportar = (): void => {
    if (!resultado) return;
    const blob = new Blob([JSON.stringify(resultado, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `roteiro-${resultado.roteiro_id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notificar("success", "Roteiro exportado em JSON.");
  };

  const compartilhar = async (): Promise<void> => {
    if (!resultado) return;
    const texto = `${resultado.origem} → ${resultado.destino}`;
    try {
      await navigator.clipboard.writeText(texto);
      notificar("info", "Resumo copiado para a área de transferência.");
    } catch {
      notificar("error", "Não foi possível compartilhar neste navegador.");
    }
  };

  if (authCarregando) {
    return (
      <main className="container page">
        <p role="status">Verificando sua sessão...</p>
      </main>
    );
  }

  if (!usuario) {
    return (
      <TelaLogin
        onEntrarVisitante={handleEntrarVisitante}
        acaoLoginGoogle={<GoogleLoginButton onCredential={handleLoginGoogle} />}
        carregando={authCarregando}
        erro={authErro}
      />
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo principal
      </a>

      <Header
        usuario={usuario}
        tema={tema}
        onAlternarTema={() => setTema((atual) => (atual === "claro" ? "escuro" : "claro"))}
        onEntrarVisitante={loginVisitante}
        onSair={logout}
      />

      <main className="container page" id="conteudo">
        <div className="layout">
          <div className="lista">
            <RoteiroForm onEnviar={gerarRoteiro} carregando={carregando} />
            {resultado && (
              <>
                <BotoesControleViagem onExportar={exportar} onCompartilhar={compartilhar} />
                <RoteiroResult
                  resultado={resultado}
                  guiaTexto={guiaTexto}
                  streamingAtivo={streaming}
                  rotaAtivaId={roteiroAtivoId}
                  onSelecionarRota={setRoteiroAtivoId}
                  onAlternarAtrativo={(id) =>
                    setResultado((atual) =>
                      atual
                        ? {
                            ...atual,
                            atrativos: atual.atrativos.map((atrativo) =>
                              atrativo.id === id
                                ? { ...atrativo, visitado: !atrativo.visitado }
                                : atrativo,
                            ),
                          }
                        : atual,
                    )
                  }
                />
              </>
            )}
          </div>

          <aside className="lista">
            <MapaRota
              percurso={percursoAtivo}
              origem={resultado?.origem}
              destino={resultado?.destino}
            />
            <TelemetriaCard telemetria={telemetria} carregando={carregando} />
            <HistoricoViagens
              viagens={viagens}
              roteiroAtivoId={resultado?.roteiro_id ?? null}
              onSelecionar={() => notificar("info", "Seleção de histórico cabe ao App final.")}
              onLimpar={() => setViagens([])}
            />
          </aside>
        </div>
      </main>

      <Footer />
      <Toast
        toasts={toasts}
        onFechar={(id) => setToasts((atual) => atual.filter((t) => t.id !== id))}
      />
    </div>
  );
}

export default App;
