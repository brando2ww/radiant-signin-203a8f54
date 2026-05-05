import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";
import { usePDVDeliveryCheckout } from "@/hooks/use-pdv-delivery-checkout";
import { usePDVCashier } from "@/hooks/use-pdv-cashier";
import type { DeliveryOrder } from "@/hooks/use-delivery-orders";
import type { PaymentMethod } from "@/hooks/use-pdv-payments";

interface Props {
  order: DeliveryOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeliveryPaymentDialog({ order, open, onOpenChange }: Props) {
  const { registerDeliveryPayment, isRegistering } = usePDVDeliveryCheckout();
  const { drawerBalance } = usePDVCashier();
  const [method, setMethod] = useState<PaymentMethod>("dinheiro");
  const [received, setReceived] = useState("");

  useEffect(() => {
    if (open && order) {
      // sugere método pelo combinado no pedido
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

  const total = Number(order.total) || 0;
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
      /* toast já exibido */
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Pagamento na entrega</SheetTitle>
          <SheetDescription>
            Pedido #{order.order_number} · {order.customer_name}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          <div className="rounded-lg border p-3 space-y-1">
            {(order.delivery_order_items ?? []).map((it) => (
              <div key={it.id} className="flex justify-between text-sm">
                <span className="truncate">
                  {it.quantity}× {it.product_name}
                </span>
                <span className="tabular-nums">{formatBRL(it.subtotal)}</span>
              </div>
            ))}
            {Number(order.delivery_fee) > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground pt-1 border-t">
                <span>Taxa de entrega</span>
                <span className="tabular-nums">
                  {formatBRL(order.delivery_fee)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-1 border-t">
              <span>Total</span>
              <span className="tabular-nums">{formatBRL(total)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Forma recebida</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="credito">Cartão crédito</SelectItem>
                <SelectItem value="debito">Cartão débito</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="vale_refeicao">Vale refeição</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCash && (
            <div className="space-y-2">
              <Label>Valor entregue pelo cliente</Label>
              <CurrencyInput value={received} onChange={setReceived} />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Troco</span>
                <span className="tabular-nums font-semibold">
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
            </div>
          )}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {isRegistering ? "Registrando…" : "Confirmar pagamento"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
