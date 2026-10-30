// Topbar: alternador Dark/Light, apresentação do usuário e sessão híbrida.

import { useState } from "react";
import type { ReactNode } from "react";

import type { Usuario } from "../types/schemas";

export type Tema = "claro" | "escuro";

export interface HeaderProps {
  usuario: Usuario | null;
  tema: Tema;
  onAlternarTema: () => void;
  onEntrarVisitante: () => void;
  onSair: () => void;
  /** Conta Google mantida em espera enquanto se navega como visitante. */
  usuarioGoogleSalvo?: { nome: string } | null;
  onRestaurarGoogle?: () => void;
  /** Botão de login Google injetado pelo orquestrador (Google Identity Services). */
  acaoLogin?: ReactNode;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).slice(0, 2);
  return partes.map((parte) => parte.charAt(0).toUpperCase()).join("");
}

export function Header({
  usuario,
  tema,
  onAlternarTema,
  onEntrarVisitante,
  onSair,
  usuarioGoogleSalvo,
  onRestaurarGoogle,
  acaoLogin,
}: HeaderProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const temaEscuro = tema === "escuro";

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
            <span>Guia do Turista</span>
            <span className="header__brand-sub">Inteligente</span>
          </span>
        </a>

        <div className="header__actions">
          <button
            type="button"
            className="btn btn--icon"
            aria-pressed={temaEscuro}
            aria-label={temaEscuro ? "Ativar tema claro" : "Ativar tema escuro"}
            title={temaEscuro ? "Tema claro" : "Tema escuro"}
            onClick={onAlternarTema}
          >
            <svg className="icon" aria-hidden="true">
              <use href={temaEscuro ? "/icons.svg#ic-sol" : "/icons.svg#ic-lua"} />
            </svg>
          </button>

          {usuario ? (
            <div className="menu">
              <button
                type="button"
                className="user-chip"
                aria-haspopup="menu"
                aria-expanded={menuAberto}
                onClick={() => setMenuAberto((aberto) => !aberto)}
              >
                <span className="user-chip__avatar" aria-hidden="true">
                  {iniciais(usuario.nome) || "?"}
                </span>
                <span>
                  <span className="user-chip__name">{usuario.nome}</span>
                  <span className="user-chip__badge">
                    {usuario.tipo === "google" ? "Google conectado" : "Visitante temporário"}
                  </span>
                </span>
              </button>

              {menuAberto && (
                <div className="menu__panel" role="menu">
                  <button type="button" className="menu__item" role="menuitem" onClick={onSair}>
                    <svg className="icon" aria-hidden="true">
                      <use href="/icons.svg#ic-sair" />
                    </svg>
                    Encerrar sessão
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="header__actions">
              {acaoLogin}
              {usuarioGoogleSalvo && onRestaurarGoogle ? (
                <button type="button" className="btn btn--ghost" onClick={onRestaurarGoogle}>
                  <svg className="icon" aria-hidden="true">
                    <use href="/icons.svg#ic-trocar" />
                  </svg>
                  Voltar para {usuarioGoogleSalvo.nome}
                </button>
              ) : (
                <button type="button" className="btn btn--ghost" onClick={onEntrarVisitante}>
                  <svg className="icon" aria-hidden="true">
                    <use href="/icons.svg#ic-usuario" />
                  </svg>
                  Entrar como visitante
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
