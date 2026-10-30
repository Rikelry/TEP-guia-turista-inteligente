// Municípios do IBGE para descobrir o UF a partir do nome da cidade digitado. A lista (5.570
// cidades, ~110 KB compactados) vem uma vez só e o navegador guarda em cache por 30 dias.

const URL_IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado";

/** Nome normalizado → UFs onde existe uma cidade com esse nome. */
export type IndiceMunicipios = Map<string, string[]>;

/** Ignora acentos, maiúsculas, apóstrofos diferentes e espaços repetidos. */
export function normalizarCidade(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function montarIndice(cidades: { nome: string; uf: string }[]): IndiceMunicipios {
  const indice: IndiceMunicipios = new Map();
  for (const { nome, uf } of cidades) {
    const chave = normalizarCidade(nome);
    const ufs = indice.get(chave) ?? [];
    if (!ufs.includes(uf)) ufs.push(uf);
    indice.set(chave, ufs);
  }
  return indice;
}

let carregamento: Promise<IndiceMunicipios> | null = null;

/** Baixa a lista do IBGE uma vez por sessão; se falhar, a próxima chamada tenta de novo. */
export function carregarMunicipios(): Promise<IndiceMunicipios> {
  carregamento ??= fetch(URL_IBGE, { signal: AbortSignal.timeout(15000) })
    .then((r) => {
      if (!r.ok) throw new Error(`IBGE respondeu ${r.status}`);
      return r.json() as Promise<{ "municipio-nome"?: unknown; "UF-sigla"?: unknown }[]>;
    })
    .then((lista) =>
      montarIndice(
        lista.flatMap((m) =>
          typeof m["municipio-nome"] === "string" && typeof m["UF-sigla"] === "string"
            ? [{ nome: m["municipio-nome"], uf: m["UF-sigla"] }]
            : [],
        ),
      ),
    )
    .catch((erro: unknown) => {
      carregamento = null;
      throw erro;
    });
  return carregamento;
}

/** UFs da cidade digitada: primeiro o IBGE, depois o catálogo de destinos do backend. */
export function ufsDaCidade(
  cidade: string,
  indice: IndiceMunicipios | null,
  catalogo: { cidade: string; uf: string }[] = [],
): string[] {
  const chave = normalizarCidade(cidade);
  if (chave.length < 2) return [];
  const doIbge = indice?.get(chave);
  if (doIbge?.length) return doIbge;
  return [
    ...new Set(catalogo.filter((d) => normalizarCidade(d.cidade) === chave).map((d) => d.uf)),
  ];
}
