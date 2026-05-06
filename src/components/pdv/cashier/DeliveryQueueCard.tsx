import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bike, CreditCard, Smartphone, Banknote, Package, Printer, ChevronRight } from "lucide-react";
import type { DeliveryOrder } from "@/hooks/use-delivery-orders";

interface Props {
  order: DeliveryOrder;
  onRegisterPayment: (order: DeliveryOrder) => void;
  onConfirmOnline: (order: DeliveryOrder) => void;
  onAdvanceStatus?: (order: DeliveryOrder) => void;
  onPrintMotoboy?: (order: DeliveryOrder) => void;
}

const NEXT_STATUS_LABEL: Partial<Record<DeliveryOrder["status"], string>> = {
  pending: "Iniciar preparo",
  confirmed: "Iniciar preparo",
  preparing: "Marcar pronto",
  ready: "Saiu p/ entrega",
  delivering: "Marcar entregue",
};

const STATUS_LABEL: Record<DeliveryOrder["status"], string> = {
  pending: "Aguardando",
  confirmed: "Confirmado",
  preparing: "Em preparo",
  ready: "Pronto",
  delivering: "Saiu para entrega",
  completed: "Entregue",
  cancelled: "Cancelado",
};

function methodLabel(m: string) {
  const map: Record<string, string> = {
    cash: "Dinheiro",
    dinheiro: "Dinheiro",
    pix: "PIX",
    credit: "Cartão crédito",
    credito: "Cartão crédito",
    debit: "Cartão débito",
    debito: "Cartão débito",
  };
  return map[m] ?? m;
}

function methodIcon(m: string) {
  if (m.includes("cash") || m.includes("dinheiro")) return Banknote;
  if (m.includes("pix")) return Smartphone;
  return CreditCard;
}

export function DeliveryQueueCard({ order, onRegisterPayment, onConfirmOnline }: Props) {
  const isOnlinePaid = order.payment_status === "paid";
  const items = order.delivery_order_items ?? [];
  const visible = items.slice(0, 3);
  const more = items.length - visible.length;

  const actionable =
    ["delivering", "completed", "ready"].includes(order.status);
  const Icon = methodIcon(order.payment_method);

  return (
    <Card className="p-3 border-l-4 border-l-primary/60">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bike className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-semibold text-sm truncate">
              #{order.order_number}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              · {order.customer_name}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {formatDistanceToNow(new Date(order.created_at), {
              addSuffix: true,
              locale: ptBR,
            })}
          </div>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {STATUS_LABEL[order.status]}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
        {visible.map((it) => (
          <div key={it.id} className="truncate">
            {it.quantity}× {it.product_name}
          </div>
        ))}
        {more > 0 && <div>e mais {more}…</div>}
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Icon className="h-3 w-3" />
          {isOnlinePaid ? "Pago online" : "Pagar na entrega"} ·{" "}
          {methodLabel(order.payment_method)}
        </div>
        <div className="font-bold tabular-nums text-sm">
          {formatBRL(order.total)}
        </div>
      </div>

      {actionable ? (
        isOnlinePaid ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs"
            onClick={() => onConfirmOnline(order)}
          >
            Confirmar recebimento
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => onRegisterPayment(order)}
          >
            Registrar pagamento
          </Button>
        )
      ) : (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground justify-center py-1">
          <Package className="h-3 w-3" /> Aguardando finalização do pedido
        </div>
      )}
    </Card>
  );
}
