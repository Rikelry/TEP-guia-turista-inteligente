import { describe, expect, it } from "vite-plus/test";

import { montarIndice, normalizarCidade, ufsDaCidade } from "./municipios";

const INDICE = montarIndice([
  { nome: "São Luís", uf: "MA" },
  { nome: "Natal", uf: "RN" },
  { nome: "Bom Jesus", uf: "PI" },
  { nome: "Bom Jesus", uf: "RS" },
  { nome: "Alta Floresta D'Oeste", uf: "RO" },
]);

describe("municipios", () => {
  it("normaliza acentos, maiúsculas, apóstrofos e espaços", () => {
    expect(normalizarCidade("  SÃO   Luís ")).toBe("sao luis");
    expect(normalizarCidade("Alta Floresta D’Oeste")).toBe("alta floresta d'oeste");
  });

  it("acha o UF ignorando acentos e caixa", () => {
    expect(ufsDaCidade("sao luis", INDICE)).toEqual(["MA"]);
    expect(ufsDaCidade("alta floresta d’oeste", INDICE)).toEqual(["RO"]);
  });

  it("devolve todos os UFs de nomes repetidos", () => {
    expect(ufsDaCidade("bom jesus", INDICE)).toEqual(["PI", "RS"]);
  });

  it("sem IBGE usa o catálogo; nome parcial não corrige", () => {
    expect(ufsDaCidade("Piripiri", null, [{ cidade: "Piripiri", uf: "PI" }])).toEqual(["PI"]);
    expect(ufsDaCidade("Nat", INDICE)).toEqual([]);
  });
});
