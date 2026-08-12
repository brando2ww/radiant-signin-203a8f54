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

// Register a win
export const useRegisterPrizeWin = () => {
  return useMutation({
    mutationFn: async (data: {
      campaignId: string;
      prizeId: string;
      evaluationId: string;
      customerName: string;
      customerWhatsapp: string;
    }) => {
      // Emissão atômica no servidor: gera o código, grava o cupom e incrementa o contador do
      // prêmio na mesma transação, e devolve o código já confirmado. Antes o código era sorteado
      // aqui e mostrado ao cliente sem confirmação — quando o INSERT falhava (prêmio apagado no
      // painel enquanto o cliente respondia), o cupom simplesmente sumia.
      const { data: rows, error } = await supabase.rpc("register_prize_win" as any, {
        p_campaign_id: data.campaignId,
        p_prize_id: data.prizeId,
        p_evaluation_id: data.evaluationId,
        p_customer_name: data.customerName,
        p_customer_whatsapp: data.customerWhatsapp,
      });

      const win = (Array.isArray(rows) ? rows[0] : rows) as
        | { coupon_code?: string; coupon_expires_at?: string }
        | null;

      if (error || !win?.coupon_code || !win?.coupon_expires_at) {
        const reason = error?.message || "register_prize_win não retornou cupom";
        // Deixa rastro: sem isto o cliente fica sem cupom e ninguém fica sabendo.
        await supabase.from("campaign_prize_win_failures" as any).insert({
          campaign_id: data.campaignId,
          prize_id: data.prizeId,
          evaluation_id: data.evaluationId,
          customer_name: data.customerName,
          customer_whatsapp: data.customerWhatsapp,
          reason,
        } as any);
        throw new Error(reason);
      }

      return { coupon_code: win.coupon_code, coupon_expires_at: win.coupon_expires_at };
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
