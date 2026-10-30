// Chamadas aos endpoints de roteiro e telemetria da API v2.

import type {
  ClimaInfo,
  Destino,
  EstiloViagem,
  MapaRotaResponse,
  Roteiro,
  RoteiroRequest,
  TelemetriaApi,
  Veiculo,
} from "../types/schemas";
import { baixarArquivo, lerStreamSSE, requisitar } from "./api";

const BASE = "/api/v1/roteiros";

export function planejarRoteiro(pedido: RoteiroRequest, signal?: AbortSignal) {
  return requisitar<Roteiro>(`${BASE}/planejar`, {
    metodo: "POST",
    corpo: pedido,
    ...(signal && { signal }),
  });
}

export function consultarMapaRota(roteiro: Roteiro, veiculo: Veiculo, passageiros: number) {
  return requisitar<MapaRotaResponse>(`${BASE}/mapa-rota`, {
    metodo: "POST",
    corpo: {
      origem: { lat: roteiro.origem.lat, lon: roteiro.origem.lon },
      destino: { lat: roteiro.destino.lat, lon: roteiro.destino.lon },
      origem_uf: roteiro.origem.uf,
      destino_uf: roteiro.destino.uf,
      veiculo,
      passageiros,
      alternativas: true,
    },
  });
}

export interface PedidoGuia {
  destino: string;
  dias_estadia: number;
  estilo_viagem: EstiloViagem;
  perfis: EstiloViagem[];
  clima_info: ClimaInfo;
  atrativos: string[];
  gastronomia: string[];
}

export function pedidoGuiaDe(roteiro: Roteiro): PedidoGuia {
  return {
    destino: roteiro.destino.nome,
    dias_estadia: roteiro.dias_estadia,
    estilo_viagem: roteiro.estilo_viagem,
    perfis: roteiro.perfis ?? [roteiro.estilo_viagem],
    clima_info: roteiro.clima,
    atrativos: roteiro.atrativos
      .filter((a) => a.tipo === "atrativo")
      .map((a) => a.nome)
      .slice(0, 10),
    gastronomia: roteiro.atrativos
      .filter((a) => a.tipo === "gastronomia")
      .map((a) => a.nome)
      .slice(0, 10),
  };
}

export function streamGuia(
  pedido: PedidoGuia,
  aoReceber: (chunk: string) => void,
  signal?: AbortSignal,
) {
  return lerStreamSSE(`${BASE}/stream-guia`, pedido, aoReceber, signal);
}

export async function listarViagens(): Promise<Roteiro[]> {
  return (await requisitar<Roteiro[]>(`${BASE}/minhas-viagens`)).dados;
}

export async function excluirViagem(id: string): Promise<void> {
  await requisitar<null>(`${BASE}/${encodeURIComponent(id)}`, { metodo: "DELETE" });
}

export async function marcarVisita(
  id: string,
  atrativoId: string,
  visitado: boolean,
): Promise<Roteiro> {
  return (
    await requisitar<Roteiro>(`${BASE}/${encodeURIComponent(id)}/visitas`, {
      metodo: "PATCH",
      corpo: { atrativo_id: atrativoId, visitado },
    })
  ).dados;
}

export async function compartilharWhatsApp(id: string): Promise<string> {
  const { dados } = await requisitar<{ link_whatsapp: string }>(
    `${BASE}/${encodeURIComponent(id)}/compartilhar`,
    {
      metodo: "POST",
      corpo: { canal: "whatsapp" },
    },
  );
  return dados.link_whatsapp;
}

export function exportarGpx(id: string) {
  return baixarArquivo(`${BASE}/exportar/gpx`, { metodo: "POST", corpo: { roteiro_id: id } });
}

export async function listarDestinos(): Promise<Destino[]> {
  return (await requisitar<Destino[]>(`${BASE}/destinos`)).dados;
}

export async function consultarTelemetria(): Promise<TelemetriaApi> {
  return (await requisitar<TelemetriaApi>("/api/v1/telemetria", { timeoutMs: 5000 })).dados;
}

/** Link do Google Maps com o trajeto de carro entre origem e destino. */
export function linkGoogleMaps(roteiro: Roteiro): string {
  const p = new URLSearchParams({
    api: "1",
    origin: `${roteiro.origem.lat},${roteiro.origem.lon}`,
    destination: `${roteiro.destino.lat},${roteiro.destino.lon}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/** Busca de um lugar no Google Maps (cards de atrativos e restaurantes). */
export function linkBuscaMaps(nome: string, cidade: string): string {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: `${nome}, ${cidade}` }).toString()}`;
}
