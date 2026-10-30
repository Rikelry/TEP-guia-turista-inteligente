import { useEffect, useRef } from "react";
import { GOOGLE_CLIENT_ID } from "../config";

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleLoginButtonProps {
  onCredential: (credential: string) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              theme: "outline";
              size: "large";
              text: "signin_with";
              shape: "rectangular";
              width: string;
              locale: string;
            },
          ) => void;
        };
      };
    };
  }
}

export function GoogleLoginButton({ onCredential }: GoogleLoginButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !buttonRef.current) return;

    let intervalo: number | undefined;

    const inicializarGoogle = () => {
      const google = window.google;

      if (!google || !buttonRef.current) return false;

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (response.credential) {
            onCredential(response.credential);
          }
        },
      });

      buttonRef.current.innerHTML = "";

      google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width: "280",
        locale: "pt-BR",
      });

      return true;
    };

    if (inicializarGoogle()) return;

    intervalo = window.setInterval(() => {
      if (inicializarGoogle() && intervalo !== undefined) {
        window.clearInterval(intervalo);
      }
    }, 200);

    return () => {
      if (intervalo !== undefined) {
        window.clearInterval(intervalo);
      }
    };
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  return <div ref={buttonRef} aria-label="Entrar com Google" />;
}

export default GoogleLoginButton;
