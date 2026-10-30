// Topbar: marca, alternador de tema, Google Sign-In e sessão híbrida (visitante com
// contagem regressiva e "Voltar para [Nome]" sem novo login no Google).

import { useEffect, useRef, useState } from "react";

import type { Tema } from "../hooks/useTheme";
import GoogleLoginButton from "./GoogleLoginButton";
import type { Usuario } from "../types/schemas";

export type { Tema };

export interface HeaderProps {
  usuario: Usuario | null;
  googleSalvo: Usuario | null;
  carregando?: boolean;
  tema: Tema;
  /** Tempo restante do visitante já formatado. */
  restanteVisitante?: string | null;
  onAlternarTema: () => void;
  onEntrarGoogle: (credential: string) => void;
  onEntrarVisitante: () => void;
  onVoltarGoogle: () => void;
  onSair: () => void;
}

function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function primeiroNome(nome: string): string {
  return nome.split(" ")[0] || nome;
}

export function Header({
  usuario,
  googleSalvo,
  carregando = false,
  tema,
  restanteVisitante,
  onAlternarTema,
  onEntrarGoogle,
  onEntrarVisitante,
  onVoltarGoogle,
  onSair,
}: HeaderProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const temaEscuro = tema === "escuro";

  // Fecha o menu com Esc ou clique fora.
  useEffect(() => {
    if (!menuAberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setMenuAberto(false);
    const aoClicar = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicar);
    };
  }, [menuAberto]);

  const executar = (acao: () => void) => () => {
    setMenuAberto(false);
    acao();
  };

  return (
    <header className="header">
      <div className="container header__inner">
        <a className="header__brand" href="/">
          <span className="header__brand-mark" aria-hidden="true">
            <svg className="icon icon--lg" viewBox="0 0 24 24">
              <use href="/icons.svg#ic-mapa" />
            </svg>
          </span>
          <span className="header__brand-text">
            <span>Guia do Turista Inteligente</span>
            <span className="header__brand-sub">
              Consultor de viagens com rotas, clima e guia turístico gerado por IA
            </span>
          </span>
        </a>

        <div className="header__actions">
          <button
            type="button"
            className="btn btn--icon"
            aria-label={temaEscuro ? "Ativar tema claro" : "Ativar tema escuro"}
            title={temaEscuro ? "Tema claro" : "Tema escuro"}
            onClick={onAlternarTema}
          >
            <svg className="icon" aria-hidden="true">
              <use href={temaEscuro ? "/icons.svg#ic-sol" : "/icons.svg#ic-lua"} />
            </svg>
          </button>

          {usuario ? (
            <div className="menu" ref={menuRef}>
              <button
                type="button"
                className="user-chip"
                aria-haspopup="menu"
                aria-expanded={menuAberto}
                onClick={() => setMenuAberto((v) => !v)}
              >
                {usuario.foto ? (
                  <img
                    className="user-chip__foto"
                    src={usuario.foto}
                    alt=""
                    width={32}
                    height={32}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="user-chip__avatar" aria-hidden="true">
                    {iniciais(usuario.nome) || "?"}
                  </span>
                )}
                <span>
                  <span className="user-chip__name">{usuario.nome}</span>
                  <span className="user-chip__badge">
                    {usuario.tipo === "google"
                      ? "Google conectado"
                      : restanteVisitante
                        ? `Visitante · expira em ${restanteVisitante}`
                        : "Visitante temporário"}
                  </span>
                </span>
              </button>
              {menuAberto && (
                <div className="menu__panel" role="menu">
                  {usuario.tipo === "google" && (
                    <button
                      type="button"
                      className="menu__item"
                      role="menuitem"
                      onClick={executar(onEntrarVisitante)}
                    >
                      <svg className="icon" aria-hidden="true">
                        <use href="/icons.svg#ic-usuario" />
                      </svg>
                      Usar como visitante
                    </button>
                  )}
                  {usuario.tipo === "visitante" && googleSalvo && (
                    <button
                      type="button"
                      className="menu__item"
                      role="menuitem"
                      onClick={executar(onVoltarGoogle)}
                    >
                      <svg className="icon" aria-hidden="true">
                        <use href="/icons.svg#ic-trocar" />
                      </svg>
                      Voltar para {primeiroNome(googleSalvo.nome)}
                    </button>
                  )}
                  <button
                    type="button"
                    className="menu__item"
                    role="menuitem"
                    onClick={executar(onSair)}
                  >
                    <svg className="icon" aria-hidden="true">
                      <use href="/icons.svg#ic-sair" />
                    </svg>
                    Encerrar sessão
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {googleSalvo ? (
                <button type="button" className="btn btn--ghost" onClick={onVoltarGoogle}>
                  <svg className="icon" aria-hidden="true">
                    <use href="/icons.svg#ic-trocar" />
                  </svg>
                  Voltar para {primeiroNome(googleSalvo.nome)}
                </button>
              ) : (
                <GoogleLoginButton
                  onCredential={onEntrarGoogle}
                  tema={tema}
                  className="header__google"
                />
              )}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={onEntrarVisitante}
                disabled={carregando}
              >
                <svg className="icon" aria-hidden="true">
                  <use href="/icons.svg#ic-usuario" />
                </svg>
                {carregando ? "Entrando..." : "Entrar como visitante"}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
