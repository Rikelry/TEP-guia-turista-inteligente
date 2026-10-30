/* ============================================================================
 * Contratos de dados da SPA (tipos de domínio compartilhados)
 * Espelham os schemas Pydantic v2 do backend FastAPI (app/schemas/roteiros.py).
 * ========================================================================== */

export type Propulsao = "combustao" | "eletrico";

export type EstiloViagem = "cultural" | "gastronomico" | "ecoturismo" | "familia" | "romantico";

export type PreferenciaRota = "rapida" | "economica";

export type NivelAutonomia = "ok" | "atencao" | "critico";

export interface ClimaInfo {
  temperatura: number;
  sensacao_termica: number;
  vento_kmh: number;
  descricao: string;
  icone?: string;
}

export interface Parada {
  nome: string;
  latitude: number;
  longitude: number;
  km_do_inicio: number;
  tipo: "combustivel" | "recarga";
  autonomia_restante_pct: number;
  nivel: NivelAutonomia;
}

export interface Percurso {
  distancia_km: number;
  duracao_min: number;
  pedagio_reais: number;
  elevacao_ganho_m: number;
  elevacao_perda_m: number;
  altitudes_m: number[];
  geometria: [number, number][];
  paradas: Parada[];
}

export interface RotaAlternativa {
  id: string;
  rotulo: string;
  descricao: string;
  percurso: Percurso;
}

export interface Custos {
  combustivel_reais: number;
  pedagio_reais: number;
  total_reais: number;
  por_passageiro_reais: number;
  emissao_co2_kg: number;
}

export interface Atrativo {
  id: string;
  nome: string;
  descricao: string;
  categoria: "ponto_turistico" | "gastronomia";
  visitado: boolean;
}

export interface GuiaDiagnostico {
  status: "sucesso" | "fallback";
  modelo: string;
  fallback_utilizado: boolean;
  motivo?: string;
}

export interface RoteiroRequest {
  origem_cidade: string;
  origem_uf: string;
  destino_cidade: string;
  destino_uf: string;
  propulsao: Propulsao;
  consumo_km_l: number;
  capacidade_tanque_l: number;
  preco_litro: number;
  eficiencia_km_kwh: number;
  capacidade_bateria_kwh: number;
  preco_kwh: number;
  dias_estadia: number;
  estilo_viagem: EstiloViagem;
  preferencia_rota: PreferenciaRota;
  passageiros: number;
}

export interface RoteiroResposta {
  roteiro_id: string;
  user_id: string;
  origem: string;
  destino: string;
  clima: ClimaInfo;
  percurso: Percurso;
  rotas_alternativas: RotaAlternativa[];
  custos: Custos;
  atrativos: Atrativo[];
  guia_texto: string;
  diagnostico_guia: GuiaDiagnostico;
  criado_em: string;
}

export interface ViagemResumo {
  roteiro_id: string;
  origem: string;
  destino: string;
  criado_em: string;
  distancia_km: number;
}

export interface Telemetria {
  tempo_processamento_ms: number;
  tempo_total_front_ms: number;
  provedores_ativos: string[];
  provedores_total: number;
  total_roteiros: number;
  correlation_id?: string;
}

export interface Usuario {
  tipo: "google" | "visitante";
  id: string;
  nome: string;
  email?: string | null;
  foto?: string | null;
  expira_em?: string | null;
}

export const ESTILOS_VIAGEM: { valor: EstiloViagem; rotulo: string }[] = [
  { valor: "cultural", rotulo: "Cultural" },
  { valor: "gastronomico", rotulo: "Gastronômico" },
  { valor: "ecoturismo", rotulo: "Ecoturismo / Aventura" },
  { valor: "familia", rotulo: "Família" },
  { valor: "romantico", rotulo: "Romântico / Econômico" },
];
