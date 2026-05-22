import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDashboardCoupons(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["dashboard-coupons", startDate, endDate],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      let query = supabase
        .from("campaign_prize_wins")
        .select("id, is_redeemed, created_at, campaign_id");

      if (startDate) query = query.gte("created_at", `${startDate}T00:00:00-03:00`);
      if (endDate) query = query.lte("created_at", `${endDate}T23:59:59.999-03:00`);

      const { data, error } = await query;
      if (error) throw error;

      const total = data?.length || 0;
      const redeemed = data?.filter(c => c.is_redeemed).length || 0;

      return { totalCoupons: total, redeemedCoupons: redeemed };
    },
  });
}

export function useBirthdayCount(evaluationsData?: Array<{ customer_whatsapp: string; customer_birth_date: string }>) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  if (!evaluationsData) return 0;

  const uniqueCustomers = new Map<string, string>();
  evaluationsData.forEach(e => {
    if (!uniqueCustomers.has(e.customer_whatsapp)) {
      uniqueCustomers.set(e.customer_whatsapp, e.customer_birth_date);
    }
  });

  let count = 0;
  uniqueCustomers.forEach(birthDate => {
    const d = new Date(birthDate);
    if (!isNaN(d.getTime()) && d.getMonth() + 1 === currentMonth) {
      count++;
    }
  });

  return count;
}
