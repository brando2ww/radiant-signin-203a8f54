import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";
import { Banknote, CreditCard, QrCode, Ticket, Bike } from "lucide-react";
import { usePDVDeliveryCheckout } from "@/hooks/use-pdv-delivery-checkout";
import { usePDVCashier } from "@/hooks/use-pdv-cashier";
import type { DeliveryOrder } from "@/hooks/use-delivery-orders";
import type { PaymentMethod } from "@/hooks/use-pdv-payments";

interface Props {
  order: DeliveryOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const METHODS: { id: PaymentMethod; label: string; icon: any }[] = [
  { id: "dinheiro", label: "Dinheiro", icon: Banknote },
  { id: "credito", label: "Crédito", icon: CreditCard },
  { id: "debito", label: "Débito", icon: CreditCard },
  { id: "pix", label: "PIX", icon: QrCode },
  { id: "vale_refeicao", label: "VR / VA", icon: Ticket },
];

const QUICK = [50, 100, 150, 200];

export function DeliveryPaymentDialog({ order, open, onOpenChange }: Props) {
  const { registerDeliveryPayment, isRegistering } = usePDVDeliveryCheckout();
  const { drawerBalance } = usePDVCashier();
  const [method, setMethod] = useState<PaymentMethod>("dinheiro");
  const [received, setReceived] = useState("");

  useEffect(() => {
    if (open && order) {
      const m = order.payment_method;
      if (m === "cash" || m === "dinheiro") setMethod("dinheiro");
      else if (m === "pix") setMethod("pix");
      else if (m === "credit" || m === "credito") setMethod("credito");
      else if (m === "debit" || m === "debito") setMethod("debito");
      else setMethod("dinheiro");
      setReceived("");
    }
  }, [open, order]);

  if (!order) return null;

  // Fórmula canônica: subtotal + taxa - desconto.
  // Calculamos localmente para evitar usar `order.total` se estiver
  // desatualizado (ex.: gravado antes da taxa de entrega ser incluída).
  const computedTotal = Math.max(
    0,
    Number(order.subtotal || 0) +
      Number(order.delivery_fee || 0) -
      Number(order.discount || 0),
  );
  const storedTotal = Number(order.total) || 0;
  const total = computedTotal > 0 ? computedTotal : storedTotal;
  const isCash = method === "dinheiro";
  const cashReceived = isCash ? Number(received) || 0 : 0;
  const change = isCash ? Math.max(0, cashReceived - total) : 0;
  const insufficient = isCash && cashReceived > 0 && cashReceived < total;
  const changeExceedsDrawer = isCash && change > drawerBalance;

  const canConfirm =
    !isRegistering &&
    (!isCash || (cashReceived >= total && !changeExceedsDrawer));

  const handleConfirm = async () => {
    if (changeExceedsDrawer) {
      toast.error("Troco maior que o saldo da gaveta");
      return;
    }
    try {
      await registerDeliveryPayment({
        orderId: order.id,
        amount: total,
        paymentMethod: method,
        cashReceived: isCash ? cashReceived : undefined,
        changeAmount: isCash ? change : undefined,
        source: "delivery",
      });
      onOpenChange(false);
    } catch {
      /* toast shown */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Bike className="h-5 w-5" />
            Pagamento na entrega
          </DialogTitle>
          <DialogDescription>
            Pedido #{order.order_number} · {order.customer_name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-5 max-h-[70vh]">
          <div className="md:col-span-2 border-r bg-muted/30">
            <ScrollArea className="h-full max-h-[70vh]">
              <div className="p-4 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase">
                  Itens
                </div>
                <div className="space-y-1.5">
                  {(order.delivery_order_items ?? []).map((it) => (
                    <div key={it.id} className="flex justify-between text-sm gap-2">
                      <span className="truncate">
                        {it.quantity}× {it.product_name}
                      </span>
                      <span className="tabular-nums shrink-0">
                        {formatBRL(it.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatBRL(order.subtotal)}</span>
                  </div>
                  {Number(order.delivery_fee) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Taxa de entrega</span>
                      <span className="tabular-nums">{formatBRL(order.delivery_fee)}</span>
                    </div>
                  )}
                  {Number(order.discount) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Desconto</span>
                      <span className="tabular-nums">-{formatBRL(order.discount)}</span>
                    </div>
                  )}
                </div>
                <Separator />
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-medium">Total</span>
                  <span className="text-2xl font-bold tabular-nums">
                    {formatBRL(total)}
                  </span>
                </div>
              </div>
            </ScrollArea>
          </div>

          <div className="md:col-span-3 p-6 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">
                Forma recebida
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {METHODS.map((m) => {
                  const Icon = m.icon;
                  const active = method === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-md border p-3 text-xs transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {isCash ? (
              <Card className="p-4 space-y-3">
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">
                    Valor entregue pelo cliente
                  </Label>
                  <CurrencyInput
                    value={received}
                    onChange={setReceived}
                    className="mt-1.5 text-lg h-11"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {QUICK.map((v) => (
                    <Button
                      key={v}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setReceived(String(v))}
                    >
                      {formatBRL(v)}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setReceived(String(total))}
                  >
                    Valor exato
                  </Button>
                </div>

                <Separator />

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Troco</span>
                  <span
                    className={cn(
                      "tabular-nums font-bold text-lg",
                      changeExceedsDrawer && "text-destructive",
                    )}
                  >
                    {formatBRL(change)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Saldo na gaveta: {formatBRL(drawerBalance)}
                </div>
                {insufficient && (
                  <div className="text-xs text-destructive">
                    Valor recebido menor que o total.
                  </div>
                )}
                {changeExceedsDrawer && (
                  <div className="text-xs text-destructive">
                    Troco maior que o saldo disponível na gaveta.
                  </div>
                )}
              </Card>
            ) : (
              <Card className="p-4 text-sm text-muted-foreground">
                Confirmar recebimento de{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatBRL(total)}
                </span>{" "}
                via {METHODS.find((m) => m.id === method)?.label}.
              </Card>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {isRegistering ? "Registrando…" : "Confirmar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
