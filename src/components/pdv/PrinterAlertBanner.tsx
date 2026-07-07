import { useState } from "react";
import { AlertTriangle, Printer, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { usePrinterAlerts, type PrinterProblem } from "@/hooks/use-printer-alerts";

const DISMISS_KEY = "printer-alerts-dismissed";

function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISS_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Banner fixo no topo do PDV que avisa quando uma impressora parou de imprimir
 * (comandas falhando) ou quando o Print Bridge parece offline (fila parada).
 * Fonte: usePrinterAlerts (pdv_print_jobs). Some sozinho quando normaliza.
 */
export function PrinterAlertBanner() {
  const { problems, bridgeOffline } = usePrinterAlerts();
  const [dismissed, setDismissed] = useState<Record<string, string>>(readDismissed);

  const dismiss = (key: string, lastAt: string) => {
    const next = { ...dismissed, [key]: lastAt };
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // Só esconde se foi dispensado E não houve falha mais nova desde então.
  const visible = problems.filter(
    (p) => !dismissed[p.key] || new Date(p.lastAt).getTime() > new Date(dismissed[p.key]).getTime(),
  );

  if (visible.length === 0) return null;

  // Print Bridge offline: várias filas paradas ao mesmo tempo → um aviso único.
  if (bridgeOffline && visible.some((p) => p.stuckPending > 0)) {
    const key = "__bridge_offline__";
    const lastAt = visible[0].lastAt;
    if (dismissed[key] && new Date(lastAt).getTime() <= new Date(dismissed[key]).getTime()) {
      return null;
    }
    return (
      <div className="px-3 pt-2">
        <Alert variant="destructive" className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4" />
          <div className="flex-1">
            <AlertTitle>Impressão parada — verifique o Print Bridge</AlertTitle>
            <AlertDescription>
              Várias comandas estão presas na fila e não saíram. O serviço de impressão (Print
              Bridge) no computador do caixa pode estar fechado ou sem internet. Abra o programa e
              confira a conexão.
            </AlertDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-destructive"
            onClick={() => dismiss(key, lastAt)}
            aria-label="Dispensar"
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="px-3 pt-2 space-y-2">
      {visible.map((p: PrinterProblem) => (
        <Alert key={p.key} variant="destructive" className="flex items-start gap-2">
          <Printer className="h-4 w-4" />
          <div className="flex-1">
            <AlertTitle>Impressora "{p.centerName}" não está imprimindo</AlertTitle>
            <AlertDescription>
              {p.failedCount > 0
                ? `${p.failedCount} comanda(s) falharam`
                : `${p.stuckPending} comanda(s) na fila sem sair`}
              {p.printerIp ? ` · ${p.printerIp}` : ""} · verifique a impressora (energia, cabo de
              rede e IP).
              {p.lastError ? ` [${p.lastError}]` : ""}
            </AlertDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-destructive"
            onClick={() => dismiss(p.key, p.lastAt)}
            aria-label="Dispensar"
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      ))}
    </div>
  );
}
