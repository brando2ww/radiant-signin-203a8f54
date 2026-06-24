import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { useDeliveryOrders } from "@/hooks/use-delivery-orders";
import { OrdersKanban } from "./OrdersKanban";
import { DollarSign, Package, TrendingUp, Activity } from "lucide-react";
import { useDeliveryRealtimeOrders } from "@/hooks/use-delivery-notifications";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { NotificationsPanel } from "./NotificationsPanel";
import { formatBRL } from "@/lib/format";
import { startOfDay } from "date-fns";

type OrderType = "delivery" | "pickup" | "completed" | "scheduled";

export const OrdersTab = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allOrders = [] } = useDeliveryOrders();
  const [orderType, setOrderType] = useState<OrderType>("delivery");
  const scheduledNotifiedRef = useRef(false);

  // Notificar pedidos agendados para hoje ao abrir a tela
  useEffect(() => {
    if (scheduledNotifiedRef.current || allOrders.length === 0) return;
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const todayScheduled = allOrders.filter(
      (o) => o.scheduled_for && o.status === "pending" && new Date(o.scheduled_for) > now && new Date(o.scheduled_for) <= todayEnd
    );
    if (todayScheduled.length > 0) {
      scheduledNotifiedRef.current = true;
      toast(`${todayScheduled.length} pedido${todayScheduled.length > 1 ? "s" : ""} agendado${todayScheduled.length > 1 ? "s" : ""} para hoje — verifique a aba Agendados`, {
        duration: 8000,
      });
    }
  }, [allOrders]);

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
    const now = new Date();
    const isActive = (s: string) => !["completed", "cancelled"].includes(s);
    const isScheduledFuture = (o: any) =>
      o.scheduled_for && o.status === "pending" && new Date(o.scheduled_for) > now;
    return {
      delivery: allOrders.filter((o) => o.order_type === "delivery" && isActive(o.status) && !isScheduledFuture(o)).length,
      pickup: allOrders.filter((o) => o.order_type === "pickup" && isActive(o.status) && !isScheduledFuture(o)).length,
      completed: allOrders.filter((o) => o.status === "completed").length,
      scheduled: allOrders.filter(isScheduledFuture).length,
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

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={Package} label="Pedidos Hoje" value={stats.todayTotal.toString()} />
        <StatCard icon={DollarSign} label="Receita Hoje" value={formatBRL(stats.revenue)} />
        <StatCard icon={TrendingUp} label="Ticket Médio" value={formatBRL(stats.avgTicket)} />
        <StatCard icon={Activity} label="Em andamento" value={stats.inProgress.toString()} />
      </div>

      <OrdersKanban
        orderType={orderType}
        onOrderTypeChange={setOrderType}
        counts={counts}
      />
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
