// Ações rápidas sobre a viagem: exportação, compartilhamento e navegação.

export interface BotoesControleViagemProps {
  onExportar: () => void;
  onCompartilhar: () => void;
  onNovaViagem?: () => void;
  onImprimir?: () => void;
  exportando?: boolean;
  compartilhando?: boolean;
  desabilitado?: boolean;
}

export function BotoesControleViagem({
  onExportar,
  onCompartilhar,
  onNovaViagem,
  onImprimir,
  exportando = false,
  compartilhando = false,
  desabilitado = false,
}: BotoesControleViagemProps) {
  const bloqueado = desabilitado || exportando || compartilhando;

  return (
    <div className="acoes" role="group" aria-label="Ações da viagem">
      <button type="button" className="btn btn--primary" onClick={onExportar} disabled={bloqueado}>
        {exportando ? (
          <span className="btn__spinner" aria-hidden="true" />
        ) : (
          <svg className="icon" aria-hidden="true">
            <use href="/icons.svg#ic-download" />
          </svg>
        )}
        {exportando ? "Exportando..." : "Exportar"}
      </button>

      <button
        type="button"
        className="btn btn--ghost"
        onClick={onCompartilhar}
        disabled={bloqueado}
      >
        {compartilhando ? (
          <span className="btn__spinner" aria-hidden="true" />
        ) : (
          <svg className="icon" aria-hidden="true">
            <use href="/icons.svg#ic-compartilhar" />
          </svg>
        )}
        {compartilhando ? "Compartilhando..." : "Compartilhar"}
      </button>

      {onImprimir && (
        <button type="button" className="btn btn--ghost" onClick={onImprimir} disabled={bloqueado}>
          <svg className="icon" aria-hidden="true">
            <use href="/icons.svg#ic-mapa" />
          </svg>
          Imprimir
        </button>
      )}

      {onNovaViagem && (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onNovaViagem}
          disabled={desabilitado}
        >
          <svg className="icon" aria-hidden="true">
            <use href="/icons.svg#ic-mais" />
          </svg>
          Nova viagem
        </button>
      )}
    </div>
  );
}

export default BotoesControleViagem;
