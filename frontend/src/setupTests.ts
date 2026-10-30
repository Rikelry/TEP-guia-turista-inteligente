// Inicialização do ambiente de testes unitários (Vitest + Testing Library).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

// Sem `globals: true`, o Testing Library não registra o cleanup automático.
afterEach(() => {
  cleanup();
});

// O jsdom não implementa matchMedia, usado pelo hook de tema (useTheme).
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
