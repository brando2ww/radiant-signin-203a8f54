import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { situacaoCobranca } from "@/hooks/use-vendas-financeiro";

const TOM: Record<ReturnType<typeof situacaoCobranca>["tom"], string> = {
  neutro: "border-transparent bg-muted text-muted-foreground",
  aguardando: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-300",
  pago: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  alerta: "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300",
  cancelado: "border-transparent bg-muted text-muted-foreground line-through",
};

/** Situação da cobrança no Asaas, em português. */
export function SituacaoCobrancaBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const s = situacaoCobranca(status);
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", TOM[s.tom], className)}>
      {s.label}
    </Badge>
  );
}
