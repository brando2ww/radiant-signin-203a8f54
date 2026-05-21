import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DeliveryOrder,
  useUpdateOrderStatus,
  useCancelOrder,
  useReprintOrder,
} from "@/hooks/use-delivery-orders";
import {
  Phone,
  MapPin,
  Clock,
  Package,
  CreditCard,
  MessageCircle,
  XCircle,
  CheckCircle,
  ChevronRight,
  Printer,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL } from "@/lib/format";
import { CancelOrderDialog } from "@/components/pdv/cashier/CancelOrderDialog";
import { getCancelCategoryLabel } from "@/lib/cancel-reasons";

interface OrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: DeliveryOrder;
}

const statusFlow = {
  pending: "preparing",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivering",
  delivering: "completed",
};

const statusLabels = {
  pending: "Confirmar e Iniciar Preparo",
  confirmed: "Iniciar Preparo",
  preparing: "Marcar como Pronto",
  ready: "Saiu para Entrega",
  delivering: "Concluir Entrega",
};

export const OrderDetailDialog = ({
  open,
  onOpenChange,
  order,
}: OrderDetailDialogProps) => {
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const updateStatus = useUpdateOrderStatus();
  const cancelOrder = useCancelOrder();
  const reprintOrder = useReprintOrder();

  const canReprint = !["pending", "cancelled"].includes(order.status);

  const handleNextStatus = () => {
    const nextStatus = statusFlow[order.status as keyof typeof statusFlow];
    if (nextStatus) {
      updateStatus.mutate({ id: order.id, status: nextStatus as any });
    }
  };

  const handleWhatsApp = () => {
    const phone = order.customer_phone.replace(/\D/g, "");
    const message = `Olá ${order.customer_name}! Sobre seu pedido ${order.order_number}...`;
    window.open(
      `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
  };

  const canAdvanceStatus =
    order.status !== "completed" && order.status !== "cancelled";
  const canCancel =
    order.status !== "completed" && order.status !== "cancelled";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Pedido {order.order_number}</span>
              <OrderStatusBadge status={order.status} />
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Customer Info */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Package className="h-4 w-4" />
                Informações do Cliente
              </h3>
              <div className="space-y-1 text-sm">
                <p>
                  <strong>Nome:</strong> {order.customer_name}
                </p>
                <div className="flex items-center gap-2">
                  <strong>Telefone:</strong> {order.customer_phone}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6"
                    onClick={handleWhatsApp}
                  >
                    <MessageCircle className="h-3 w-3 mr-1" />
                    WhatsApp
                  </Button>
                </div>
                <p>
                  <strong>Tipo:</strong>{" "}
                  <Badge variant={order.order_type === "delivery" ? "default" : "secondary"}>
                    {order.order_type === "delivery" ? "Delivery" : "Retirada"}
                  </Badge>
                </p>
                {order.delivery_address_text && (
                  <div>
                    <strong>Endereço:</strong>
                    <p className="text-muted-foreground">
                      {order.delivery_address_text}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Items */}
            <div className="space-y-2">
              <h3 className="font-semibold">Itens do Pedido</h3>
              <div className="space-y-2">
                {order.delivery_order_items?.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between text-sm p-2 rounded bg-muted/50"
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {item.quantity}x {item.product_name}
                      </p>
                      {item.delivery_order_item_options &&
                        item.delivery_order_item_options.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            {item.delivery_order_item_options.map((opt) => (
                              <div key={opt.id}>
                                • {opt.option_name}: {opt.item_name}
                                {opt.price_adjustment !== 0 && (
                                  <span>
                                    {" "}
                                    ({opt.price_adjustment > 0 ? "+" : ""}{formatBRL(Number(opt.price_adjustment))})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Obs: {item.notes}
                        </p>
                      )}
                    </div>
                    <p className="font-semibold">
                      {formatBRL(Number(item.subtotal))}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Payment & Total */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Pagamento
              </h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatBRL(Number(order.subtotal))}</span>
                </div>
                {order.delivery_fee > 0 && (
                  <div className="flex justify-between">
                    <span>Taxa de entrega:</span>
                    <span>{formatBRL(Number(order.delivery_fee))}</span>
                  </div>
                )}
                {order.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>
                      Desconto {order.coupon_code && `(${order.coupon_code})`}:
                    </span>
                    <span>-{formatBRL(Number(order.discount))}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Total:</span>
                  <span>{formatBRL(Number(order.total))}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Forma de pagamento:</span>
                  <span className="capitalize">{order.payment_method}</span>
                </div>
                {order.change_for && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Troco para:</span>
                    <span>{formatBRL(Number(order.change_for))}</span>
                  </div>
                )}
              </div>
            </div>

            {order.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-semibold">Observações</h3>
                  <p className="text-sm text-muted-foreground">{order.notes}</p>
                </div>
              </>
            )}

            <Separator />

            {/* Timeline */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Histórico
              </h3>
              <div className="space-y-1 text-sm">
                <p>
                  Criado:{" "}
                  {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", {
                    locale: ptBR,
                  })}
                </p>
                {order.confirmed_at && (
                  <p>
                    Confirmado:{" "}
                    {format(new Date(order.confirmed_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                )}
                {order.ready_at && (
                  <p>
                    Pronto:{" "}
                    {format(new Date(order.ready_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                )}
                {order.delivered_at && (
                  <p>
                    Entregue:{" "}
                    {format(new Date(order.delivered_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                )}
                {order.cancelled_at && (
                  <div className="text-destructive">
                    <p>
                      Cancelado:{" "}
                      {format(new Date(order.cancelled_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                    {order.cancellation_reason && (
                      <p className="text-xs">Motivo: {order.cancellation_reason}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {(canAdvanceStatus || canReprint) && (
              <div className="flex flex-wrap gap-2 pt-4">
                {canAdvanceStatus && (
                  <Button
                    className="flex-1"
                    onClick={handleNextStatus}
                    disabled={updateStatus.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {statusLabels[order.status as keyof typeof statusLabels]}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
                {canReprint && (
                  <Button
                    variant="outline"
                    onClick={() => reprintOrder.mutate({ orderId: order.id })}
                    disabled={reprintOrder.isPending}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Reimprimir
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="destructive"
                    onClick={() => setIsCancelDialogOpen(true)}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CancelOrderDialog
        open={isCancelDialogOpen}
        onOpenChange={setIsCancelDialogOpen}
        resourceLabel="Pedido"
        isLoading={cancelOrder.isPending}
        summary={{
          reference: `Pedido #${order.order_number}`,
          title: order.customer_name,
          itemsCount: order.delivery_order_items?.reduce(
            (s, i) => s + (i.quantity || 0),
            0,
          ),
          total: Number(order.total),
        }}
        onConfirm={async ({ reason, category, customerNotified }) => {
          await cancelOrder.mutateAsync({
            id: order.id,
            reason,
            category,
            customerNotified,
          });
          setIsCancelDialogOpen(false);
          setTimeout(() => onOpenChange(false), 0);
        }}
      />
    </>
  );
};
