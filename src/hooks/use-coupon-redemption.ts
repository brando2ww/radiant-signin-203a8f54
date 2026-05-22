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

/**
 * Busca cupons por nome ou telefone do cliente, escopado ao establishment_owner.
 */
export function useSearchCouponsForPDV() {
  const { visibleUserId } = useEstablishmentId();

  return useMutation({
    mutationFn: async (rawTerm: string): Promise<CouponLookupResult[]> => {
      const term = rawTerm.trim();
      if (!term) throw new Error("Digite um nome ou telefone");
      if (!visibleUserId) throw new Error("Sessão inválida");

      const { data: campaigns, error: cErr } = await supabase
        .from("evaluation_campaigns")
        .select("id, name")
        .eq("user_id", visibleUserId);
      if (cErr) throw cErr;
      if (!campaigns?.length) return [];

      const campaignIds = campaigns.map((c) => c.id);
      const campaignMap = new Map(campaigns.map((c) => [c.id, c.name]));

      const { data: wins, error: wErr } = await supabase
        .from("campaign_prize_wins")
        .select("*")
        .in("campaign_id", campaignIds)
        .or(`customer_name.ilike.%${term}%,customer_whatsapp.ilike.%${term}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (wErr) throw wErr;
      if (!wins?.length) return [];

      const prizeIds = Array.from(new Set(wins.map((w) => w.prize_id)));
      const { data: prizes, error: pErr } = await supabase
        .from("campaign_prizes")
        .select("id, name, reward_type, reward_value, reward_product_id")
        .in("id", prizeIds);
      if (pErr) throw pErr;
      const prizeMap = new Map((prizes ?? []).map((p: any) => [p.id, p]));

      const now = Date.now();
      return wins.map((win): CouponLookupResult => {
        const prize: any = prizeMap.get(win.prize_id) ?? {};
        const expired = new Date(win.coupon_expires_at).getTime() < now;
        const status: CouponLookupResult["status"] = win.is_redeemed
          ? "redeemed"
          : expired
          ? "expired"
          : "active";
        return {
          win_id: win.id,
          coupon_code: win.coupon_code,
          customer_name: win.customer_name,
          customer_whatsapp: win.customer_whatsapp,
          coupon_expires_at: win.coupon_expires_at,
          is_redeemed: win.is_redeemed,
          redeemed_at: win.redeemed_at,
          campaign_id: win.campaign_id,
          campaign_name: campaignMap.get(win.campaign_id) ?? "Campanha",
          prize_id: win.prize_id,
          prize_name: prize.name ?? "Prêmio",
          reward_type: (prize.reward_type as CouponRewardType) ?? "manual",
          reward_value: prize.reward_value ?? null,
          reward_product_id: prize.reward_product_id ?? null,
          status,
        };
      });
    },
  });
}

export interface OpenComandaOption {
  id: string;
  label: string;
}

/**
 * Lança o prêmio (produto cortesia) em uma comanda aberta e marca o cupom como resgatado.
 * Atômico do ponto de vista do usuário: se o insert falhar, não marca como resgatado.
 */
export function useLaunchCouponOnComanda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      winId: string;
      comandaId: string;
      productId?: string | null;
      customName?: string | null;
      prizeName: string;
      couponCode: string;
    }) => {
      // valida comanda ativa
      const { data: comanda, error: cErr } = await supabase
        .from("pdv_comandas")
        .select("status")
        .eq("id", input.comandaId)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!comanda) throw new Error("Comanda não encontrada");
      const allowed = ["aberta", "aguardando_pagamento", "em_cobranca"];
      if (!allowed.includes(comanda.status)) {
        throw new Error("Esta comanda já foi finalizada");
      }

      let productId: string | null = null;
      let itemName: string;

      if (input.productId) {
        const { data: product, error: pErr } = await supabase
          .from("pdv_products")
          .select("id, name")
          .eq("id", input.productId)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!product) throw new Error("Produto do prêmio não encontrado");
        productId = product.id;
        itemName = `🎁 ${product.name}`;
      } else {
        const raw = (input.customName ?? input.prizeName ?? "").trim();
        if (!raw) throw new Error("Informe o nome do prêmio");
        itemName = `🎁 ${raw}`;
      }

      // insere item cortesia
      const { error: insErr } = await supabase
        .from("pdv_comanda_items")
        .insert([{
          comanda_id: input.comandaId,
          product_id: productId,
          product_name: itemName,
          quantity: 1,
          unit_price: 0,
          subtotal: 0,
          notes: `Cortesia — Cupom ${input.couponCode} (${input.prizeName})`,
          kitchen_status: "pendente",
        }]);
      if (insErr) throw insErr;

      // marca cupom como resgatado
      const { data: redeemed, error: rErr } = await supabase
        .from("campaign_prize_wins")
        .update({ is_redeemed: true, redeemed_at: new Date().toISOString() })
        .eq("id", input.winId)
        .eq("is_redeemed", false)
        .select()
        .maybeSingle();
      if (rErr) throw rErr;
      if (!redeemed) throw new Error("Cupom já havia sido resgatado");

      return { ok: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdv-comandas"] });
      qc.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
      qc.invalidateQueries({ queryKey: ["all-prize-wins"] });
      qc.invalidateQueries({ queryKey: ["campaign-prize-wins"] });
    },
  });
}

