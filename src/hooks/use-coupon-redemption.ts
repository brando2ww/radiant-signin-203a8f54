import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

export type CouponRewardType = "percent" | "fixed" | "free_product" | "manual";

export interface CouponLookupResult {
  win_id: string;
  coupon_code: string;
  customer_name: string;
  customer_whatsapp: string;
  coupon_expires_at: string;
  is_redeemed: boolean;
  redeemed_at: string | null;
  campaign_id: string;
  campaign_name: string;
  prize_id: string;
  prize_name: string;
  reward_type: CouponRewardType;
  reward_value: number | null;
  reward_product_id: string | null;
  status: "active" | "redeemed" | "expired" | "foreign";
}

/**
 * Lookup de cupom por código, escopado ao establishment_owner.
 * Retorna detalhes da recompensa para aplicar no PaymentDialog.
 */
export function useLookupCouponForPDV() {
  const { visibleUserId } = useEstablishmentId();

  return useMutation({
    mutationFn: async (rawCode: string): Promise<CouponLookupResult> => {
      const code = rawCode.trim().toUpperCase();
      if (!code) throw new Error("Digite o código do cupom");
      if (!visibleUserId) throw new Error("Sessão inválida");

      const { data: win, error } = await supabase
        .from("campaign_prize_wins")
        .select("*")
        .eq("coupon_code", code)
        .maybeSingle();
      if (error) throw error;
      if (!win) throw new Error("Cupom não encontrado");

      // valida tenant: campanha precisa pertencer ao owner
      const { data: campaign, error: cErr } = await supabase
        .from("evaluation_campaigns")
        .select("id, name, user_id")
        .eq("id", win.campaign_id)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!campaign || campaign.user_id !== visibleUserId) {
        throw new Error("Cupom pertence a outro estabelecimento");
      }

      const { data: prize, error: pErr } = await supabase
        .from("campaign_prizes")
        .select("id, name, reward_type, reward_value, reward_product_id")
        .eq("id", win.prize_id)
        .maybeSingle();
      if (pErr) throw pErr;

      const expired = new Date(win.coupon_expires_at).getTime() < Date.now();
      const status: CouponLookupResult["status"] = win.is_redeemed
        ? "redeemed"
        : expired
        ? "expired"
        : "active";

      const prizeAny = (prize ?? {}) as any;
      return {
        win_id: win.id,
        coupon_code: win.coupon_code,
        customer_name: win.customer_name,
        customer_whatsapp: win.customer_whatsapp,
        coupon_expires_at: win.coupon_expires_at,
        is_redeemed: win.is_redeemed,
        redeemed_at: win.redeemed_at,
        campaign_id: win.campaign_id,
        campaign_name: campaign.name,
        prize_id: win.prize_id,
        prize_name: prizeAny.name ?? "Prêmio",
        reward_type: (prizeAny.reward_type as CouponRewardType) ?? "manual",
        reward_value: prizeAny.reward_value ?? null,
        reward_product_id: prizeAny.reward_product_id ?? null,
        status,
      };
    },
  });
}

/**
 * Marca o cupom como resgatado atomicamente (guard `is_redeemed=false`).
 * Retorna sucesso só se conseguiu marcar — protege contra duplo uso concorrente.
 */
export function useRedeemCouponForPDV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (winId: string) => {
      const { data, error } = await supabase
        .from("campaign_prize_wins")
        .update({ is_redeemed: true, redeemed_at: new Date().toISOString() })
        .eq("id", winId)
        .eq("is_redeemed", false)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Cupom já foi resgatado por outro caixa");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-prize-wins"] });
      qc.invalidateQueries({ queryKey: ["campaign-prize-wins"] });
    },
  });
}
