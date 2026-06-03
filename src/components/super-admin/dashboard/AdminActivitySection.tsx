import { DollarSign, Truck, Star, ClipboardCheck, Ticket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRLCompact } from "@/lib/format";
import type { AdminDashboardData } from "@/hooks/use-admin-dashboard";

interface Props {
  data?: AdminDashboardData["activity"];
  isLoading: boolean;
}

export function AdminActivitySection({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-7 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const items = [
    { label: "Vendas no período", value: formatBRLCompact(data.sales), icon: DollarSign },
    { label: "Pedidos de delivery", value: data.delivery_orders.toLocaleString("pt-BR"), icon: Truck },
    { label: "Avaliações recebidas", value: data.evaluations.toLocaleString("pt-BR"), icon: Star },
    { label: "Checklists executados", value: data.checklists.toLocaleString("pt-BR"), icon: ClipboardCheck },
    { label: "Cupons emitidos", value: data.coupons.toLocaleString("pt-BR"), icon: Ticket },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {it.label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums">{it.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
