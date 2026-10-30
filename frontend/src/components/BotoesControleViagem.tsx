// Ações rápidas da viagem: abrir no Google Maps, compartilhar no WhatsApp, baixar GPX 1.1,
// imprimir e excluir.

export interface BotoesControleViagemProps {
  linkMaps: string;
  onWhatsApp: () => void;
  onGpx: () => void;
  onExcluir: () => void;
  onImprimir?: () => void;
  desabilitado?: boolean;
}

export function BotoesControleViagem({
  linkMaps,
  onWhatsApp,
  onGpx,
  onExcluir,
  onImprimir = () => window.print(),
  desabilitado = false,
}: BotoesControleViagemProps) {
  return (
    <div className="acoes" role="group" aria-label="Ações da viagem">
      <a className="btn btn--ghost btn--pequeno" href={linkMaps} target="_blank" rel="noreferrer">
        <svg className="icon" aria-hidden="true">
          <use href="/icons.svg#ic-mapa" />
        </svg>
        Abrir no Maps
      </a>
      <button
        type="button"
        className="btn btn--whatsapp btn--pequeno"
        onClick={onWhatsApp}
        disabled={desabilitado}
      >
        <svg className="icon" aria-hidden="true">
          <use href="/icons.svg#ic-compartilhar" />
        </svg>
        WhatsApp
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--pequeno"
        onClick={onGpx}
        disabled={desabilitado}
      >
        <svg className="icon" aria-hidden="true">
          <use href="/icons.svg#ic-download" />
        </svg>
        GPX
      </button>
      <button type="button" className="btn btn--ghost btn--pequeno" onClick={onImprimir}>
        <svg className="icon" aria-hidden="true">
          <use href="/icons.svg#ic-estrela" />
        </svg>
        Imprimir
      </button>
      <button
        type="button"
        className="btn btn--danger btn--pequeno"
        onClick={onExcluir}
        disabled={desabilitado}
      >
        <svg className="icon" aria-hidden="true">
          <use href="/icons.svg#ic-lixeira" />
        </svg>
        Excluir
      </button>
    </div>
  );
}

export default BotoesControleViagem;
