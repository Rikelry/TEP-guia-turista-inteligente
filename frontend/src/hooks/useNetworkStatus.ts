// Status online/offline do navegador e qualidade da conexão (Network Information API, quando existe).

import { useEffect, useState } from "react";

interface InfoConexao {
  effectiveType?: string;
  rtt?: number;
  addEventListener?: (evento: "change", fn: () => void) => void;
  removeEventListener?: (evento: "change", fn: () => void) => void;
}

export interface StatusRede {
  online: boolean;
  /** "4g", "3g"… quando o navegador informa. */
  tipo: string | null;
  /** Tempo de ida e volta estimado (ms). */
  rttMs: number | null;
  qualidade: "Excelente" | "Boa" | "Lenta" | "Offline" | "Desconhecida";
}

function conexao(): InfoConexao | undefined {
  return (navigator as Navigator & { connection?: InfoConexao }).connection;
}

function ler(): StatusRede {
  const online = navigator.onLine;
  const c = conexao();
  const rtt = typeof c?.rtt === "number" ? c.rtt : null;
  let qualidade: StatusRede["qualidade"] = "Desconhecida";
  if (!online) qualidade = "Offline";
  else if (rtt !== null) qualidade = rtt <= 100 ? "Excelente" : rtt <= 300 ? "Boa" : "Lenta";
  return { online, tipo: c?.effectiveType ?? null, rttMs: rtt, qualidade };
}

export function useNetworkStatus(): StatusRede {
  const [status, setStatus] = useState<StatusRede>(ler);

  useEffect(() => {
    const atualizar = () => setStatus(ler());
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    conexao()?.addEventListener?.("change", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
      conexao()?.removeEventListener?.("change", atualizar);
    };
  }, []);

  return status;
}
