/* ============================================================================
 * Contratos de dados entre a SPA e a API FastAPI (backend/app/schemas/*.py).
 * Os nomes seguem o JSON da API (snake_case). Validação e sanitização do
 * formulário espelham as regras do Pydantic, para o 422 quase nunca acontecer.
 * ========================================================================== */

export type Propulsao = "combustao" | "eletrico";
export type EstiloViagem = "cultural" | "gastronomico" | "ecoturismo" | "familia" | "romantico";
export type PreferenciaRota = "rapida" | "economica";

export const ESTILOS_VIAGEM: { valor: EstiloViagem; rotulo: string; emoji: string }[] = [
  { valor: "cultural", rotulo: "Cultural", emoji: "🏛️" },
  { valor: "gastronomico", rotulo: "Gastronômico", emoji: "🍲" },
  { valor: "ecoturismo", rotulo: "Ecoturismo", emoji: "🌿" },
  { valor: "familia", rotulo: "Família", emoji: "👨‍👩‍👧" },
  { valor: "romantico", rotulo: "Romântico / Econômico", emoji: "💰" },
];

export const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export const LIMITES = { diasMin: 1, diasMax: 5, passageirosMin: 1, passageirosMax: 8 } as const;

// ---------------------------------------------------------------------------
// Pedido de roteiro (POST /api/v1/roteiros/planejar)
// ---------------------------------------------------------------------------

export interface VeiculoCombustao {
  propulsao: "combustao";
  consumo_km_l: number;
  tanque_litros: number;
  preco_litro: number;
}

export interface VeiculoEletrico {
  propulsao: "eletrico";
  eficiencia_km_kwh: number;
  bateria_kwh: number;
  preco_kwh: number;
}

export type Veiculo = VeiculoCombustao | VeiculoEletrico;

export interface RoteiroRequest {
  origem_cidade: string;
  origem_uf: string;
  destino_cidade: string;
  destino_uf: string;
  dias_estadia: number;
  estilo_viagem: EstiloViagem;
  perfis: EstiloViagem[];
  preferencia_rota: PreferenciaRota;
  passageiros: number;
  veiculo: Veiculo;
}

// ---------------------------------------------------------------------------
// Respostas da API
// ---------------------------------------------------------------------------

export interface LocalInfo {
  cidade: string;
  uf: string;
  nome: string;
  lat: number;
  lon: number;
  encontrado: boolean;
}

export interface ClimaInfo {
  disponivel: boolean;
  temperatura_c: number | null;
  sensacao_c: number | null;
  umidade_pct: number | null;
  vento_kmh: number | null;
  condicao: string;
}

export interface RotaInfo {
  disponivel: boolean;
  distancia_km: number | null;
  duracao_min: number | null;
  resumo: string;
  /** Pontos [lat, lon]. */
  geometria: [number, number][];
}

export interface AtrativoItem {
  id: string;
  nome: string;
  descricao: string;
  tipo: "atrativo" | "gastronomia";
  visitado: boolean;
}

export interface ProvedorTelemetria {
  tempo_ms: number;
  fallback: boolean;
}

export interface Roteiro {
  id: string;
  criado_em: string;
  origem: LocalInfo;
  destino: LocalInfo;
  dias_estadia: number;
  estilo_viagem: EstiloViagem;
  perfis?: EstiloViagem[];
  clima: ClimaInfo;
  rota: RotaInfo;
  guia: string;
  guia_fallback: boolean;
  atrativos: AtrativoItem[];
  provedores: Record<string, ProvedorTelemetria>;
}

export interface AltimetriaInfo {
  disponivel: boolean;
  ganho_m: number;
  perda_m: number;
  altitude_max_m: number | null;
  altitude_min_m: number | null;
  desnivel_liquido_m: number;
  penalizacao_pct: number;
  perfil: number[];
}

export interface Parada {
  ordem: number;
  tipo: "posto" | "eletroposto";
  km: number;
  lat: number;
  lon: number;
  nivel_chegada_pct: number;
}

export interface AutonomiaInfo {
  autonomia_nominal_km: number;
  autonomia_ajustada_km: number;
  reserva_pct: number;
  paradas: Parada[];
}

export interface CustosInfo {
  propulsao: Propulsao;
  quantidade_energia: number;
  unidade: "litros" | "kWh";
  custo_energia: number;
  custo_pedagio: number;
  custo_total: number;
  passageiros: number;
  por_passageiro: number;
  emissoes_kg_co2: number;
  observacao: string;
}

export interface RotaAlternativa {
  indice: number;
  rotulo: string;
  rota: RotaInfo;
  altimetria: AltimetriaInfo;
  autonomia: AutonomiaInfo;
  custos: CustosInfo;
}

export interface MapaRotaResponse {
  rotas: RotaAlternativa[];
}

export interface Destino {
  cidade: string;
  uf: string;
  lat: number;
  lon: number;
  resumo: string;
}

export interface CircuitoStatus {
  nome: string;
  estado: "fechado" | "aberto" | "meio_aberto";
}

export interface TelemetriaApi {
  uptime_segundos: number;
  requisicoes_total: number;
  latencia_media_ms: number | null;
  roteiros_gerados: number;
  total_roteiros_salvos: number;
  provedores_ativos: number;
  provedores_total: number;
  circuit_breakers: CircuitoStatus[];
}

// ---------------------------------------------------------------------------
// Usuário (camelCase no front; a API devolve UsuarioPerfil em snake_case)
// ---------------------------------------------------------------------------

export type TipoUsuario = "google" | "visitante";

export interface Usuario {
  id: string;
  nome: string;
  tipo: TipoUsuario;
  email?: string;
  foto?: string;
  /** Epoch ms em que a sessão de visitante expira. */
  expiraEm?: number;
  /** Epoch ms do login (para o "tempo de sessão"). */
  desde: number;
}

export class ErroContrato extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroContrato";
  }
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Converte `{ usuario: {...} }` da API em Usuario, recusando formatos inesperados. */
export function parseLoginResponse(dados: unknown, agora: number = Date.now()): Usuario {
  const perfil = ehObjeto(dados) ? dados.usuario : undefined;
  if (!ehObjeto(perfil)) throw new ErroContrato("Resposta de login sem usuário.");
  const { user_id: id, nome, tipo, email, foto, expira_em: expira } = perfil;
  if (typeof id !== "string" || id === "") throw new ErroContrato("Usuário sem user_id.");
  if (tipo !== "google" && tipo !== "visitante")
    throw new ErroContrato("Tipo de usuário inválido.");

  const usuario: Usuario = {
    id,
    nome: typeof nome === "string" && nome.trim() ? sanitizarTexto(nome, 120) : "Viajante",
    tipo,
    desde: agora,
  };
  if (typeof email === "string" && email) usuario.email = email;
  if (typeof foto === "string" && foto.startsWith("https://")) usuario.foto = foto;
  if (typeof expira === "string") {
    const ms = Date.parse(expira);
    if (Number.isNaN(ms)) throw new ErroContrato("expira_em inválido.");
    usuario.expiraEm = ms;
  }
  if (tipo === "visitante" && usuario.expiraEm === undefined) {
    throw new ErroContrato("Sessão de visitante sem expira_em.");
  }
  return usuario;
}

// ---------------------------------------------------------------------------
// Sanitização e validação do formulário
// ---------------------------------------------------------------------------

export function sanitizarTexto(texto: string, maxLen = 80): string {
  return (
    texto
      .replace(/<[^>]*>/g, "")
      // oxlint-disable-next-line no-control-regex -- remover caracteres de controle é o objetivo
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLen)
  );
}

export function ehUFValida(uf: string): boolean {
  return (UFS as readonly string[]).includes(uf);
}

/** 2 a 80 caracteres; letras (com acento), espaço, hífen, apóstrofo e ponto. */
export function ehCidadeValida(cidade: string): boolean {
  return /^[\p{L}][\p{L}\s.'-]{1,79}$/u.test(cidade);
}

/** Máscara do identificador para exibição (ex.: 1098…4321). */
export function mascararId(id: string): string {
  return id.length <= 8 ? `${id.slice(0, 2)}…` : `${id.slice(0, 4)}…${id.slice(-4)}`;
}
