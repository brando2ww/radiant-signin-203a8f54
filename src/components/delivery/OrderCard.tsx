import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, MapPin, Clock, Package, Bike, ChevronRight } from "lucide-react";
import { DeliveryOrder, useUpdateOrderStatus } from "@/hooks/use-delivery-orders";
import { useDeliveryDrivers } from "@/hooks/use-delivery-drivers";
import { useEffect, useState } from "react";
import { OrderDetailDialog } from "./OrderDetailDialog";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { AssignDriverPopover } from "./AssignDriverPopover";
import { cn } from "@/lib/utils";

interface OrderCardProps {
  order: DeliveryOrder;
}

const statusFlow: Record<string, DeliveryOrder["status"]> = {
  pending: "preparing",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivering",
  delivering: "completed",
};

const nextStatusLabel: Record<string, string> = {
  pending: "Iniciar Preparo",
  confirmed: "Iniciar Preparo",
  preparing: "Marcar Pronto",
  ready: "Saiu p/ Entrega",
  delivering: "Concluir",
};

export const OrderCard = ({ order }: OrderCardProps) => {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [, setTick] = useState(0);
  const updateStatus = useUpdateOrderStatus();
  const { drivers } = useDeliveryDrivers();

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const minutesAgo = (Date.now() - new Date(order.created_at).getTime()) / 60000;
  const timeColor =
    minutesAgo < 15 ? "text-green-600" : minutesAgo < 30 ? "text-yellow-600" : "text-red-600";

  const urgentRing =
    order.status === "pending" && minutesAgo > 5
      ? "ring-2 ring-destructive animate-pulse"
      : order.status === "ready" && minutesAgo > 10
      ? "ring-2 ring-yellow-500"
      : "";

  const timeAgo = formatDistanceToNow(new Date(order.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  const isPickup = order.order_type === "pickup";
  const driver = order.driver_id ? drivers.find((d) => d.id === order.driver_id) : null;
  const nextStatus = statusFlow[order.status];

  const handleAdvance = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nextStatus) updateStatus.mutate({ id: order.id, status: nextStatus });
  };

  const handlePhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`tel:${order.customer_phone}`, "_blank");
  };

  return (
    <>
      <Card
        className={cn("cursor-pointer hover:shadow-md transition-shadow", urgentRing)}
        onClick={() => setIsDetailOpen(true)}
      >
        <CardContent className="p-3 space-y-2">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-base leading-tight">#{order.order_number}</p>
              <p className={cn("text-xs font-medium flex items-center gap-1", timeColor)}>
                <Clock className="h-3 w-3" />
                {timeAgo}
              </p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">
              {isPickup ? (
                <><Package className="h-3 w-3 mr-1" />🏪 Retirada</>
              ) : (
                <><MapPin className="h-3 w-3 mr-1" />🛵 Delivery</>
              )}
            </Badge>
          </div>

          {/* Customer */}
          <div>
            <p className="font-medium text-sm truncate">{order.customer_name}</p>
            {isPickup && (
              <button
                onClick={handlePhone}
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <Phone className="h-3 w-3" /> {order.customer_phone}
              </button>
            )}
          </div>

          {/* Items */}
          {order.delivery_order_items && (
            <div className="text-xs text-muted-foreground">
              <p className="font-medium">{order.delivery_order_items.length} item(s)</p>
              <div className="mt-0.5 space-y-0.5">
                {order.delivery_order_items.slice(0, 2).map((item) => (
                  <div key={item.id} className="truncate">
                    {item.quantity}x {item.product_name}
                  </div>
                ))}
                {order.delivery_order_items.length > 2 && (
                  <div>+{order.delivery_order_items.length - 2} mais</div>
                )}
              </div>
            </div>
          )}

          {/* Driver row (delivery only) */}
          {!isPickup && (
            <div className="text-xs">
              {driver ? (
                <div className="flex items-center gap-1 text-foreground">
                  <Bike className="h-3 w-3" />
                  <span className="truncate font-medium">{driver.name}</span>
                </div>
              ) : (
                ["ready", "delivering"].includes(order.status) && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <AssignDriverPopover orderId={order.id} />
                  </div>
                )
              )}
            </div>
          )}

          {/* Total + actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="font-bold">{formatBRL(Number(order.total))}</p>
          </div>

          {nextStatus && (
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={handleAdvance}
              disabled={updateStatus.isPending}
            >
              {nextStatusLabel[order.status]}
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </CardContent>
      </Card>

      <OrderDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        order={order}
      />
    </>
  );
};
