// Botão oficial do Google Identity Services (usado na tela de login e no cabeçalho).
// Espera o script do index.html carregar; sem VITE_GOOGLE_CLIENT_ID não renderiza nada.

import { useEffect, useRef, useState } from "react";

import { GOOGLE_CLIENT_ID } from "../config";
import type { Tema } from "../hooks/useTheme";

export interface GoogleLoginButtonProps {
  onCredential: (credential: string) => void;
  tema?: Tema;
  className?: string;
}

export function GoogleLoginButton({
  onCredential,
  tema = "claro",
  className,
}: GoogleLoginButtonProps) {
  const alvo = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let tentativas = 0;
    const desenhar = (): boolean => {
      const gsi = window.google?.accounts.id;
      if (!gsi || !alvo.current) return false;
      gsi.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r) => onCredentialRef.current(r.credential),
        cancel_on_tap_outside: true,
      });
      alvo.current.replaceChildren();
      gsi.renderButton(alvo.current, {
        theme: tema === "escuro" ? "filled_black" : "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
        locale: "pt-BR",
      });
      setPronto(true);
      return true;
    };
    if (desenhar()) return;
    const id = window.setInterval(() => {
      tentativas += 1;
      if (desenhar() || tentativas > 25) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [tema]);

  if (!GOOGLE_CLIENT_ID) return null;
  return <div ref={alvo} className={className} aria-busy={!pronto} />;
}

export default GoogleLoginButton;
