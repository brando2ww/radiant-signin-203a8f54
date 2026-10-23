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

    // Pelo servidor e por consulta periódica: o cliente sem login não lê a
    // tabela de pedidos (vazamento de 23/10/2026).
    const load = async () => {
      const { data, error } = await supabase.rpc("delivery_pedido_acompanhar" as any, {
        p_order_id: orderId,
      });
      if (cancelled) return;
      // Falha de rede numa das consultas periódicas não pode apagar o pedido
      // ativo: só some quando o servidor responde que o pedido não existe.
      if (error) {
        setLoading(false);
        return;
      }
      if (!data) {
        clearActiveOrderId(userId);
        setOrder(null);
      } else {
        setOrder(data as ActiveOrder);
      }
      setLoading(false);
    };
    load();
    const timer = window.setInterval(load, 15_000);
    const aoVoltar = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [orderId, userId]);

  // Auto-limpeza:
  // - completed (restaurante marcou entregue) → some na hora
  // - customer_delivery_confirmed_at (cliente confirmou) → some na hora
  // - cancelled → mantém por 1h para o cliente ver o motivo
  useEffect(() => {
    if (!order || !orderId) return;
    if (order.status === "completed" || order.customer_delivery_confirmed_at) {
      clearActiveOrderId(userId);
      return;
    }
    if (order.status === "cancelled" && order.cancelled_at) {
      const finishedAt = new Date(order.cancelled_at).getTime();
      const cutoffMs = 60 * 60 * 1000;
      const elapsed = Date.now() - finishedAt;
      if (elapsed >= cutoffMs) {
        clearActiveOrderId(userId);
        return;
      }
      const t = setTimeout(() => clearActiveOrderId(userId), cutoffMs - elapsed);
      return () => clearTimeout(t);
    }
  }, [order, orderId, userId]);

  return {
    orderId,
    order,
    loading,
    clear: () => clearActiveOrderId(userId),
  };
}
