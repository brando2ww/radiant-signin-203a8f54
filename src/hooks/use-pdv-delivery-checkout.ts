import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";
import type { PaymentMethod } from "@/hooks/use-pdv-payments";

type Method = Exclude<PaymentMethod, "cartao">;

function normalize(m: PaymentMethod): Method {
  return m === "cartao" ? "credito" : m;
}

function buildSessionDeltas(
  method: Method,
  amount: number,
  change: number | undefined,
  source: "delivery" | "delivery_online",
) {
  const d: Record<string, number> = { total_sales: amount };
  // Pagamentos online (já pagos no app) não afetam a gaveta nem a conferência
  // de maquininhas — entram apenas como informativo.
  if (source === "delivery_online") {
    d.total_online_delivery = amount;
    return d;
  }
  if (method === "dinheiro") {
    d.total_cash = amount;
    if (change && change > 0) d.total_change = change;
  } else if (method === "credito") {
    d.total_credit = amount;
    d.total_card = amount;
  } else if (method === "debito") {
    d.total_debit = amount;
    d.total_card = amount;
  } else if (method === "pix") {
    d.total_pix = amount;
  } else if (method === "vale_refeicao") {
    d.total_voucher = amount;
  }
  return d;
}

function applyDeltas(session: any, deltas: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(deltas)) {
    out[k] = (Number(session?.[k]) || 0) + v;
  }
  return out;
}

interface RegisterDeliveryParams {
  orderId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  changeAmount?: number;
  source?: "delivery" | "delivery_online";
}

export function usePDVDeliveryCheckout() {
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pdv-delivery-queue"] });
    queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
    queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
    queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
  };

  const register = useMutation({
    mutationFn: async ({
      orderId,
      amount,
      paymentMethod,
      cashReceived,
      changeAmount,
      source = "delivery",
    }: RegisterDeliveryParams) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      const ownerId = visibleUserId || user.id;
      const method = normalize(paymentMethod);

      // Sessão ativa
      const { data: session, error: sErr } = await supabase
        .from("pdv_cashier_sessions")
        .select("*")
        .eq("user_id", ownerId)
        .is("closed_at", null)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!session) throw new Error("Caixa fechado — abra um caixa para registrar pedidos.");

      // Bloqueia dupla baixa
      const { data: existingOrder, error: oErr } = await supabase
        .from("delivery_orders")
        .select("id, customer_name, order_number, cashier_confirmed_at, payment_status, status")
        .eq("id", orderId)
        .maybeSingle();
      if (oErr) throw oErr;
      if (!existingOrder) throw new Error("Pedido não encontrado");
      if (existingOrder.cashier_confirmed_at) {
        throw new Error("Pedido já registrado no caixa");
      }

      const description =
        source === "delivery_online"
          ? `Delivery #${existingOrder.order_number} online — ${existingOrder.customer_name}`
          : `Delivery #${existingOrder.order_number} — ${existingOrder.customer_name}`;

      // Movimento
      const { error: mErr } = await supabase.from("pdv_cashier_movements").insert({
        cashier_session_id: session.id,
        type: "venda",
        amount,
        payment_method: method,
        description,
        source,
        delivery_order_id: orderId,
      } as any);
      if (mErr) throw mErr;

      // Atualiza totais
      const deltas = buildSessionDeltas(method, amount, changeAmount, source);
      const updates = applyDeltas(session, deltas);
      await supabase.from("pdv_cashier_sessions").update(updates).eq("id", session.id);

      // Marca pedido
      const orderUpdate: any = {
        cashier_confirmed_at: new Date().toISOString(),
        cashier_session_id: session.id,
        payment_status: "paid",
        updated_at: new Date().toISOString(),
      };
      if (existingOrder.status !== "completed") {
        orderUpdate.status = "completed";
        orderUpdate.delivered_at = new Date().toISOString();
      }
      await supabase.from("delivery_orders").update(orderUpdate).eq("id", orderId);

      // Libera entregador atribuído (se houver) — best effort
      try {
        const { releaseDriverForOrder } = await import("@/hooks/use-delivery-drivers");
        await releaseDriverForOrder(orderId);
      } catch {}

      return { ok: true };
    },
    onSuccess: () => {
      invalidate();
      toast.success("Pedido registrado no caixa!");
    },
    onError: (e: any) => {
      console.error(e);
      toast.error(e?.message || "Erro ao registrar pedido de delivery");
    },
  });

  return {
    registerDeliveryPayment: register.mutateAsync,
    isRegistering: register.isPending,
  };
}
