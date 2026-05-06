import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearActiveOrderId,
  getActiveOrderId,
  subscribeActiveOrder,
} from "@/lib/active-order-storage";

interface ActiveOrder {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  total: number;
  created_at: string;
  delivered_at: string | null;
  cancelled_at: string | null;
  customer_delivery_confirmed_at: string | null;
}

const SELECT =
  "id, order_number, status, payment_method, payment_status, total, created_at, delivered_at, cancelled_at, customer_delivery_confirmed_at";

export function useActiveOrder(userId: string) {
  const [orderId, setOrderId] = useState<string | null>(() => getActiveOrderId(userId));
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [loading, setLoading] = useState<boolean>(!!orderId);

  useEffect(() => {
    setOrderId(getActiveOrderId(userId));
    return subscribeActiveOrder(userId, setOrderId);
  }, [userId]);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const { data, error } = await supabase
        .from("delivery_orders")
        .select(SELECT)
        .eq("id", orderId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        clearActiveOrderId(userId);
        setOrder(null);
      } else {
        setOrder(data as ActiveOrder);
      }
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`active-order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "delivery_orders", filter: `id=eq.${orderId}` },
        (payload) => {
          if (!cancelled) setOrder(payload.new as ActiveOrder);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orderId, userId]);

  // Auto-limpeza após pedido finalizado/cancelado
  useEffect(() => {
    if (!order || !orderId) return;
    const finalTs =
      order.status === "completed"
        ? order.delivered_at
        : order.status === "cancelled"
        ? order.cancelled_at
        : null;
    if (!finalTs) return;
    const finishedAt = new Date(finalTs).getTime();
    const cutoffMs = order.status === "completed" ? 30 * 60 * 1000 : 60 * 60 * 1000;
    const elapsed = Date.now() - finishedAt;
    if (elapsed >= cutoffMs) {
      clearActiveOrderId(userId);
      return;
    }
    const t = setTimeout(() => clearActiveOrderId(userId), cutoffMs - elapsed);
    return () => clearTimeout(t);
  }, [order, orderId, userId]);

  return {
    orderId,
    order,
    loading,
    clear: () => clearActiveOrderId(userId),
  };
}
