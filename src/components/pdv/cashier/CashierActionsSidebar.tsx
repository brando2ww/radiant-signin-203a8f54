import { Unlock, Lock, TrendingUp, TrendingDown, HelpCircle, Receipt, Printer, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CashierActionsSidebarProps {
  isOpen: boolean;
  isLoading: boolean;
  onOpenCashier: () => void;
  onCloseCashier: () => void;
  onAddReinforcement: () => void;
  onAddWithdrawal: () => void;
  onCharge: () => void;
  onShowHelp: () => void;
  onReprintLast?: () => void;
  onEmployeeConsumption?: () => void;
  onQuickExpense?: () => void;
}

export function CashierActionsSidebar({
  isOpen,
  isLoading,
  onOpenCashier,
  onCloseCashier,
  onAddReinforcement,
  onAddWithdrawal,
  onCharge,
  onShowHelp,
  onReprintLast,
  onEmployeeConsumption,
  onQuickExpense,
}: CashierActionsSidebarProps) {
  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        Ações Rápidas
      </h3>

      {!isOpen ? (
        <>
          <Button
            onClick={onOpenCashier}
            disabled={isLoading}
            className="h-20 flex-col gap-1 bg-green-600 hover:bg-green-700 text-white"
          >
            <Unlock className="h-6 w-6" />
            <span className="text-sm font-medium">Abrir Caixa</span>
            <kbd className="text-[10px] opacity-70 bg-black/20 px-1.5 py-0.5 rounded">F1</kbd>
          </Button>

          {onReprintLast && (
            <Button
              onClick={onReprintLast}
              variant="outline"
              className="h-16 flex-col gap-1 border-muted-foreground/30 hover:bg-muted"
            >
              <Printer className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs font-medium">Reimprimir Último Caixa</span>
            </Button>
          )}
        </>
      ) : (
        <>
          {/* Grid 2x2 com ações secundárias compactas */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={onAddReinforcement}
              disabled={isLoading}
              variant="outline"
              className="h-14 flex-col gap-0.5 border-green-500/30 hover:bg-green-500/10 hover:border-green-500/50"
            >
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium leading-none">Reforço</span>
              <kbd className="text-[9px] opacity-50 bg-muted px-1 py-0 rounded">F2</kbd>
            </Button>

            <Button
              onClick={onAddWithdrawal}
              disabled={isLoading}
              variant="outline"
              className="h-14 flex-col gap-0.5 border-orange-500/30 hover:bg-orange-500/10 hover:border-orange-500/50"
            >
              <TrendingDown className="h-4 w-4 text-orange-600" />
              <span className="text-xs font-medium leading-none">Sangria</span>
              <kbd className="text-[9px] opacity-50 bg-muted px-1 py-0 rounded">F3</kbd>
            </Button>

            <Button
              onClick={onCharge}
              disabled={isLoading}
              variant="outline"
              className="h-14 flex-col gap-0.5 border-primary/30 hover:bg-primary/10 hover:border-primary/50"
            >
              <Receipt className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium leading-none">Cobrar</span>
              <kbd className="text-[9px] opacity-50 bg-muted px-1 py-0 rounded">F5</kbd>
            </Button>

            {onEmployeeConsumption && (
              <Button
                onClick={onEmployeeConsumption}
                disabled={isLoading}
                variant="outline"
                className="h-14 flex-col gap-0.5 border-muted-foreground/30 hover:bg-muted"
              >
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium leading-none">Consumo</span>
                <span className="text-[9px] opacity-50">Func.</span>
              </Button>
            )}

            {onQuickExpense && (
              <Button
                onClick={onQuickExpense}
                disabled={isLoading}
                variant="outline"
                className="h-14 flex-col gap-0.5 border-muted-foreground/30 hover:bg-muted"
              >
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium leading-none">Despesa</span>
                <span className="text-[9px] opacity-50">Mercado/Motoboy</span>
              </Button>
            )}
          </div>

          <div className="flex-1 min-h-2" />

          {/* Fechar Caixa em destaque, full-width */}
          <Button
            onClick={onCloseCashier}
            disabled={isLoading}
            variant="destructive"
            className="h-20 flex-col gap-1"
          >
            <Lock className="h-6 w-6" />
            <span className="text-sm font-medium">Fechar Caixa</span>
            <kbd className="text-[10px] opacity-70 bg-black/20 px-1.5 py-0.5 rounded">F4</kbd>
          </Button>
        </>
      )}

      {/* Botão de Ajuda */}
      <div className="mt-auto pt-4 border-t">
        <Button
          onClick={onShowHelp}
          variant="ghost"
          size="sm"
          className="w-full gap-2 text-muted-foreground hover:text-foreground justify-start"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="text-sm">Atalhos</span>
          <kbd className="text-[10px] opacity-50 bg-muted px-1.5 py-0.5 rounded ml-auto">F12</kbd>
        </Button>
      </div>
    </div>
  );
}
