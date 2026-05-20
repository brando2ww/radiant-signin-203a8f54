import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryMetrics } from "@/hooks/use-delivery-reports";
import { MetricsComparison } from "@/hooks/use-delivery-metrics-comparison";
import {
  ShoppingBag,
  DollarSign,
  Truck,
  Home,
  Receipt,
  XCircle,
  Clock,
  ArrowUp,
  ArrowDown,
  
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DeliveryMetricsProps {
  metrics: DeliveryMetrics;
  comparison?: MetricsComparison;
}

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  delta: number | null | undefined;
  invert?: boolean;
  href: string;
}

function Delta({ delta, invert }: { delta: number | null | undefined; invert?: boolean }) {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) {
    return null;
  }
  const positive = delta >= 0;
  const isGood = invert ? !positive : positive;
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        isGood ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(delta).toFixed(1)}% vs período anterior
    </span>
  );
}

function KPICard({ title, value, subtitle, icon: Icon, delta, invert, href }: KPICardProps) {
  return (
    <a href={href} className="block">
      <Card className="transition-colors hover:bg-muted/40 cursor-pointer h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-2xl font-bold">{value}</div>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          <Delta delta={delta} invert={invert} />
        </CardContent>
      </Card>
    </a>
  );
}

export const DeliveryMetricsCards = ({ metrics, comparison }: DeliveryMetricsProps) => {
  const d = comparison?.deltas;
  return (
    <div id="kpis" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
      <KPICard
        title="Total de Pedidos"
        value={String(metrics.totalOrders)}
        subtitle={`${metrics.completedOrders} concluídos`}
        icon={ShoppingBag}
        delta={d?.totalOrders}
        href="#sales"
      />
      <KPICard
        title="Receita Total"
        value={formatBRL(metrics.totalRevenue)}
        subtitle={`Ticket médio: ${formatBRL(metrics.averageTicket)}`}
        icon={DollarSign}
        delta={d?.totalRevenue}
        href="#sales"
      />
      <KPICard
        title="Ticket Médio"
        value={formatBRL(metrics.averageTicket)}
        subtitle="Receita / pedidos não cancelados"
        icon={Receipt}
        delta={d?.averageTicket}
        href="#sales"
      />
      <KPICard
        title="Taxa de Cancelamento"
        value={`${metrics.cancellationRate.toFixed(1)}%`}
        subtitle={`${metrics.cancelledOrders} cancelado(s)`}
        icon={XCircle}
        delta={d?.cancellationRate}
        invert
        href="#orders-analysis"
      />
      <KPICard
        title="Tempo médio de entrega"
        value={`${Math.round(metrics.avgDeliveryTimeMin)} min`}
        subtitle="Do pedido à entrega"
        icon={Clock}
        delta={d?.avgDeliveryTimeMin}
        invert
        href="#peak-hours"
      />
      <KPICard
        title="Pedidos Delivery"
        value={String(metrics.deliveryOrders)}
        subtitle={`${metrics.totalOrders > 0 ? ((metrics.deliveryOrders / metrics.totalOrders) * 100).toFixed(1) : 0}% do total`}
        icon={Truck}
        delta={d?.deliveryOrders}
        href="#orders-analysis"
      />
      <KPICard
        title="Retiradas no Local"
        value={String(metrics.pickupOrders)}
        subtitle={`${metrics.totalOrders > 0 ? ((metrics.pickupOrders / metrics.totalOrders) * 100).toFixed(1) : 0}% do total`}
        icon={Home}
        delta={d?.pickupOrders}
        href="#orders-analysis"
      />
      <KPICard
        title="Concluídos"
        value={String(metrics.completedOrders)}
        subtitle={`${metrics.totalOrders > 0 ? ((metrics.completedOrders / metrics.totalOrders) * 100).toFixed(1) : 0}% do total`}
        icon={ShoppingBag}
        delta={null}
        href="#orders-analysis"
      />
    </div>
  );
};
