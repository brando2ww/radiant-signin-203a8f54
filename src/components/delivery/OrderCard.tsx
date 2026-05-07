import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone,
  MapPin,
  Clock,
  Package,
  Bike,
  ChevronRight,
  CreditCard,
  Banknote,
  QrCode,
  Wallet,
} from "lucide-react";
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
  pending: "Confirmar",
  confirmed: "Iniciar Preparo",
  preparing: "Marcar como Pronto",
  ready: "Saiu para Entrega",
  delivering: "Concluir Entrega",
};

const paymentInfo = (method: string): { label: string; icon: typeof CreditCard } => {
  const m = (method || "").toLowerCase();
  if (m.includes("dinheiro") || m === "cash") return { label: "Dinheiro", icon: Banknote };
  if (m.includes("pix")) return { label: "Pix", icon: QrCode };
  if (m.includes("credito") || m.includes("crédito")) return { label: "Crédito", icon: CreditCard };
  if (m.includes("debito") || m.includes("débito")) return { label: "Débito", icon: CreditCard };
  if (m.includes("card") || m.includes("cartao") || m.includes("cartão"))
    return { label: "Cartão", icon: CreditCard };
  return { label: method || "Pagamento", icon: Wallet };
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
  const pay = paymentInfo(order.payment_method);
  const PayIcon = pay.icon;
  const items = order.delivery_order_items || [];

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
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-lg leading-none">#{order.order_number}</p>
            <Badge variant="outline" className="text-xs shrink-0">
              {isPickup ? (
                <><Package className="h-3 w-3 mr-1" />Retirada</>
              ) : (
                <><MapPin className="h-3 w-3 mr-1" />Delivery</>
              )}
            </Badge>
          </div>

          {/* Cliente + tempo */}
          <div>
            <p className="font-semibold text-sm truncate">{order.customer_name}</p>
            <p className={cn("text-xs font-medium flex items-center gap-1 mt-0.5", timeColor)}>
              <Clock className="h-3 w-3" />
              {timeAgo}
            </p>
          </div>

          {/* Itens */}
          {items.length > 0 && (
            <div className="text-xs space-y-0.5 pt-2 border-t">
              {items.slice(0, 3).map((item) => (
                <div key={item.id} className="flex gap-1.5">
                  <span className="text-muted-foreground shrink-0">{item.quantity}x</span>
                  <span className="truncate">{item.product_name}</span>
                </div>
              ))}
              {items.length > 3 && (
                <p className="text-muted-foreground/70">+{items.length - 3} mais</p>
              )}
            </div>
          )}

          {/* Pagamento */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PayIcon className="h-3.5 w-3.5" />
            <span>{pay.label}</span>
          </div>

          {/* Endereço/Entregador ou Telefone */}
          {isPickup ? (
            <button
              onClick={handlePhone}
              className="w-full flex items-center gap-1.5 text-xs text-foreground hover:text-primary"
            >
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{order.customer_phone}</span>
            </button>
          ) : (
            <div className="space-y-1.5">
              {order.delivery_address_text && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="line-clamp-1">{order.delivery_address_text}</span>
                </div>
              )}
              <div className="text-xs">
                {driver ? (
                  <div className="flex items-center gap-1.5 text-foreground">
                    <Bike className="h-3.5 w-3.5" />
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
            </div>
          )}

          {/* Total */}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="font-bold text-lg">{formatBRL(Number(order.total))}</span>
          </div>

          {/* Ações */}
          <div className="space-y-1.5">
            {nextStatus && (
              <Button
                size="sm"
                className="w-full"
                onClick={handleAdvance}
                disabled={updateStatus.isPending}
              >
                {nextStatusLabel[order.status]}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="w-full h-8 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setIsDetailOpen(true);
              }}
            >
              Ver detalhes
            </Button>
          </div>
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
