// Estado compartilhado da viagem: planejamento, mapa e custos, guia em streaming, telemetria
// e histórico. Os componentes só recebem dados e callbacks; toda chamada à API passa por aqui.

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../services/api";
import type { Medicao } from "../services/api";
import {
  compartilharWhatsApp,
  consultarMapaRota,
  consultarTelemetria,
  excluirViagem,
  exportarGpx,
  listarViagens,
  marcarVisita,
  pedidoGuiaDe,
  planejarRoteiro,
  streamGuia,
} from "../services/roteiros";
import type {
  MapaRotaResponse,
  Propulsao,
  Roteiro,
  RoteiroRequest,
  TelemetriaApi,
  Usuario,
  Veiculo,
} from "../types/schemas";

/** Telemetria da última consulta, vista pelo navegador e pelo servidor. */
export interface MedicaoViagem extends Medicao {
  provedores: Roteiro["provedores"];
  rotulo: string;
}

interface Notificador {
  (tipo: "success" | "error" | "info", mensagem: string, titulo?: string): void;
}

const VEICULO_PADRAO: Veiculo = {
  propulsao: "combustao",
  consumo_km_l: 12,
  tanque_litros: 50,
  preco_litro: 6.2,
};

/** Mesmos padrões do formulário, usados quando o mapa troca de propulsão. */
const VEICULO_ELETRICO_PADRAO: Veiculo = {
  propulsao: "eletrico",
  eficiencia_km_kwh: 6.5,
  bateria_kwh: 60,
  preco_kwh: 1.2,
};

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Algo deu errado. Tente de novo.";
}

export function useViagem(usuario: Usuario | null, notificar: Notificador) {
  const [roteiro, setRoteiro] = useState<Roteiro | null>(null);
  const [mapa, setMapa] = useState<MapaRotaResponse | null>(null);
  const [rotaAtiva, setRotaAtiva] = useState(0);
  const [guia, setGuia] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [carregandoMapa, setCarregandoMapa] = useState(false);
  const [veiculoMapa, setVeiculoMapa] = useState<Veiculo | null>(null);
  const [medicao, setMedicao] = useState<MedicaoViagem | null>(null);
  const [historico, setHistorico] = useState<Roteiro[]>([]);
  const [telemetria, setTelemetria] = useState<TelemetriaApi | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  // Trava contra cliques repetidos (o backend também responde 409 se escapar).
  const emAndamento = useRef(false);
  const streamAtual = useRef<AbortController | null>(null);
  const parametros = useRef<{ veiculo: Veiculo; passageiros: number }>({
    veiculo: VEICULO_PADRAO,
    passageiros: 1,
  });
  // Só a resposta do /mapa-rota mais recente vale (trocar de propulsão rápido não embaralha).
  const pedidoMapa = useRef(0);

  const atualizarTelemetria = useCallback(async () => {
    try {
      setTelemetria(await consultarTelemetria());
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }
  }, []);

  const carregarHistorico = useCallback(async () => {
    if (!usuario) return;
    try {
      setHistorico(await listarViagens());
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        notificar("error", mensagem(e), "Histórico");
    }
  }, [usuario, notificar]);

  // Troca de usuário: limpa tudo o que era do anterior e carrega o histórico do novo.
  useEffect(() => {
    streamAtual.current?.abort();
    setRoteiro(null);
    setMapa(null);
    setGuia("");
    setMedicao(null);
    setHistorico([]);
    void carregarHistorico();
  }, [usuario?.id, carregarHistorico]);

  // Status da API e uptime a cada 15 s.
  useEffect(() => {
    void atualizarTelemetria();
    const id = window.setInterval(() => void atualizarTelemetria(), 15000);
    return () => window.clearInterval(id);
  }, [atualizarTelemetria]);

  const iniciarGuia = useCallback((alvo: Roteiro) => {
    streamAtual.current?.abort();
    const controle = new AbortController();
    streamAtual.current = controle;
    setGuia("");
    setStreaming(true);
    streamGuia(pedidoGuiaDe(alvo), (chunk) => setGuia((atual) => atual + chunk), controle.signal)
      .catch(() => {
        // Sem streaming: mostra o guia completo que veio no /planejar.
        if (!controle.signal.aborted) setGuia(alvo.guia);
      })
      .finally(() => {
        if (streamAtual.current === controle) setStreaming(false);
      });
  }, []);

  const carregarMapa = useCallback(async (alvo: Roteiro, veiculo: Veiculo, manterRota = false) => {
    const pedido = ++pedidoMapa.current;
    setVeiculoMapa(veiculo);
    if (!manterRota) {
      setMapa(null);
      setRotaAtiva(0);
    }
    if (!alvo.rota.disponivel) return;
    setCarregandoMapa(true);
    try {
      const { dados } = await consultarMapaRota(alvo, veiculo, parametros.current.passageiros);
      if (pedido === pedidoMapa.current) setMapa(dados);
    } catch {
      // Sem /mapa-rota a tela ainda mostra o traçado do /planejar.
      if (pedido === pedidoMapa.current) setMapa(null);
    } finally {
      if (pedido === pedidoMapa.current) setCarregandoMapa(false);
    }
  }, []);

  /** Recalcula autonomia, paradas e custos da mesma viagem com o outro tipo de veículo. */
  const trocarPropulsao = useCallback(
    (propulsao: Propulsao) => {
      if (!roteiro) return;
      const doFormulario = parametros.current.veiculo;
      const veiculo =
        doFormulario.propulsao === propulsao
          ? doFormulario
          : propulsao === "eletrico"
            ? VEICULO_ELETRICO_PADRAO
            : VEICULO_PADRAO;
      void carregarMapa(roteiro, veiculo, true);
    },
    [roteiro, carregarMapa],
  );

  const exibir = useCallback(
    (alvo: Roteiro) => {
      setRoteiro(alvo);
      void carregarMapa(alvo, parametros.current.veiculo);
      iniciarGuia(alvo);
    },
    [carregarMapa, iniciarGuia],
  );

  const planejar = useCallback(
    async (pedido: RoteiroRequest) => {
      if (emAndamento.current) return;
      if (!usuario) {
        notificar(
          "info",
          "Entre com o Google ou como visitante para planejar.",
          "Sessão necessária",
        );
        return;
      }
      emAndamento.current = true;
      setCarregando(true);
      parametros.current = { veiculo: pedido.veiculo, passageiros: pedido.passageiros };
      try {
        const { dados, medicao: m } = await planejarRoteiro(pedido);
        setMedicao({
          ...m,
          provedores: dados.provedores,
          rotulo: `${dados.origem.nome} → ${dados.destino.nome}`,
        });
        exibir(dados);
        if (!dados.rota.disponivel) notificar("info", dados.rota.resumo, "Sem rota rodoviária");
        // A gravação acontece em segundo plano no servidor: atualiza a lista logo depois.
        window.setTimeout(() => void carregarHistorico(), 400);
        void atualizarTelemetria();
      } catch (e) {
        notificar("error", mensagem(e), "Não foi possível planejar");
      } finally {
        emAndamento.current = false;
        setCarregando(false);
      }
    },
    [usuario, notificar, exibir, carregarHistorico, atualizarTelemetria],
  );

  const abrirDoHistorico = useCallback(
    (id: string) => {
      const alvo = historico.find((r) => r.id === id);
      if (alvo) exibir(alvo);
    },
    [historico, exibir],
  );

  const excluir = useCallback(
    async (id: string) => {
      try {
        await excluirViagem(id);
        setHistorico((lista) => lista.filter((r) => r.id !== id));
        if (roteiro?.id === id) {
          streamAtual.current?.abort();
          setRoteiro(null);
          setMapa(null);
          setGuia("");
        }
        notificar("success", "Viagem excluída.");
      } catch (e) {
        notificar("error", mensagem(e), "Não foi possível excluir");
      }
    },
    [roteiro?.id, notificar],
  );

  const alternarVisita = useCallback(
    async (atrativoId: string) => {
      if (!roteiro) return;
      const atual = roteiro.atrativos.find((a) => a.id === atrativoId);
      if (!atual) return;
      const visitado = !atual.visitado;
      // Atualiza na hora; desfaz se o servidor recusar.
      const aplicar = (v: boolean) => (r: Roteiro | null) =>
        r
          ? {
              ...r,
              atrativos: r.atrativos.map((a) => (a.id === atrativoId ? { ...a, visitado: v } : a)),
            }
          : r;
      setRoteiro(aplicar(visitado));
      try {
        const salvo = await marcarVisita(roteiro.id, atrativoId, visitado);
        setHistorico((lista) => lista.map((r) => (r.id === salvo.id ? salvo : r)));
      } catch (e) {
        setRoteiro(aplicar(!visitado));
        notificar("error", mensagem(e), "Visita não registrada");
      }
    },
    [roteiro, notificar],
  );

  const baixarGpx = useCallback(async () => {
    if (!roteiro) return;
    try {
      const { blob, nome } = await exportarGpx(roteiro.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome ?? `roteiro-${roteiro.id}.gpx`;
      link.click();
      URL.revokeObjectURL(url);
      notificar("success", "Arquivo GPX 1.1 baixado.");
    } catch (e) {
      notificar("error", mensagem(e), "Exportação GPX");
    }
  }, [roteiro, notificar]);

  const enviarWhatsApp = useCallback(async () => {
    if (!roteiro) return;
    try {
      window.open(await compartilharWhatsApp(roteiro.id), "_blank", "noopener");
    } catch (e) {
      notificar("error", mensagem(e), "Compartilhamento");
    }
  }, [roteiro, notificar]);

  return {
    roteiro,
    mapa,
    rotaAtiva,
    setRotaAtiva,
    guia,
    streaming,
    carregando,
    carregandoMapa,
    veiculoMapa,
    trocarPropulsao,
    medicao,
    historico,
    telemetria,
    apiOnline,
    planejar,
    abrirDoHistorico,
    excluir,
    alternarVisita,
    baixarGpx,
    enviarWhatsApp,
  };
}
