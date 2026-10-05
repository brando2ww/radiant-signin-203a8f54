import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PEDIDO_STATUS_LABEL, type PedidoStatus } from "@/lib/vendas/types";

const ESTILO: Record<PedidoStatus, string> = {
  confirmed: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900",
  invoiced: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-900",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900",
  cancelled: "bg-zinc-100 text-zinc-500 border-zinc-200 line-through dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
};

export function PedidoStatusBadge({ status, className }: { status: PedidoStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", ESTILO[status], className)}>
      {PEDIDO_STATUS_LABEL[status]}
    </Badge>
  );
}
