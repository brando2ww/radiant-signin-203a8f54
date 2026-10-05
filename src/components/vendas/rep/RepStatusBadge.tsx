import { cn } from "@/lib/utils";
import {
  PEDIDO_STATUS_LABEL,
  PROPOSTA_STATUS_LABEL,
  type PedidoStatus,
  type PropostaStatus,
} from "@/lib/vendas/types";

const PROPOSTA_COR: Record<PropostaStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  converted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  expired: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  cancelled: "bg-muted text-muted-foreground line-through",
};

const PEDIDO_COR: Record<PedidoStatus, string> = {
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  invoiced: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-muted text-muted-foreground line-through",
};

const base = "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium";

export function PropostaStatusBadge({ status, className }: { status: PropostaStatus; className?: string }) {
  return <span className={cn(base, PROPOSTA_COR[status], className)}>{PROPOSTA_STATUS_LABEL[status] ?? status}</span>;
}

export function PedidoStatusBadge({ status, className }: { status: PedidoStatus; className?: string }) {
  return <span className={cn(base, PEDIDO_COR[status], className)}>{PEDIDO_STATUS_LABEL[status] ?? status}</span>;
}
