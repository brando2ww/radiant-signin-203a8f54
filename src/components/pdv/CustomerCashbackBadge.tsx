import { Badge } from "@/components/ui/badge";
import { Gift } from "lucide-react";
import { formatBRL } from "@/lib/format";

export function CustomerCashbackBadge({ balance }: { balance: number }) {
  if (!(balance > 0)) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        <Gift className="h-3 w-3" />
        Cashback ativo:
      </Badge>
      <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
        {formatBRL(balance)}
      </span>
    </div>
  );
}
