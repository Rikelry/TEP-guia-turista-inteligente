// Dados de exemplo no formato exato da API v2 (usados pelos testes).

import type { MapaRotaResponse, Roteiro, Usuario } from "../types/schemas";

export const ROTEIRO: Roteiro = {
  id: "r1",
  criado_em: "2026-10-30T15:00:00+00:00",
  origem: {
    cidade: "Piripiri",
    uf: "PI",
    nome: "Piripiri - PI",
    lat: -4.27,
    lon: -41.78,
    encontrado: true,
  },
  destino: {
    cidade: "Natal",
    uf: "RN",
    nome: "Natal - RN",
    lat: -5.79,
    lon: -35.21,
    encontrado: true,
  },
  dias_estadia: 1,
  estilo_viagem: "cultural",
  perfis: ["cultural", "gastronomico"],
  clima: {
    disponivel: true,
    temperatura_c: 27.1,
    sensacao_c: 28.8,
    umidade_pct: 70,
    vento_kmh: 18,
    condicao: "Céu limpo",
  },
  rota: {
    disponivel: true,
    distancia_km: 992.5,
    duracao_min: 862,
    resumo: "992 km · 14h 22min de carro",
    geometria: [
      [-4.27, -41.78],
      [-5.0, -38.5],
      [-5.79, -35.21],
    ],
  },
  guia: "📍 IDENTIDADE: Natal une dunas e história potiguar.\n🗓️ ROTEIRO:\nManhã: Forte dos Reis Magos.\nTarde: Dunas de Genipabu.\n🍽️ GASTRONOMIA: ginga com tapioca em Ponta Negra.\n🌤️ CLIMA E DICAS: 27 °C; leve protetor solar.",
  guia_fallback: false,
  atrativos: [
    {
      id: "atrativo-forte",
      nome: "Forte dos Reis Magos",
      descricao: "Fortaleza de 1598.",
      tipo: "atrativo",
      visitado: false,
    },
    {
      id: "gastronomia-ginga",
      nome: "Ginga com tapioca",
      descricao: "Peixe frito na tapioca.",
      tipo: "gastronomia",
      visitado: true,
    },
  ],
  provedores: {
    geocoding: { tempo_ms: 340, fallback: false },
    clima: { tempo_ms: 190, fallback: false },
    rota: { tempo_ms: 420, fallback: false },
    gemini: { tempo_ms: 1300, fallback: false },
  },
};

export const MAPA: MapaRotaResponse = {
  rotas: [0, 1].map((i) => ({
    indice: i,
    rotulo: i === 0 ? "Sugestão 01 · Menor tempo" : "Sugestão 02 · Mais econômica",
    rota: { ...ROTEIRO.rota, distancia_km: i === 0 ? 992.5 : 960 },
    altimetria: {
      disponivel: true,
      ganho_m: 1200,
      perda_m: 1250,
      altitude_max_m: 780,
      altitude_min_m: 5,
      desnivel_liquido_m: -50,
      penalizacao_pct: 1.2,
      perfil: [100, 400, 780, 300, 5],
    },
    autonomia: {
      autonomia_nominal_km: 600,
      autonomia_ajustada_km: 592.9,
      reserva_pct: 18,
      paradas: [{ ordem: 1, tipo: "posto", km: 480, lat: -5.0, lon: -38.5, nivel_chegada_pct: 19 }],
    },
    custos: {
      propulsao: "combustao",
      quantidade_energia: 83.7,
      unidade: "litros",
      custo_energia: 519,
      custo_pedagio: 29.78,
      custo_total: 548.78,
      passageiros: 2,
      por_passageiro: 274.39,
      emissoes_kg_co2: 193.3,
      observacao: "Pedágio e emissões são estimativas médias por região.",
    },
  })),
};

export const USUARIO_GOOGLE: Usuario = {
  id: "109876543214321",
  nome: "Ana Souza",
  tipo: "google",
  desde: Date.now() - 60_000,
};
export const USUARIO_VISITANTE: Usuario = {
  id: "visitante-abc",
  nome: "Visitante",
  tipo: "visitante",
  desde: Date.now(),
  expiraEm: Date.now() + 2 * 3600_000,
};

/** Response JSON no formato do FastAPI. */
export function resposta(
  corpo: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(corpo === null ? null : JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
