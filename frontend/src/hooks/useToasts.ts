// Notificações temporizadas: cada aviso some sozinho (erros ficam o dobro do tempo).

import { useCallback, useEffect, useRef, useState } from "react";

import type { ToastItem, ToastTipo } from "../components/Toast";

const DURACAO_MS = 5000;
const MAX_TOASTS = 4;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const remover = useCallback((id: string) => {
    setToasts((lista) => lista.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const notificar = useCallback(
    (tipo: ToastTipo, mensagem: string, titulo?: string) => {
      const id = Math.random().toString(36).slice(2);
      const item: ToastItem = titulo ? { id, tipo, mensagem, titulo } : { id, tipo, mensagem };
      setToasts((lista) => [...lista, item].slice(-MAX_TOASTS));
      timers.current.set(
        id,
        window.setTimeout(() => remover(id), tipo === "error" ? DURACAO_MS * 2 : DURACAO_MS),
      );
    },
    [remover],
  );

  useEffect(() => {
    const ativos = timers.current;
    return () => ativos.forEach((t) => window.clearTimeout(t));
  }, []);

  return { toasts, notificar, remover };
}
