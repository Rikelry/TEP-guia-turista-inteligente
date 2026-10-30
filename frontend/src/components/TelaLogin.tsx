// Tela de entrada: o app só abre depois do login com a Conta Google ou como visitante.

import type { ReactNode } from "react";

export interface TelaLoginProps {
  onEntrarVisitante: () => void;
  /** Botão do Google (fica de fora quando não há Client ID configurado). */
  acaoLoginGoogle?: ReactNode;
  /** Conta Google guardada pela sessão híbrida: volta sem novo login. */
  nomeGoogleSalvo?: string | null;
  onVoltarGoogle?: () => void;
  carregando?: boolean;
  erro?: string | null;
}

export function TelaLogin({
  onEntrarVisitante,
  acaoLoginGoogle,
  nomeGoogleSalvo,
  onVoltarGoogle,
  carregando = false,
  erro,
}: TelaLoginProps) {
  return (
    <main className="container page login" id="conteudo">
      <section className="login-card" aria-labelledby="login-titulo">
        <div className="login-card__icon" aria-hidden="true">
          <svg className="icon icon--lg" viewBox="0 0 24 24">
            <use href="/icons.svg#ic-mapa" />
          </svg>
        </div>

        <h1 id="login-titulo">Guia do Turista Inteligente</h1>

        <p className="login-card__description">
          Planeje suas viagens com rotas inteligentes, informações sobre o clima e recomendações
          turísticas.
        </p>

        <h2>Acesse para começar</h2>

        <p>Entre com sua Conta Google ou continue como visitante.</p>

        {erro && (
          <div className="login-card__error" role="alert">
            {erro}
          </div>
        )}

        <div className="login-card__actions">
          {nomeGoogleSalvo && onVoltarGoogle ? (
            <button type="button" className="btn btn--primary" onClick={onVoltarGoogle}>
              <svg className="icon" aria-hidden="true">
                <use href="/icons.svg#ic-trocar" />
              </svg>
              Voltar para {nomeGoogleSalvo}
            </button>
          ) : (
            acaoLoginGoogle
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
            {carregando ? "Aguarde..." : "Entrar como visitante"}
          </button>
        </div>

        <small>A sessão de visitante é temporária (2 horas) e some ao fechar a aba.</small>
      </section>
    </main>
  );
}

export default TelaLogin;
