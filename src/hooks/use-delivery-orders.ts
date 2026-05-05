import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";
import { dispatchDeliveryPrintJobs } from "@/lib/delivery-print";

export interface DeliveryOrder {
  id: string;
  order_number: string;
  user_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  delivery_address_id: string | null;
  delivery_address_text: string | null;
  order_type: "delivery" | "pickup";
  status: "pending" | "confirmed" | "preparing" | "ready" | "delivering" | "completed" | "cancelled";
  subtotal: number;
  delivery_fee: number;
  discount: number;
  coupon_code: string | null;
  total: number;
  payment_method: string;
  payment_status: string;
  change_for: number | null;
  notes: string | null;
  estimated_time: number;
  confirmed_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  delivery_order_items?: DeliveryOrderItem[];
}

export interface DeliveryOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
  production_center_id?: string | null;
  delivery_order_item_options?: DeliveryOrderItemOption[];
}

export interface DeliveryOrderItemOption {
  id: string;
  order_item_id: string;
  option_name: string;
  item_name: string;
  price_adjustment: number;
}

export const useDeliveryOrders = (status?: string) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["delivery-orders", status],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      let query = supabase
        .from("delivery_orders")
        .select(`
          *,
          delivery_order_items (
            *,
            delivery_order_item_options (*)
          )
        `)
        .eq("user_id", user.id);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      return data as DeliveryOrder[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("delivery_orders_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_orders",
        },
        (payload) => {
          console.log("Order change received:", payload);
          
          // Tocar som para novos pedidos
          if (payload.eventType === "INSERT") {
            const audio = new Audio("/notification.mp3");
            audio.play().catch(() => {
              // Fallback se não conseguir tocar
              console.log("Novo pedido recebido!");
            });
            toast.success("Novo pedido recebido! 🎉");
          }
          
          // Invalidar queries para atualizar dados
          queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
};

export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: DeliveryOrder["status"];
    }) => {
      const updates: any = { status };

      // Atualizar timestamps conforme o status
      if (status === "confirmed") {
        updates.confirmed_at = new Date().toISOString();
      } else if (status === "ready") {
        updates.ready_at = new Date().toISOString();
      } else if (status === "completed") {
        updates.delivered_at = new Date().toISOString();
      } else if (status === "cancelled") {
        updates.cancelled_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("delivery_orders")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Baixa automática de estoque ao confirmar o pedido (idempotente no servidor)
      if (status === "confirmed") {
        const { error: consumeErr } = await supabase.rpc(
          "consume_ingredients_for_delivery_order",
          { p_order_id: id },
        );
        if (consumeErr) console.error("Erro ao baixar estoque (delivery):", consumeErr);

        // Dispara prints por centro de produção (mesma fila do salão)
        try {
          const result = await dispatchDeliveryPrintJobs(id);
          if (result.jobs > 0) {
            toast.success(`${result.jobs} impressão(ões) enviada(s) à cozinha`);
          }
        } catch (e) {
          console.error("Erro ao enfileirar prints do delivery:", e);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
      toast.success("Status do pedido atualizado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar status: " + error.message);
    },
  });
};

export const useCancelOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      reason,
    }: {
      id: string;
      reason: string;
    }) => {
      const { data, error } = await supabase
        .from("delivery_orders")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
      toast.success("Pedido cancelado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao cancelar pedido: " + error.message);
    },
  });
};

export const useReprintOrder = () => {
  return useMutation({
    mutationFn: async ({
      orderId,
      centerId,
    }: {
      orderId: string;
      centerId?: string | null;
    }) => {
      return await dispatchDeliveryPrintJobs(orderId, centerId);
    },
    onSuccess: (result) => {
      if (result.jobs > 0) {
        toast.success(`${result.jobs} reimpressão(ões) enviada(s)`);
      } else {
        toast.warning("Nenhum item para reimprimir");
      }
    },
    onError: (error: Error) => {
      toast.error("Erro ao reimprimir: " + error.message);
    },
  });
};
export const useOrderStats = () => {
  return useQuery({
    queryKey: ["delivery-order-stats"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: orders, error } = await supabase
        .from("delivery_orders")
        .select("status, total, created_at")
        .eq("user_id", user.id)
        .gte("created_at", today.toISOString());

      if (error) throw error;

      const stats = {
        pending: orders.filter(o => o.status === "pending").length,
        confirmed: orders.filter(o => o.status === "confirmed").length,
        preparing: orders.filter(o => o.status === "preparing").length,
        ready: orders.filter(o => o.status === "ready").length,
        delivering: orders.filter(o => o.status === "delivering").length,
        completed: orders.filter(o => o.status === "completed").length,
        cancelled: orders.filter(o => o.status === "cancelled").length,
        todayTotal: orders.filter(o => o.status !== "cancelled").length,
        todayRevenue: orders
          .filter(o => o.status !== "cancelled")
          .reduce((sum, o) => sum + Number(o.total), 0),
      };

      return stats;
    },
  });
};
