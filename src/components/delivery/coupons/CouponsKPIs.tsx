import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ticket, TrendingUp, PiggyBank, AlertTriangle } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { CouponsStats } from "@/hooks/use-coupons-stats";

export function CouponsKPIs({ stats }: { stats: CouponsStats }) {
  const items = [
    {
      label: "Cupons ativos",
      value: stats.activeCount.toString(),
      hint: "Em vigência",
      icon: Ticket,
    },
    {
      label: "Usos hoje",
      value: stats.usesToday.toString(),
      hint: "Pedidos com cupom hoje",
      icon: TrendingUp,
    },
    {
      label: "Economia (30d)",
      value: formatBRL(stats.totalSavings30d),
      hint: "Total descontado",
      icon: PiggyBank,
    },
    {
      label: "Vencendo em 7d",
      value: stats.expiringSoonCount.toString(),
      hint: "Atenção à validade",
      icon: AlertTriangle,
      alert: stats.expiringSoonCount > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{it.label}</div>
                <div className="text-2xl font-semibold mt-1 truncate">
                  {it.value}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {it.hint}
                </div>
              </div>
              {it.alert ? (
                <Badge variant="outline" className="border-orange-500/40 text-orange-600 dark:text-orange-400">
                  <Icon className="w-3 h-3 mr-1" />
                  Alerta
                </Badge>
              ) : (
                <Icon className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
