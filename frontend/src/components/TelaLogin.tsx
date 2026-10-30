import type { ReactNode } from "react";

interface TelaLoginProps {
  onEntrarVisitante: () => void;
  acaoLoginGoogle?: ReactNode;
  carregando?: boolean;
  erro?: string | null;
}

export function TelaLogin({
  onEntrarVisitante,
  acaoLoginGoogle,
  carregando = false,
  erro,
}: TelaLoginProps) {
  return (
    <main className="container page">
      <section className="login-card" aria-labelledby="login-titulo">
        <div className="login-card__icon" aria-hidden="true">
          <svg className="icon icon--lg" viewBox="0 0 24 24">
            <use href="/icons.svg#ic-mapa" />
          </svg>
        </div>

        <h1 id="login-titulo">Guia do Turista Brasil</h1>

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
          {acaoLoginGoogle}

          <button
            type="button"
            className="btn btn--secondary"
            onClick={onEntrarVisitante}
            disabled={carregando}
          >
            {carregando ? "Aguarde..." : "Entrar como visitante"}
          </button>
        </div>

        <small>A sessão de visitante é temporária.</small>
      </section>
    </main>
  );
}

export default TelaLogin;
