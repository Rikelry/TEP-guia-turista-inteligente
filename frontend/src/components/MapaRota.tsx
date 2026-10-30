// Mapa interativo (Leaflet) com a rota, paradas e marcadores de origem/destino.

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { Parada, Percurso } from "../types/schemas";

export interface MapaRotaProps {
  /** Percurso já resolvido (rota principal ou alternativa ativa). */
  percurso?: Percurso | null;
  origem?: string | undefined;
  destino?: string | undefined;
}

const COR_ROTA = "#0b6e4f";
const COR_PARADA = "#8a5300";

function rotuloParada(parada: Parada): string {
  const tipo = parada.tipo === "recarga" ? "Recarga" : "Combustível";
  return `${tipo} — ${parada.nome} (${Math.round(parada.km_do_inicio)} km)`;
}

export function MapaRota({ percurso, origem, destino }: MapaRotaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const temRota = Boolean(percurso && percurso.geometria.length > 0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !percurso || percurso.geometria.length === 0) return;

    const mapa = L.map(container, { scrollWheelZoom: false });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(mapa);

    // Contrato: a geometria chega como pares [latitude, longitude].
    const pontos = percurso.geometria.map(([lat, lng]) => L.latLng(lat, lng));
    const linha = L.polyline(pontos, {
      color: COR_ROTA,
      weight: 5,
      opacity: 0.9,
    }).addTo(mapa);

    const inicio = pontos[0];
    const fim = pontos[pontos.length - 1];
    if (inicio) {
      L.circleMarker(inicio, {
        radius: 8,
        color: COR_ROTA,
        fillColor: COR_ROTA,
        fillOpacity: 1,
      })
        .bindTooltip(origem ? `Origem: ${origem}` : "Origem")
        .addTo(mapa);
    }
    if (fim) {
      L.circleMarker(fim, {
        radius: 8,
        color: COR_PARADA,
        fillColor: COR_PARADA,
        fillOpacity: 1,
      })
        .bindTooltip(destino ? `Destino: ${destino}` : "Destino")
        .addTo(mapa);
    }

    percurso.paradas.forEach((parada) => {
      L.circleMarker(L.latLng(parada.latitude, parada.longitude), {
        radius: 6,
        color: COR_PARADA,
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 3,
      })
        .bindTooltip(rotuloParada(parada))
        .addTo(mapa);
    });

    const limites = linha.getBounds();
    if (limites.isValid()) {
      mapa.fitBounds(limites, { padding: [24, 24] });
    }

    return () => {
      mapa.remove();
    };
  }, [percurso, origem, destino]);

  return (
    <section className="card" aria-labelledby="mapa-titulo">
      <div className="card__header">
        <svg className="icon icon--lg" aria-hidden="true">
          <use href="/icons.svg#ic-mapa" />
        </svg>
        <div>
          <h2 className="card__title" id="mapa-titulo">
            Mapa da rota
          </h2>
          <p className="card__subtitle">
            {origem && destino ? `${origem} → ${destino}` : "Traçado sobre OpenStreetMap"}
          </p>
        </div>
      </div>

      {temRota ? (
        <>
          <div
            ref={containerRef}
            className="mapa__canvas"
            role="img"
            aria-label={`Mapa do trajeto de ${origem ?? "origem"} até ${destino ?? "destino"}`}
          />
          {percurso && percurso.paradas.length > 0 && (
            <ul className="lista" aria-label="Paradas planejadas">
              {percurso.paradas.map((parada) => (
                <li className="parada-item" key={`${parada.nome}-${parada.km_do_inicio}`}>
                  <svg className="icon" aria-hidden="true">
                    <use
                      href={
                        parada.tipo === "recarga"
                          ? "/icons.svg#ic-raio"
                          : "/icons.svg#ic-combustivel"
                      }
                    />
                  </svg>
                  <span className="historico__meta">
                    <span className="historico__rota">{parada.nome}</span>
                    <span className="historico__data">
                      {Math.round(parada.km_do_inicio)} km do início
                    </span>
                  </span>
                  <span
                    className={`dot ${
                      parada.nivel === "ok"
                        ? "dot--ok"
                        : parada.nivel === "atencao"
                          ? ""
                          : "dot--off"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="sr-only">
                    Autonomia restante: {Math.round(parada.autonomia_restante_pct)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="mapa__placeholder">
          <svg className="icon icon--lg" aria-hidden="true">
            <use href="/icons.svg#ic-pin" />
          </svg>
          <p>O mapa aparece aqui depois que você gerar um roteiro.</p>
        </div>
      )}
    </section>
  );
}

export default MapaRota;
