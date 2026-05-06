import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  Banknote,
  Smartphone,
  AlertCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  orderId: string;
  onClose: () => void;
}

type Order = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  change_for: number | null;
  total: number;
  cancellation_reason: string | null;
  cashier_confirmed_at: string | null;
  customer_delivery_confirmed_at: string | null;
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro na entrega",
  dinheiro: "Dinheiro na entrega",
  credit: "Cartão de crédito na entrega",
  credito: "Cartão de crédito na entrega",
  debit: "Cartão de débito na entrega",
  debito: "Cartão de débito na entrega",
  pix: "PIX",
};

function isOffline(method: string) {
  return ["cash", "dinheiro", "credit", "credito", "debit", "debito"].includes(method);
}

function PaymentIcon({ method }: { method: string }) {
  if (method === "cash" || method === "dinheiro") return <Banknote className="h-5 w-5 text-primary" />;
  if (method === "pix") return <Smartphone className="h-5 w-5 text-primary" />;
  return <CreditCard className="h-5 w-5 text-primary" />;
}

export const OrderTrackingView = ({ orderId, onClose }: Props) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("delivery_orders")
        .select("id, order_number, status, payment_method, payment_status, change_for, total, cancellation_reason, cashier_confirmed_at")
        .eq("id", orderId)
        .maybeSingle();
      if (!cancelled && data) setOrder(data as Order);
      if (!cancelled) setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`order-tracking-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "delivery_orders", filter: `id=eq.${orderId}` },
        (payload) => {
          if (!cancelled) setOrder(payload.new as Order);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  if (loading || !order) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const offline = isOffline(order.payment_method);
  const paid = order.payment_status === "paid";
  const cancelled = order.status === "cancelled";

  // Etapas
  const steps: { key: string; label: string; reached: boolean; current: boolean }[] = [];
  const order_idx = ["pending", "confirmed", "preparing", "ready", "delivering", "completed"].indexOf(order.status);

  steps.push({ key: "received", label: "Pedido recebido", reached: order_idx >= 0, current: order_idx === 0 });
  steps.push({
    key: "preparing",
    label: "Em preparo",
    reached: order_idx >= 2,
    current: order_idx === 1 || order_idx === 2,
  });
  steps.push({
    key: "delivering",
    label: "Saiu para entrega",
    reached: order_idx >= 4,
    current: order_idx === 3 || order_idx === 4,
  });
  if (offline) {
    steps.push({
      key: "awaiting_payment",
      label: "Aguardando pagamento",
      reached: paid,
      current: order_idx === 4 && !paid,
    });
  }
  steps.push({
    key: "completed",
    label: offline ? "Entregue e pago" : "Entregue",
    reached: order_idx >= 5,
    current: order_idx === 5,
  });

  const change =
    (order.payment_method === "cash" || order.payment_method === "dinheiro") &&
    order.change_for &&
    Number(order.change_for) > Number(order.total)
      ? Number(order.change_for) - Number(order.total)
      : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Pedido #{order.order_number}</h2>
        <p className="text-sm text-muted-foreground">Acompanhe em tempo real</p>
      </div>

      {cancelled ? (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/40 bg-destructive/10">
          <XCircle className="h-5 w-5 text-destructive mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-destructive">Pedido cancelado</p>
            {order.cancellation_reason && (
              <p className="text-muted-foreground mt-1">Motivo: {order.cancellation_reason}</p>
            )}
            {offline && (
              <p className="text-xs text-muted-foreground mt-2">
                Nenhuma cobrança realizada — pagamento na entrega não gera cobrança prévia.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {steps.map((step, idx) => (
            <div key={step.key} className="flex items-start gap-3">
              {step.reached ? (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              ) : step.current ? (
                <Clock className="h-5 w-5 text-primary animate-pulse shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1">
                <p
                  className={cn(
                    "text-sm",
                    step.reached || step.current
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!cancelled && order.status === "delivering" && offline && !paid && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/40 bg-amber-500/10">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-300">
              Tenha o pagamento pronto para o entregador
            </p>
            {change !== null && (
              <p className="text-muted-foreground mt-1">
                Seu entregador levará troco para {formatBRL(Number(order.change_for))} (troco de{" "}
                {formatBRL(change)}).
              </p>
            )}
          </div>
        </div>
      )}

      <Separator />

      <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
        <PaymentIcon method={order.payment_method} />
        <div className="flex-1">
          <p className="font-medium text-sm">Forma de pagamento</p>
          <p className="text-sm text-muted-foreground">
            {PAYMENT_LABELS[order.payment_method] ?? order.payment_method}
          </p>
          {order.change_for && Number(order.change_for) > Number(order.total) && (
            <p className="text-xs text-muted-foreground mt-1">
              Levar troco para {formatBRL(Number(order.change_for))}
            </p>
          )}
          <p className="text-lg font-bold mt-2">{formatBRL(Number(order.total))}</p>
        </div>
      </div>

      <Button onClick={onClose} variant="outline" className="w-full">
        Fechar
      </Button>
    </div>
  );
};
