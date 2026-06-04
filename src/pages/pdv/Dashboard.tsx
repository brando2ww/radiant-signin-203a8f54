import { usePDVDashboard } from "@/hooks/use-pdv-dashboard";
import { DashboardMetricCard } from "@/components/pdv/DashboardMetricCard";
import { SalesChart } from "@/components/pdv/SalesChart";
import { TopProductsList } from "@/components/pdv/TopProductsList";
import { OperationHealthWidget } from "@/components/pdv/checklists/OperationHealthWidget";
import { MonthlyGoalCard } from "@/components/pdv/dashboard/MonthlyGoalCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatBRL } from "@/lib/format";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Calendar,
  Lock,
  Unlock,
} from "lucide-react";

export default function PDVDashboard() {
  const { metrics, topProducts, salesByHour, isLoading } = usePDVDashboard();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard PDV</h1>
        <p className="text-muted-foreground">
          Visão geral do seu ponto de venda
        </p>
      </div>

      {metrics && !metrics.cashierOpen && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            O caixa está fechado. Algumas informações podem estar limitadas.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardMetricCard
          title="Vendas Hoje"
          value={`${formatBRL(metrics?.todaySales || 0)}`}
          subtitle={`${metrics?.todayOrders || 0} pedidos finalizados`}
          icon={DollarSign}
          isLoading={isLoading}
        />

        <DashboardMetricCard
          title="Pedidos Ativos"
          value={metrics?.activeOrders || 0}
          subtitle="Mesas e balcão"
          icon={ShoppingCart}
          isLoading={isLoading}
        />

        <DashboardMetricCard
          title="Ticket Médio"
          value={`${formatBRL(metrics?.averageTicket || 0)}`}
          subtitle="Por pedido hoje"
          icon={TrendingUp}
          isLoading={isLoading}
        />

        <DashboardMetricCard
          title={metrics?.cashierOpen ? "Saldo Caixa" : "Caixa Fechado"}
          value={
            metrics?.cashierOpen
              ? `${formatBRL(metrics?.cashierBalance || 0)}`
              : "-"
          }
          subtitle={metrics?.cashierOpen ? "Dinheiro em caixa" : "Abra o caixa"}
          icon={metrics?.cashierOpen ? Unlock : Lock}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DashboardMetricCard
          title="Vendas do Mês"
          value={`${formatBRL(metrics?.monthSales || 0)}`}
          subtitle={`${metrics?.monthOrders || 0} pedidos no mês`}
          icon={Calendar}
          isLoading={isLoading}
        />

        <MonthlyGoalCard monthSales={metrics?.monthSales || 0} isLoadingSales={isLoading} />
      </div>

      <OperationHealthWidget />

      <div className="grid gap-4 md:grid-cols-2">
        <SalesChart data={salesByHour} isLoading={isLoading} />
        <TopProductsList products={topProducts} isLoading={isLoading} />
      </div>
    </div>
  );
}
