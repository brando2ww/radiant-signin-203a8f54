import { useState } from "react";
import { Link } from "react-router-dom";
import { FileWarning, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useFiscalAlerts } from "@/hooks/use-fiscal-alerts";

const DISMISS_KEY = "fiscal-alerts-dismissed";

/**
 * Avisa o gerente sobre cupons fiscais que não saíram nas últimas 24h.
 *
 * A venda nunca é bloqueada por falha fiscal — é decisão de produto, para não
 * travar a fila do caixa quando a SEFAZ cai ou um produto está sem NCM. O
 * preço disso é que a pendência precisa ficar visível em algum lugar, e é aqui.
 * Mesmo comportamento de dispensa do [PrinterAlertBanner]: volta a aparecer se
 * o número de pendências crescer.
 */
export function FiscalAlertBanner() {
  const { rejeitadas, travadas, ultimoMotivo, total } = useFiscalAlerts();
  const [dismissedAt, setDismissedAt] = useState<number>(() => {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    return raw ? Number(raw) || 0 : 0;
  });

  if (total === 0 || total <= dismissedAt) return null;

  const dismiss = () => {
    setDismissedAt(total);
    try {
      sessionStorage.setItem(DISMISS_KEY, String(total));
    } catch {
      /* ignore */
    }
  };

  const partes = [
    rejeitadas > 0 ? `${rejeitadas} rejeitada(s) pela Receita` : null,
    travadas > 0 ? `${travadas} sem retorno` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="px-3 pt-2">
      <Alert className="flex items-start gap-2 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <FileWarning className="h-4 w-4" />
        <div className="flex-1">
          <AlertTitle>Cupons fiscais pendentes nas últimas 24h</AlertTitle>
          <AlertDescription>
            {partes}. As vendas foram registradas normalmente, mas a nota não saiu.
            {ultimoMotivo ? ` Último motivo: ${ultimoMotivo}.` : ""}{" "}
            <Link to="/pdv/cupons-fiscais" className="underline font-medium">
              Ver cupons fiscais
            </Link>
          </AlertDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={dismiss}
          aria-label="Dispensar"
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    </div>
  );
}
