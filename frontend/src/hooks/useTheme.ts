// Tema claro/escuro: aplica data-theme no <html> e guarda a escolha. Sem escolha salva,
// segue o tema do sistema operacional.

import { useCallback, useEffect, useState } from "react";

import { CHAVES_STORAGE } from "../config";
import { gravarTexto, lerTexto } from "../services/visitanteStorage";

export type Tema = "claro" | "escuro";

function temaInicial(): Tema {
  const salvo = lerTexto(CHAVES_STORAGE.tema);
  if (salvo === "claro" || salvo === "escuro") return salvo;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

export function useTheme() {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema === "escuro" ? "dark" : "light");
  }, [tema]);

  const alternarTema = useCallback(() => {
    setTema((atual) => {
      const novo = atual === "escuro" ? "claro" : "escuro";
      gravarTexto(CHAVES_STORAGE.tema, novo);
      return novo;
    });
  }, []);

  return { tema, alternarTema };
}
