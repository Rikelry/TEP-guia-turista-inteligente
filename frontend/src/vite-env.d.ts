/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Google Identity Services (script em index.html). Só o que a SPA usa.
interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (resposta: { credential: string }) => void;
          cancel_on_tap_outside?: boolean;
        }) => void;
        renderButton: (
          elemento: HTMLElement,
          opcoes: { theme?: string; size?: string; text?: string; shape?: string; locale?: string },
        ) => void;
        disableAutoSelect: () => void;
      };
    };
  };
}
