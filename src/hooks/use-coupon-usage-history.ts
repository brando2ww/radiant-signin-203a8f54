import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "./use-establishment-id";

export interface CouponUsageRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  total: number;
  discount: number;
  created_at: string;
}

export function useCouponUsageHistory(code: string | null, enabled = true) {
  const { visibleUserId } = useEstablishmentId();

  return useQuery({
    queryKey: ["coupon-usage-history", visibleUserId, code],
    queryFn: async (): Promise<CouponUsageRow[]> => {
      if (!visibleUserId || !code) return [];
      const { data, error } = await supabase
        .from("delivery_orders")
        .select("id, order_number, customer_name, total, discount, created_at")
        .eq("user_id", visibleUserId)
        .eq("coupon_code", code)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CouponUsageRow[];
    },
    enabled: enabled && !!visibleUserId && !!code,
  });
}
