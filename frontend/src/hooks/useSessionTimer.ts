// Relógio da sessão: tempo decorrido desde o login e, para visitante, contagem regressiva
// das 2 horas com aviso de expiração (chama `aoExpirar` uma única vez).

import { useEffect, useRef, useState } from "react";

export function formatarDuracao(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m > 0) return `${m}min ${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}

export function useSessionTimer(
  desde: number | undefined,
  expiraEm: number | undefined,
  aoExpirar?: () => void,
) {
  const [agora, setAgora] = useState(() => Date.now());
  const aoExpirarRef = useRef(aoExpirar);
  const disparou = useRef(false);

  useEffect(() => {
    aoExpirarRef.current = aoExpirar;
  }, [aoExpirar]);

  useEffect(() => {
    disparou.current = false;
    if (desde === undefined) return;
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [desde, expiraEm]);

  const restanteMs = expiraEm === undefined ? null : Math.max(0, expiraEm - agora);
  const expirado = restanteMs === 0;

  useEffect(() => {
    if (expirado && !disparou.current) {
      disparou.current = true;
      aoExpirarRef.current?.();
    }
  }, [expirado]);

  return {
    decorrido: desde === undefined ? "" : formatarDuracao(agora - desde),
    restante: restanteMs === null ? null : formatarDuracao(restanteMs),
    expirado,
    /** Menos de 10 minutos de visitante. */
    acabando: restanteMs !== null && restanteMs > 0 && restanteMs <= 10 * 60 * 1000,
  };
}
