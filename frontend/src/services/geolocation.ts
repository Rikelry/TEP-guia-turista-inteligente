// GPS do navegador e distância geodésica (Haversine) para sugerir destinos a mais de 400 km.

import { RAIO_SUGESTOES_KM } from "../config";
import type { Destino } from "../types/schemas";

export interface Ponto {
  lat: number;
  lon: number;
}

export interface Sugestao extends Destino {
  distanciaKm: number;
}

/** Distância em linha reta (km) entre dois pontos, pela fórmula de Haversine. */
export function haversineKm(a: Ponto, b: Ponto): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Os `limite` destinos mais próximos entre os que ficam a mais de `raioMinKm` do ponto. */
export function sugerirDestinos(
  ponto: Ponto,
  destinos: Destino[],
  limite = 4,
  raioMinKm = RAIO_SUGESTOES_KM,
): Sugestao[] {
  return destinos
    .map((d) => ({ ...d, distanciaKm: Math.round(haversineKm(ponto, d)) }))
    .filter((d) => d.distanciaKm > raioMinKm)
    .sort((x, y) => x.distanciaKm - y.distanciaKm)
    .slice(0, limite);
}

/** Posição atual pelo navigator.geolocation. Devolve null se negado, indisponível ou demorado. */
export function obterPosicao(timeoutMs = 8000): Promise<Ponto | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    );
  });
}
