// Barreira de contenção para tratamento resiliente de erros de renderização na UI.

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface EstadoErro {
  erro: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, EstadoErro> {
  state: EstadoErro = { erro: null };

  static getDerivedStateFromError(erro: Error): EstadoErro {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Falha de renderização:", erro, info.componentStack);
  }

  private readonly recarregar = (): void => {
    this.setState({ erro: null });
  };

  render(): ReactNode {
    const { erro } = this.state;
    const { children, fallback } = this.props;

    if (!erro) return children;
    if (fallback) return fallback;

    return (
      <section className="erro-boundary" role="alert">
        <h2>Algo deu errado ao exibir esta seção</h2>
        <p>
          Ocorreu um erro inesperado na interface. Você pode tentar recarregar a área sem perder o
          restante da página.
        </p>
        <button type="button" className="btn btn--primary" onClick={this.recarregar}>
          Tentar novamente
        </button>
      </section>
    );
  }
}

export default ErrorBoundary;
