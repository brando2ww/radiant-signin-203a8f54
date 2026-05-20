import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bike, CreditCard, Smartphone, Banknote, Package, Printer, ChevronRight, X, Store } from "lucide-react";
import type { DeliveryOrder } from "@/hooks/use-delivery-orders";
import {
  initialsFromName,
  useAssignDriver,
  useDeliveryDrivers,
} from "@/hooks/use-delivery-drivers";

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

export function DeliveryQueueCard({ order, onRegisterPayment, onConfirmOnline, onAdvanceStatus, onPrintMotoboy }: Props) {
  const isOnlinePaid = order.payment_status === "paid";
  const items = order.delivery_order_items ?? [];
  const visible = items.slice(0, 3);
  const more = items.length - visible.length;
  const { drivers } = useDeliveryDrivers();
  const { assignDriver, unassignDriver, isAssigning } = useAssignDriver();

  const assignedDriver = order.driver_id
    ? drivers.find((d) => d.id === order.driver_id) || null
    : null;
  const availableDrivers = drivers.filter((d) => d.is_active);

  const isOfflinePayment = ["cash", "dinheiro", "credit", "credito", "debit", "debito"].includes(
    order.payment_method,
  );
  // Pagar na entrega aguardando pagamento → bloqueia "Marcar entregue", mostra Registrar pagamento
  const awaitingOfflinePayment =
    isOfflinePayment && !isOnlinePaid && order.status === "delivering";

  const actionable =
    ["delivering", "completed", "ready"].includes(order.status);
  const Icon = methodIcon(order.payment_method);
  // Em "delivering" sem pagamento, esconde "Marcar entregue" — o pagamento abre o fluxo de conclusão
  const nextLabel = awaitingOfflinePayment ? undefined : NEXT_STATUS_LABEL[order.status];

  // Aviso para auto-confirmação manual + pagar na entrega
  const pendingOfflineConfirmation =
    isOfflinePayment && !isOnlinePaid && (order.status === "pending" || order.status === "confirmed");

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
        <Badge
          variant="secondary"
          className={
            awaitingOfflinePayment
              ? "text-[10px] bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30"
              : "text-[10px]"
          }
        >
          {awaitingOfflinePayment ? "Aguardando pagamento" : STATUS_LABEL[order.status]}
        </Badge>
      </div>

      {(order as any).customer_delivery_confirmed_at && order.status === "delivering" && (
        <div className="mb-2">
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
            ✓ Cliente confirmou recebimento
          </Badge>
        </div>
      )}

      {order.status === "delivering" && drivers.length > 0 && (
        <div className="mb-2">
          {assignedDriver ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5">
              <Avatar className="h-6 w-6">
                {assignedDriver.avatar_url && (
                  <AvatarImage src={assignedDriver.avatar_url} alt={assignedDriver.name} />
                )}
                <AvatarFallback
                  className="text-[10px]"
                  style={{ background: assignedDriver.avatar_color || undefined }}
                >
                  {initialsFromName(assignedDriver.name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs flex-1 truncate">🛵 {assignedDriver.name}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                disabled={isAssigning}
                onClick={() =>
                  unassignDriver({ orderId: order.id, driverId: assignedDriver.id })
                }
                title="Desatribuir"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : availableDrivers.length > 0 ? (
            <Select
              disabled={isAssigning}
              onValueChange={(v) => assignDriver({ orderId: order.id, driverId: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Atribuir entregador (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {availableDrivers.map((d) => (
                  <SelectItem key={d.id} value={d.id} className="text-xs">
                    🛵 {d.name}
                    {d.active_count > 0 ? ` · ${d.active_count} em rota` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-[10px] text-muted-foreground italic">
              Nenhum entregador disponível
            </div>
          )}
        </div>
      )}

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

      {pendingOfflineConfirmation && (
        <div className="mb-2 px-2 py-1 rounded text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
          ⚠ Aguardando confirmação · Pagar na entrega
        </div>
      )}

      <div className="space-y-2">
        {(nextLabel || onPrintMotoboy) && (
          <div className="flex gap-2">
            {nextLabel && onAdvanceStatus && (
              <Button
                size="sm"
                variant="secondary"
                className="flex-1 h-8 text-xs gap-1"
                onClick={() => onAdvanceStatus(order)}
              >
                <ChevronRight className="h-3 w-3" />
                {nextLabel}
              </Button>
            )}
            {onPrintMotoboy && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1 px-2"
                onClick={() => onPrintMotoboy(order)}
                title="Imprimir comanda do motoboy"
              >
                <Printer className="h-3.5 w-3.5" />
                Motoboy
              </Button>
            )}
          </div>
        )}

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
        ) : !nextLabel && !onPrintMotoboy ? (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground justify-center py-1">
            <Package className="h-3 w-3" /> Aguardando finalização do pedido
          </div>
        ) : null}
      </div>
    </Card>
  );
}
