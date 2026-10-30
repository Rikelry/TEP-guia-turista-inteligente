import { describe, expect, it, vi } from "vite-plus/test";

import { haversineKm, obterPosicao, sugerirDestinos } from "./geolocation";

const DESTINOS = [
  { cidade: "Teresina", uf: "PI", lat: -5.089, lon: -42.802, resumo: "" },
  { cidade: "Jijoca de Jericoacoara", uf: "CE", lat: -2.796, lon: -40.512, resumo: "" },
  { cidade: "Natal", uf: "RN", lat: -5.795, lon: -35.209, resumo: "" },
  { cidade: "Recife", uf: "PE", lat: -8.048, lon: -34.877, resumo: "" },
  { cidade: "Salvador", uf: "BA", lat: -12.977, lon: -38.501, resumo: "" },
  { cidade: "Gramado", uf: "RS", lat: -29.379, lon: -50.874, resumo: "" },
];
const PIRIPIRI = { lat: -4.272, lon: -41.777 };

describe("geolocation", () => {
  it("calcula a distância de Haversine", () => {
    expect(
      Math.round(haversineKm({ lat: -5.089, lon: -42.802 }, { lat: -3.717, lon: -38.543 })),
    ).toBe(496);
  });

  it("sugere os 4 mais próximos entre os que ficam a mais de 400 km", () => {
    const s = sugerirDestinos(PIRIPIRI, DESTINOS);
    expect(s.map((d) => d.cidade)).toEqual(["Natal", "Recife", "Salvador", "Gramado"]);
    expect(s.every((d) => d.distanciaKm > 400)).toBe(true);
    expect(s[0]!.distanciaKm).toBeLessThan(s[1]!.distanciaKm);
  });

  it("devolve null quando o GPS é negado", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (_ok: unknown, erro: () => void) => erro() },
    });
    await expect(obterPosicao()).resolves.toBeNull();
  });

  it("devolve a posição quando autorizado", async () => {
    const getCurrentPosition = vi.fn(
      (ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
        ok({ coords: { latitude: -4.27, longitude: -41.78 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    await expect(obterPosicao()).resolves.toEqual({ lat: -4.27, lon: -41.78 });
  });
});
