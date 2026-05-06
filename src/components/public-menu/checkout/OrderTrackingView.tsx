import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Banknote,
  Smartphone,
  AlertCircle,
  XCircle,
  Loader2,
  ChefHat,
  Bike,
  ClipboardList,
  PackageCheck,
  HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  orderId: string;
  onClose: () => void;
  userId?: string;
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
  created_at: string;
  confirmed_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
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

const STATUS_HERO: Record<
  string,
  { title: string; subtitle: string; Icon: typeof Clock }
> = {
  pending: {
    title: "Pedido recebido",
    subtitle: "Aguardando confirmação do restaurante",
    Icon: ClipboardList,
  },
  confirmed: {
    title: "Pedido confirmado",
    subtitle: "O restaurante já recebeu e vai começar a preparar",
    Icon: CheckCircle2,
  },
  preparing: {
    title: "Em preparo",
    subtitle: "Seu pedido está sendo preparado pela cozinha",
    Icon: ChefHat,
  },
  ready: {
    title: "Pronto para entrega",
    subtitle: "Aguardando o entregador retirar",
    Icon: PackageCheck,
  },
  delivering: {
    title: "Saiu para entrega",
    subtitle: "Já está a caminho do seu endereço",
    Icon: Bike,
  },
  completed: {
    title: "Pedido concluído",
    subtitle: "Obrigado! Esperamos te ver de novo em breve",
    Icon: CheckCircle2,
  },
  cancelled: {
    title: "Pedido cancelado",
    subtitle: "Este pedido foi cancelado",
    Icon: XCircle,
  },
};

function isOffline(method: string) {
  return ["cash", "dinheiro", "credit", "credito", "debit", "debito"].includes(method);
}

function PaymentIcon({ method }: { method: string }) {
  if (method === "cash" || method === "dinheiro") return <Banknote className="h-5 w-5 text-foreground" />;
  if (method === "pix") return <Smartphone className="h-5 w-5 text-foreground" />;
  return <CreditCard className="h-5 w-5 text-foreground" />;
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return format(new Date(iso), "HH:mm", { locale: ptBR });
  } catch {
    return null;
  }
}

export const OrderTrackingView = ({ orderId, onClose, userId }: Props) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const prevReachedRef = useRef<Set<string>>(new Set());
  const justReachedRef = useRef<Set<string>>(new Set());

  const SELECT =
    "id, order_number, status, payment_method, payment_status, change_for, total, cancellation_reason, cashier_confirmed_at, customer_delivery_confirmed_at, created_at, confirmed_at, ready_at, delivered_at";

  const handleConfirmReceived = async () => {
    if (!order || confirming) return;
    setConfirming(true);
    const { data, error } = await supabase
      .from("delivery_orders")
      .update({ customer_delivery_confirmed_at: new Date().toISOString() })
      .eq("id", orderId)
      .select(SELECT)
      .maybeSingle();
    if (!error && data) {
      setOrder(data as Order);
      if (userId) {
        const { clearActiveOrderId } = await import("@/lib/active-order-storage");
        clearActiveOrderId(userId);
      }
    }
    setConfirming(false);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("delivery_orders")
        .select(SELECT)
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
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const offline = isOffline(order.payment_method);
  const paid = order.payment_status === "paid";
  const cancelled = order.status === "cancelled";
  const hero = STATUS_HERO[order.status] ?? STATUS_HERO.pending;
  const HeroIcon = hero.Icon;

  // Timeline
  const order_idx = ["pending", "confirmed", "preparing", "ready", "delivering", "completed"].indexOf(
    order.status,
  );

  type Step = { key: string; label: string; time?: string | null };
  const baseSteps: Step[] = [
    { key: "received", label: "Pedido recebido", time: fmtTime(order.created_at) },
    {
      key: "preparing",
      label: "Em preparo",
      time: fmtTime(order.confirmed_at),
    },
    { key: "ready", label: "Pronto", time: fmtTime(order.ready_at) },
    { key: "delivering", label: "Saiu para entrega", time: fmtTime(order.ready_at) },
  ];
  if (offline) {
    baseSteps.push({ key: "awaiting_payment", label: "Aguardando pagamento no caixa" });
  }
  baseSteps.push({
    key: "completed",
    label: offline ? "Entregue e pago" : "Entregue",
    time: fmtTime(order.delivered_at),
  });

  const stepStatusIdx = (key: string) => {
    const map: Record<string, number> = {
      received: 0,
      preparing: 2,
      ready: 3,
      delivering: 4,
      awaiting_payment: 4,
      completed: 5,
    };
    return map[key];
  };

  const change =
    (order.payment_method === "cash" || order.payment_method === "dinheiro") &&
    order.change_for &&
    Number(order.change_for) > Number(order.total)
      ? Number(order.change_for) - Number(order.total)
      : null;

  const customerConfirmedAt = fmtTime(order.customer_delivery_confirmed_at);

  // Detect steps that just transitioned to "reached" to play check-draw once
  const currentReached = new Set<string>();
  baseSteps.forEach((step) => {
    const idxMapped = stepStatusIdx(step.key);
    const isAwaitingPayment = step.key === "awaiting_payment";
    const r = isAwaitingPayment
      ? paid
      : step.key === "completed"
      ? order_idx >= 5
      : order_idx >= idxMapped;
    if (r) currentReached.add(step.key);
  });
  const newlyReached = new Set<string>();
  currentReached.forEach((k) => {
    if (!prevReachedRef.current.has(k)) newlyReached.add(k);
  });
  // Only animate newly-reached if there was a previous render (avoid initial mass animation)
  justReachedRef.current = prevReachedRef.current.size === 0 ? new Set() : newlyReached;
  prevReachedRef.current = currentReached;
  const showConfirmButton =
    !cancelled && order.status === "delivering" && !order.customer_delivery_confirmed_at;

  return (
    <div className="flex flex-col h-full">
      {/* Conteúdo scrollável */}
      <div className="flex-1 overflow-y-auto px-1 pb-4 space-y-4">
        {/* Header / Hero */}
        <div
          className={cn(
            "rounded-xl p-4 flex items-start gap-4 border",
            cancelled ? "bg-destructive/10 border-destructive/30" : "bg-muted/40 border-border",
          )}
        >
          <div
            className={cn(
              "h-14 w-14 rounded-full flex items-center justify-center shrink-0",
              cancelled ? "bg-destructive/20" : "bg-primary/10",
            )}
          >
            <HeroIcon
              className={cn(
                "h-7 w-7",
                cancelled ? "text-destructive" : "text-primary",
                order.status === "preparing" || order.status === "delivering"
                  ? "animate-pulse"
                  : "",
              )}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold leading-tight">{hero.title}</h2>
              <Badge variant="secondary" className="font-mono text-xs">
                #{order.order_number}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {cancelled && order.cancellation_reason
                ? `Motivo: ${order.cancellation_reason}`
                : hero.subtitle}
            </p>
          </div>
        </div>

        {/* Banner contextual */}
        {!cancelled && order.status === "delivering" && (
          <>
            {offline && !paid && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10">
                <HandCoins className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-amber-700 dark:text-amber-300">
                    Tenha o pagamento pronto
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    Pague {formatBRL(Number(order.total))} ao entregador na chegada.
                  </p>
                  {change !== null && (
                    <p className="text-muted-foreground mt-1">
                      Levará troco para {formatBRL(Number(order.change_for))} (troco de{" "}
                      <span className="font-medium text-foreground">{formatBRL(change)}</span>).
                    </p>
                  )}
                </div>
              </div>
            )}

            {order.customer_delivery_confirmed_at && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-medium">
                    Recebimento confirmado{customerConfirmedAt ? ` às ${customerConfirmedAt}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {offline
                      ? "O restaurante ainda precisa registrar o pagamento no caixa para concluir o pedido."
                      : "Obrigado! Seu pedido será concluído pelo restaurante."}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Timeline */}
        {!cancelled && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Linha do tempo
            </p>
            <ol className="relative">
              {baseSteps.map((step, idx) => {
                const idxMapped = stepStatusIdx(step.key);
                const isAwaitingPayment = step.key === "awaiting_payment";
                const reached = isAwaitingPayment
                  ? paid
                  : step.key === "completed"
                  ? order_idx >= 5
                  : order_idx >= idxMapped;
                const current = isAwaitingPayment
                  ? order.status === "delivering" && !paid
                  : !reached && order_idx === idxMapped - (step.key === "preparing" ? 1 : 0);
                const isLast = idx === baseSteps.length - 1;

                return (
                  <li
                    key={step.key}
                    className="flex gap-3 pb-4 last:pb-0 animate-timeline-in"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div className="flex flex-col items-center">
                      <div className="relative">
                        {current && (
                          <span
                            aria-hidden
                            className="absolute inset-0 rounded-full bg-primary/40 animate-pulse-ring"
                          />
                        )}
                        <div
                          className={cn(
                            "relative rounded-full flex items-center justify-center border-2 shrink-0 transition-all duration-300",
                            current ? "h-8 w-8" : "h-7 w-7",
                            reached
                              ? "bg-primary border-primary"
                              : current
                              ? "border-primary bg-primary/10"
                              : "border-muted bg-background",
                          )}
                        >
                          {reached ? (
                            <CheckCircle2
                              className={cn(
                                "h-4 w-4 text-primary-foreground",
                                justReachedRef.current.has(step.key) && "animate-check-draw",
                              )}
                            />
                          ) : current ? (
                            <Clock className="h-4 w-4 text-primary animate-spin-slow" />
                          ) : (
                            <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                          )}
                        </div>
                      </div>
                      {!isLast && (
                        <div
                          className={cn(
                            "w-0.5 flex-1 mt-1 min-h-[16px] relative overflow-hidden",
                            reached
                              ? "bg-primary"
                              : current
                              ? "bg-muted"
                              : "bg-transparent border-l-2 border-dashed border-muted",
                          )}
                        >
                          {current && (
                            <span
                              aria-hidden
                              className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/70 to-transparent animate-fill-down"
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm",
                            reached
                              ? "font-medium text-foreground"
                              : current
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {step.label}
                        </p>
                        {reached && step.time && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {step.time}
                          </span>
                        )}
                      </div>
                      {step.key === "delivering" &&
                        order.customer_delivery_confirmed_at &&
                        customerConfirmedAt && (
                          <p className="text-xs text-primary mt-1">
                            ✓ Você confirmou recebimento às {customerConfirmedAt}
                          </p>
                        )}
                      {isAwaitingPayment && !paid && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Pague ao entregador. O caixa registrará a entrega.
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Card de pagamento */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <PaymentIcon method={order.payment_method} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Forma de pagamento</p>
                  <p className="font-medium text-sm truncate">
                    {PAYMENT_LABELS[order.payment_method] ?? order.payment_method}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0",
                    paid
                      ? "border-primary/40 text-primary"
                      : offline
                      ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                      : "border-muted-foreground/30",
                  )}
                >
                  {paid ? "Pago" : offline ? "Pagar na entrega" : "Aguardando"}
                </Badge>
              </div>
              {order.change_for && Number(order.change_for) > Number(order.total) && (
                <p className="text-xs text-muted-foreground mt-1">
                  Levar troco para {formatBRL(Number(order.change_for))}
                </p>
              )}
              <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-border">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="text-xl font-bold">{formatBRL(Number(order.total))}</span>
              </div>
            </div>
          </div>
        </div>

        {cancelled && offline && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/30">
            <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Nenhuma cobrança foi realizada — pagamento na entrega não gera cobrança prévia.
            </p>
          </div>
        )}
      </div>

      {/* Rodapé sticky */}
      <div className="sticky bottom-0 -mx-1 px-1 pt-3 pb-1 bg-background border-t border-border">
        {showConfirmButton ? (
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleConfirmReceived}
              disabled={confirming}
              size="lg"
              className="w-full h-16 text-base font-semibold"
            >
              {confirming ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <PackageCheck className="h-5 w-5 mr-2" />
                  Já recebi meu pedido
                </>
              )}
            </Button>
            <Button onClick={onClose} variant="ghost" size="sm" className="w-full h-9 text-sm text-muted-foreground">
              Fechar
            </Button>
          </div>
        ) : (
          <Button onClick={onClose} variant="outline" size="lg" className="w-full h-14">
            Fechar
          </Button>
        )}
        {showConfirmButton && (
          <p className="text-[11px] text-muted-foreground text-center mt-2 px-2">
            Apenas avisa o restaurante. O pagamento é registrado separadamente no caixa.
          </p>
        )}
      </div>
    </div>
  );
};
