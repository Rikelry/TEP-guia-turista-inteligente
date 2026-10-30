import { describe, expect, it } from "vite-plus/test";

import {
  ErroContrato,
  ehCidadeValida,
  ehUFValida,
  mascararId,
  parseLoginResponse,
  sanitizarTexto,
} from "./schemas";

describe("contratos e sanitização", () => {
  it("sanitiza tags, controles e espaços", () => {
    expect(sanitizarTexto("  <b>São\u0007   Luís</b> ")).toBe("São Luís");
  });

  it("valida UF e cidade como o backend", () => {
    expect(ehUFValida("PI")).toBe(true);
    expect(ehUFValida("XX")).toBe(false);
    expect(ehCidadeValida("Pau-d'Arco")).toBe(true);
    expect(ehCidadeValida("1234")).toBe(false);
  });

  it("converte o login da API e recusa formatos inválidos", () => {
    const u = parseLoginResponse(
      {
        usuario: {
          user_id: "v1",
          nome: "Visitante",
          tipo: "visitante",
          expira_em: "2026-10-30T18:00:00Z",
        },
      },
      1000,
    );
    expect(u).toMatchObject({
      id: "v1",
      tipo: "visitante",
      desde: 1000,
      expiraEm: Date.parse("2026-10-30T18:00:00Z"),
    });
    expect(() =>
      parseLoginResponse({ usuario: { user_id: "v", nome: "V", tipo: "visitante" } }),
    ).toThrow(ErroContrato);
    expect(() => parseLoginResponse({})).toThrow(ErroContrato);
  });

  it("mascara o identificador", () => {
    expect(mascararId("109876543214321")).toBe("1098…4321");
  });
});
