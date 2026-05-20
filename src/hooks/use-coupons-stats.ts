import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "./use-establishment-id";
import { DeliveryCoupon } from "./use-delivery-coupons";

export interface CouponsStats {
  activeCount: number;
  usesToday: number;
  totalSavings30d: number;
  expiringSoonCount: number;
}

export function useCouponsStats(coupons: DeliveryCoupon[]) {
  const { visibleUserId } = useEstablishmentId();

  const { data: orderStats } = useQuery({
    queryKey: ["coupons-stats-orders", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return { usesToday: 0, totalSavings30d: 0 };
      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const start30 = new Date();
      start30.setDate(start30.getDate() - 30);

      const { data } = await supabase
        .from("delivery_orders")
        .select("discount, created_at, coupon_code")
        .eq("user_id", visibleUserId)
        .not("coupon_code", "is", null)
        .gte("created_at", start30.toISOString());

      const rows = data ?? [];
      const usesToday = rows.filter(
        (r) => new Date(r.created_at) >= startToday
      ).length;
      const totalSavings30d = rows.reduce(
        (acc, r) => acc + Number(r.discount || 0),
        0
      );
      return { usesToday, totalSavings30d };
    },
    enabled: !!visibleUserId,
    staleTime: 60_000,
  });

  const now = new Date();
  const in7d = new Date();
  in7d.setDate(in7d.getDate() + 7);

  const activeCount = coupons.filter(
    (c) => c.is_active && new Date(c.valid_until) >= now
  ).length;
  const expiringSoonCount = coupons.filter((c) => {
    const v = new Date(c.valid_until);
    return c.is_active && v >= now && v <= in7d;
  }).length;

  const stats: CouponsStats = {
    activeCount,
    usesToday: orderStats?.usesToday ?? 0,
    totalSavings30d: orderStats?.totalSavings30d ?? 0,
    expiringSoonCount,
  };

  return stats;
}
