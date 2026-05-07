import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDeliveryOrders } from "@/hooks/use-delivery-orders";
import { OrdersKanban } from "./OrdersKanban";
import { DollarSign, Package, TrendingUp, Activity } from "lucide-react";
import { useDeliveryRealtimeOrders } from "@/hooks/use-delivery-notifications";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { NotificationsPanel } from "./NotificationsPanel";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { startOfDay } from "date-fns";

type OrderType = "delivery" | "pickup";

export const OrdersTab = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allOrders = [] } = useDeliveryOrders();
  const [orderType, setOrderType] = useState<OrderType>("delivery");

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useDeliveryRealtimeOrders(user?.id || "", () => {
    queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
  });

  const counts = useMemo(() => {
    const isActive = (s: string) => !["completed", "cancelled"].includes(s);
    return {
      delivery: allOrders.filter((o) => o.order_type === "delivery" && isActive(o.status)).length,
      pickup: allOrders.filter((o) => o.order_type === "pickup" && isActive(o.status)).length,
    };
  }, [allOrders]);

  const stats = useMemo(() => {
    const dayStart = startOfDay(new Date()).getTime();
    const today = allOrders.filter(
      (o) =>
        o.order_type === orderType &&
        new Date(o.created_at).getTime() >= dayStart &&
        o.status !== "cancelled",
    );
    const revenue = today.reduce((s, o) => s + Number(o.total), 0);
    const inProgress = allOrders.filter(
      (o) => o.order_type === orderType && !["completed", "cancelled"].includes(o.status),
    ).length;
    return {
      todayTotal: today.length,
      revenue,
      avgTicket: today.length ? revenue / today.length : 0,
      inProgress,
    };
  }, [allOrders, orderType]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pedidos</h2>
          <p className="text-sm text-muted-foreground">
            {orderType === "delivery"
              ? "Acompanhe pedidos de delivery em tempo real"
              : "Acompanhe pedidos de retirada em tempo real"}
          </p>
        </div>
        <NotificationsPanel
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onClearAll={clearAll}
        />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={Package} label="Pedidos Hoje" value={stats.todayTotal.toString()} />
        <StatCard icon={DollarSign} label="Receita Hoje" value={formatBRL(stats.revenue)} />
        <StatCard icon={TrendingUp} label="Ticket Médio" value={formatBRL(stats.avgTicket)} />
        <StatCard icon={Activity} label="Em andamento" value={stats.inProgress.toString()} />
      </div>

      {/* Toggle Delivery / Retirada */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setOrderType("delivery")}
          className={cn(
            "p-4 rounded-lg border-2 transition-all flex items-center justify-center gap-3 font-medium",
            orderType === "delivery"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-muted text-muted-foreground hover:bg-muted/70",
          )}
        >
          <span className="text-2xl">🛵</span>
          <span>Delivery</span>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-xs font-bold",
              orderType === "delivery" ? "bg-primary-foreground text-primary" : "bg-background",
            )}
          >
            {counts.delivery}
          </span>
        </button>
        <button
          onClick={() => setOrderType("pickup")}
          className={cn(
            "p-4 rounded-lg border-2 transition-all flex items-center justify-center gap-3 font-medium",
            orderType === "pickup"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-muted text-muted-foreground hover:bg-muted/70",
          )}
        >
          <span className="text-2xl">🏪</span>
          <span>Retirada</span>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-xs font-bold",
              orderType === "pickup" ? "bg-primary-foreground text-primary" : "bg-background",
            )}
          >
            {counts.pickup}
          </span>
        </button>
      </div>

      <OrdersKanban orderType={orderType} />
    </div>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);
