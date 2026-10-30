// Orquestrador global: sessão híbrida, tema, rede, planejamento e layout em duas colunas
// (planejador e resultado à esquerda; telemetria e viagens salvas à direita).

import { useCallback, useEffect, useRef, useState } from "react";

import BotoesControleViagem from "./components/BotoesControleViagem";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Footer from "./components/Footer";
import Header from "./components/Header";
import HistoricoViagens from "./components/HistoricoViagens";
import RoteiroForm from "./components/RoteiroForm";
import RoteiroResult from "./components/RoteiroResult";
import GoogleLoginButton from "./components/GoogleLoginButton";
import TelaLogin from "./components/TelaLogin";
import TelemetriaCard from "./components/TelemetriaCard";
import Toast from "./components/Toast";
import { useAuth } from "./hooks/useAuth";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { useSessionTimer } from "./hooks/useSessionTimer";
import { useTheme } from "./hooks/useTheme";
import { useToasts } from "./hooks/useToasts";
import { useViagem } from "./hooks/useViagem";
import { obterPosicao } from "./services/geolocation";
import type { Ponto } from "./services/geolocation";
import { carregarMunicipios, ufsDaCidade } from "./services/municipios";
import type { IndiceMunicipios } from "./services/municipios";
import { linkGoogleMaps, listarDestinos } from "./services/roteiros";
import type { Destino } from "./types/schemas";

export function App() {
  const { tema, alternarTema } = useTheme();
  const { toasts, notificar, remover } = useToasts();
  const auth = useAuth();
  const rede = useNetworkStatus();
  const sessao = useSessionTimer(
    auth.usuario?.desde,
    auth.usuario?.expiraEm,
    auth.expirarVisitante,
  );
  const viagem = useViagem(auth.usuario, notificar);

  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [municipios, setMunicipios] = useState<IndiceMunicipios | null>(null);
  const [posicao, setPosicao] = useState<Ponto | null>(null);
  const [buscandoPosicao, setBuscandoPosicao] = useState(false);

  // Catálogo para autocomplete e sugestões por Haversine.
  useEffect(() => {
    listarDestinos()
      .then(setDestinos)
      .catch(() => setDestinos([]));
    // Municípios do IBGE para corrigir o UF; sem eles, vale só o catálogo.
    carregarMunicipios()
      .then(setMunicipios)
      .catch(() => setMunicipios(null));
  }, []);

  const buscarUfs = useCallback(
    (cidade: string) => ufsDaCidade(cidade, municipios, destinos),
    [municipios, destinos],
  );

  const pedirPosicao = useCallback(async () => {
    setBuscandoPosicao(true);
    const ponto = await obterPosicao();
    setBuscandoPosicao(false);
    if (ponto) setPosicao(ponto);
    else
      notificar(
        "info",
        "Não foi possível obter sua localização. Digite a cidade de origem.",
        "GPS",
      );
  }, [notificar]);

  useEffect(() => {
    if (auth.erro) notificar("error", auth.erro, "Sessão");
  }, [auth.erro, notificar]);

  // Avisa quando a conexão cai ou volta (não no primeiro carregamento).
  const onlineAnterior = useRef(rede.online);
  useEffect(() => {
    if (onlineAnterior.current === rede.online) return;
    onlineAnterior.current = rede.online;
    if (rede.online) notificar("success", "Conexão restabelecida.");
    else
      notificar("info", "Você está sem internet. As consultas voltam quando a conexão retornar.");
  }, [rede.online, notificar]);

  const { roteiro } = viagem;

  // Sem sessão, o app fica atrás da tela de login (Google ou visitante).
  if (!auth.usuario) {
    return (
      <div className="app-shell">
        <TelaLogin
          onEntrarVisitante={() => void auth.entrarComoVisitante()}
          acaoLoginGoogle={
            <GoogleLoginButton onCredential={(c) => void auth.entrarComGoogle(c)} tema={tema} />
          }
          nomeGoogleSalvo={auth.googleSalvo?.nome.split(" ")[0] ?? null}
          onVoltarGoogle={auth.voltarParaGoogle}
          carregando={auth.carregando}
          erro={auth.erro}
        />
        <Footer />
        <Toast toasts={toasts} onFechar={remover} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo principal
      </a>

      <Header
        usuario={auth.usuario}
        googleSalvo={auth.googleSalvo}
        carregando={auth.carregando}
        tema={tema}
        restanteVisitante={sessao.restante}
        onAlternarTema={alternarTema}
        onEntrarGoogle={(c) => void auth.entrarComGoogle(c)}
        onEntrarVisitante={() => void auth.entrarComoVisitante()}
        onVoltarGoogle={auth.voltarParaGoogle}
        onSair={auth.sair}
      />

      {!rede.online && (
        <div className="faixa-offline" role="status">
          Sem conexão com a internet. O que já carregou continua disponível.
        </div>
      )}

      <main className="container page" id="conteudo">
        <div className="layout">
          <div className="lista lista--folgada">
            <ErrorBoundary>
              <RoteiroForm
                onEnviar={(pedido) => void viagem.planejar(pedido)}
                carregando={viagem.carregando}
                destinos={destinos}
                posicao={posicao}
                onPedirPosicao={() => void pedirPosicao()}
                buscandoPosicao={buscandoPosicao}
                ufsDaCidade={buscarUfs}
              />
            </ErrorBoundary>

            {roteiro && (
              <ErrorBoundary>
                <RoteiroResult
                  roteiro={roteiro}
                  mapa={viagem.mapa}
                  rotaAtiva={viagem.rotaAtiva}
                  onSelecionarRota={viagem.setRotaAtiva}
                  carregandoMapa={viagem.carregandoMapa}
                  veiculoMapa={viagem.veiculoMapa}
                  onTrocarPropulsao={viagem.trocarPropulsao}
                  guia={viagem.guia}
                  streaming={viagem.streaming}
                  onAlternarVisita={(id) => void viagem.alternarVisita(id)}
                  acoes={
                    <BotoesControleViagem
                      linkMaps={linkGoogleMaps(roteiro)}
                      onWhatsApp={() => void viagem.enviarWhatsApp()}
                      onGpx={() => void viagem.baixarGpx()}
                      onExcluir={() => void viagem.excluir(roteiro.id)}
                    />
                  }
                />
              </ErrorBoundary>
            )}
          </div>

          <div className="lista lista--folgada coluna-lateral">
            <ErrorBoundary>
              <TelemetriaCard
                medicao={viagem.medicao}
                telemetria={viagem.telemetria}
                apiOnline={viagem.apiOnline}
                usuario={auth.usuario}
                tempoSessao={sessao.decorrido}
                restanteVisitante={sessao.restante}
                rede={rede}
                meusRoteiros={viagem.historico.length}
              />
            </ErrorBoundary>
            <ErrorBoundary>
              <HistoricoViagens
                viagens={viagem.historico}
                roteiroAtivoId={roteiro?.id ?? null}
                logado={auth.usuario !== null}
                onSelecionar={viagem.abrirDoHistorico}
                onExcluir={(id) => void viagem.excluir(id)}
              />
            </ErrorBoundary>
          </div>
        </div>
      </main>

      <Footer />
      <Toast toasts={toasts} onFechar={remover} />
    </div>
  );
}

export default App;
