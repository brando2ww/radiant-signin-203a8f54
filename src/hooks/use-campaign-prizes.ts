import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CampaignPrizeRewardType = "percent" | "fixed" | "free_product" | "manual";

export interface CampaignPrize {
  id: string;
  campaign_id: string;
  name: string;
  color: string;
  probability: number;
  max_quantity: number | null;
  redeemed_count: number;
  coupon_validity_days: number;
  is_active: boolean;
  created_at: string;
  reward_type: CampaignPrizeRewardType;
  reward_value: number | null;
  reward_product_id: string | null;
}

export interface CampaignPrizeWin {
  id: string;
  campaign_id: string;
  prize_id: string;
  evaluation_id: string;
  customer_name: string;
  customer_whatsapp: string;
  coupon_code: string;
  coupon_expires_at: string;
  is_redeemed: boolean;
  redeemed_at: string | null;
  created_at: string;
}

interface PrizeWriteData {
  name: string;
  color: string;
  probability: number;
  max_quantity?: number | null;
  coupon_validity_days?: number;
  reward_type?: CampaignPrizeRewardType;
  reward_value?: number | null;
  reward_product_id?: string | null;
}

// Admin: list prizes for a campaign
export const useCampaignPrizes = (campaignId: string) => {
  return useQuery({
    queryKey: ["campaign-prizes", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_prizes")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as CampaignPrize[];
    },
    enabled: !!campaignId,
  });
};

export const useCreatePrize = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: PrizeWriteData & { campaign_id: string }) => {
      const { error } = await supabase.from("campaign_prizes").insert(data as any);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["campaign-prizes", v.campaign_id] });
      toast.success("Prêmio adicionado!");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
};

export const useUpdatePrize = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaign_id, ...data }: { id: string; campaign_id: string; is_active?: boolean } & Partial<PrizeWriteData>) => {
      const { error } = await supabase.from("campaign_prizes").update(data as any).eq("id", id);
      if (error) throw error;
      return campaign_id;
    },
    onSuccess: (cid) => {
      qc.invalidateQueries({ queryKey: ["campaign-prizes", cid] });
      toast.success("Prêmio atualizado!");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
};

export const useDeletePrize = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaign_id }: { id: string; campaign_id: string }) => {
      const { error } = await supabase.from("campaign_prizes").delete().eq("id", id);
      if (error) throw error;
      return campaign_id;
    },
    onSuccess: (cid) => {
      qc.invalidateQueries({ queryKey: ["campaign-prizes", cid] });
      toast.success("Prêmio removido!");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
};

// Public: get active prizes for a campaign
export const usePublicCampaignPrizes = (campaignId: string, enabled = true) => {
  return useQuery({
    queryKey: ["public-campaign-prizes", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_prizes")
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      // Filter out prizes that reached max quantity
      return (data as unknown as CampaignPrize[]).filter(
        (p) => p.max_quantity === null || p.redeemed_count < p.max_quantity
      );
    },
    enabled: !!campaignId && enabled,
  });
};

// Pick a prize based on probabilities
export function pickPrize(prizes: CampaignPrize[]): CampaignPrize {
  const totalProb = prizes.reduce((s, p) => s + Number(p.probability), 0);
  const random = Math.random() * totalProb;
  let cumulative = 0;
  for (const prize of prizes) {
    cumulative += Number(prize.probability);
    if (random <= cumulative) return prize;
  }
  return prizes[prizes.length - 1];
}

// Generate coupon code
function generateCouponCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const l = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  const n = String(Math.floor(1000 + Math.random() * 9000));
  return `${l}-${n}`;
}

// Register a win
export const useRegisterPrizeWin = () => {
  return useMutation({
    mutationFn: async (data: {
      campaignId: string;
      prizeId: string;
      evaluationId: string;
      customerName: string;
      customerWhatsapp: string;
      couponValidityDays: number;
    }) => {
      const code = generateCouponCode();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + data.couponValidityDays);
      const expiresAtISO = expiresAt.toISOString();

      // Avoid .select().single() after insert: the public evaluation page is unauthenticated,
      // so the SELECT RLS policy ("Owner can read wins") blocks RETURNING, causing PostgREST
      // to return 406 and roll back the entire transaction.
      const { error } = await supabase
        .from("campaign_prize_wins")
        .insert({
          campaign_id: data.campaignId,
          prize_id: data.prizeId,
          evaluation_id: data.evaluationId,
          customer_name: data.customerName,
          customer_whatsapp: data.customerWhatsapp,
          coupon_code: code,
          coupon_expires_at: expiresAtISO,
        });

      if (error) throw error;

      await supabase.rpc("increment_prize_redeemed_count" as any, { prize_id: data.prizeId });

      return {
        id: crypto.randomUUID(),
        campaign_id: data.campaignId,
        prize_id: data.prizeId,
        evaluation_id: data.evaluationId,
        customer_name: data.customerName,
        customer_whatsapp: data.customerWhatsapp,
        coupon_code: code,
        coupon_expires_at: expiresAtISO,
        is_redeemed: false,
        redeemed_at: null,
        created_at: new Date().toISOString(),
      } as CampaignPrizeWin;
    },
  });
};

// Admin: list wins for a campaign
export const useCampaignPrizeWins = (campaignId: string) => {
  return useQuery({
    queryKey: ["campaign-prize-wins", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_prize_wins")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CampaignPrizeWin[];
    },
    enabled: !!campaignId,
  });
};
