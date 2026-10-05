import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PROPOSTA_STATUS_LABEL, type PropostaStatus } from "@/lib/vendas/types";

const ESTILO: Record<PropostaStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
  sent: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900",
  rejected: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-900",
  expired: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900",
  cancelled: "bg-zinc-100 text-zinc-500 border-zinc-200 line-through dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
};

export function PropostaStatusBadge({ status, className }: { status: PropostaStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", ESTILO[status], className)}>
      {PROPOSTA_STATUS_LABEL[status]}
    </Badge>
  );
}
