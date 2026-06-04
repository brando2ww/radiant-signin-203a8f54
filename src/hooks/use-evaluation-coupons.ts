import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

export interface EvaluationCouponFilters {
  from?: Date | null;
  to?: Date | null;
  campaignId?: string | null;
}

export interface EvaluationCoupon {
  id: string;
  coupon_code: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  campaign_id: string;
  campaign_name: string | null;
  prize_name: string | null;
  reward_type: string | null;
  reward_value: number | null;
  created_at: string;
  coupon_expires_at: string | null;
  is_redeemed: boolean;
  redeemed_at: string | null;
}

export function useEvaluationCoupons(filters: EvaluationCouponFilters = {}) {
  const { visibleUserId } = useEstablishmentId();

  return useQuery({
    queryKey: [
      "evaluation-coupons",
      visibleUserId,
      filters.from?.toISOString() ?? null,
      filters.to?.toISOString() ?? null,
      filters.campaignId ?? null,
    ],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<EvaluationCoupon[]> => {
      // Fetch campaigns owned by this user
      const { data: campaigns, error: campErr } = await supabase
        .from("evaluation_campaigns")
        .select("id, name")
        .eq("user_id", visibleUserId!);
      if (campErr) throw campErr;

      const campaignIds = (campaigns || []).map((c) => c.id);
      if (campaignIds.length === 0) return [];

      let query = supabase
        .from("campaign_prize_wins")
        .select(
          "id, coupon_code, customer_name, customer_whatsapp, campaign_id, created_at, coupon_expires_at, is_redeemed, redeemed_at, prize_id, campaign_prizes(name, reward_type, reward_value)"
        )
        .in("campaign_id", campaignIds)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (filters.campaignId) {
        query = query.eq("campaign_id", filters.campaignId);
      }
      if (filters.from) {
        query = query.gte("created_at", filters.from.toISOString());
      }
      if (filters.to) {
        query = query.lte("created_at", filters.to.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const campaignMap = new Map((campaigns || []).map((c) => [c.id, c.name]));

      return (data || []).map((row: any) => ({
        id: row.id,
        coupon_code: row.coupon_code,
        customer_name: row.customer_name,
        customer_whatsapp: row.customer_whatsapp,
        campaign_id: row.campaign_id,
        campaign_name: campaignMap.get(row.campaign_id) || null,
        prize_name: row.campaign_prizes?.name ?? null,
        reward_type: row.campaign_prizes?.reward_type ?? null,
        reward_value: row.campaign_prizes?.reward_value ?? null,
        created_at: row.created_at,
        coupon_expires_at: row.coupon_expires_at,
        is_redeemed: !!row.is_redeemed,
        redeemed_at: row.redeemed_at,
      }));
    },
  });
}

export function useEvaluationCampaignsList() {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["evaluation-campaigns-list", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluation_campaigns")
        .select("id, name")
        .eq("user_id", visibleUserId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });
}
