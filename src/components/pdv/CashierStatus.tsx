import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePDVCashier } from "@/hooks/use-pdv-cashier";
import { formatBRL } from "@/lib/format";

export function CashierStatus() {
  const { activeSession, isLoading } = usePDVCashier();
  
  const isCashierOpen = !!activeSession;
  const currentBalance = activeSession
    ? activeSession.opening_balance + activeSession.total_cash - activeSession.total_withdrawals
    : 0;

  if (isLoading && activeSession === undefined) {
    return (
      <Button variant="ghost" size="sm" className="flex items-center gap-2 h-10 px-3">
        <span className="text-sm font-medium animate-pulse">...</span>
        <Badge variant="secondary">...</Badge>
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" className="flex items-center gap-2 h-10 px-3">
            <span className="text-sm font-semibold">R$</span>
            <span className="hidden sm:inline text-sm font-medium">
              {currentBalance.toFixed(2)}
            </span>
            <Badge variant={isCashierOpen ? "default" : "secondary"} className="ml-1">
              {isCashierOpen ? "Aberto" : "Fechado"}
            </Badge>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Caixa {isCashierOpen ? "aberto" : "fechado"}</p>
          <p className="text-xs text-muted-foreground">
            Saldo atual: {formatBRL(currentBalance)}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
