import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import type { DeliveryOrder } from "@/hooks/use-delivery-orders";

/**
 * Pedidos de delivery com pendência ou em andamento sob a ótica do CAIXA.
 * Filtra por dono do estabelecimento (staff vê dados do dono).
 */
export function usePDVDeliveryQueue() {
  const { visibleUserId } = useEstablishmentId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pdv-delivery-queue", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [] as DeliveryOrder[];
      const { data, error } = await supabase
        .from("delivery_orders")
        .select(
          `*, delivery_order_items (*, delivery_order_item_options (*))`,
        )
        .eq("user_id", visibleUserId)
        .neq("status", "cancelled")
        .is("cashier_confirmed_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DeliveryOrder[];
    },
    enabled: !!visibleUserId,
    refetchInterval: 30_000,
  });

  // Realtime
  useEffect(() => {
    if (!visibleUserId) return;
    const ch = supabase
      .channel(`pdv-delivery-queue-${visibleUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_orders", filter: `user_id=eq.${visibleUserId}` },
        () => queryClient.invalidateQueries({ queryKey: ["pdv-delivery-queue", visibleUserId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [visibleUserId, queryClient]);

  const orders = query.data ?? [];

  const classified = useMemo(() => {
    const isPaidOnline = (o: DeliveryOrder) => o.payment_status === "paid";
    const needsCashierAction = (o: DeliveryOrder) =>
      ["delivering", "completed", "ready"].includes(o.status);

    const pendingPayment = orders.filter(
      (o) => !isPaidOnline(o) && needsCashierAction(o),
    );
    const awaitingOnlineConfirmation = orders.filter(
      (o) => isPaidOnline(o) && needsCashierAction(o),
    );
    const inProgress = orders.filter(
      (o) =>
        ["pending", "confirmed", "preparing"].includes(o.status) ||
        (o.status === "ready" && false),
    );

    const sorted = [...pendingPayment, ...awaitingOnlineConfirmation, ...inProgress];

    return {
      all: sorted,
      pendingPayment,
      awaitingOnlineConfirmation,
      inProgress,
      actionableCount: pendingPayment.length + awaitingOnlineConfirmation.length,
      totalCount: orders.length,
    };
  }, [orders]);

  return {
    ...classified,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
