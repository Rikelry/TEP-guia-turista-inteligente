// Notificações flutuantes acessíveis (sucesso, erro, informativo).

export type ToastTipo = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  tipo: ToastTipo;
  titulo?: string | undefined;
  mensagem: string;
}

export interface ToastProps {
  toasts: ToastItem[];
  onFechar: (id: string) => void;
}

const TITULOS: Record<ToastTipo, string> = {
  success: "Sucesso",
  error: "Erro",
  info: "Informação",
};

function iconePorTipo(tipo: ToastTipo): string {
  if (tipo === "success") return "/icons.svg#ic-check";
  if (tipo === "error") return "/icons.svg#ic-aviso";
  return "/icons.svg#ic-info";
}

export function Toast({ toasts, onFechar }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-region" role="region" aria-label="Notificações" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.tipo}`}
          role={toast.tipo === "error" ? "alert" : "status"}
        >
          <svg className="icon" aria-hidden="true">
            <use href={iconePorTipo(toast.tipo)} />
          </svg>
          <div className="toast__content">
            <p className="toast__title">{toast.titulo ?? TITULOS[toast.tipo]}</p>
            <p className="toast__msg">{toast.mensagem}</p>
          </div>
          <button
            type="button"
            className="btn btn--icon"
            aria-label="Fechar notificação"
            onClick={() => onFechar(toast.id)}
          >
            <svg className="icon" aria-hidden="true">
              <use href="/icons.svg#ic-fechar" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

export default Toast;
