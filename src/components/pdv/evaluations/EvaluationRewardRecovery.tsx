import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIssueEvaluationReward, usePublicCampaignPrizes } from "@/hooks/use-campaign-prizes";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function EvaluationRewardRecovery({ evaluationId, campaignId }: { evaluationId: string; campaignId: string }) {
  const [prizeId, setPrizeId] = useState("");
  const { data: prizes = [] } = usePublicCampaignPrizes(campaignId);
  const issue = useIssueEvaluationReward();
  const existing = useQuery({
    queryKey: ["evaluation-reward", evaluationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_prize_wins").select("coupon_code,coupon_expires_at").eq("evaluation_id", evaluationId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const coupon = existing.data || (issue.data?.status === "issued" ? issue.data : null);
  return <div className="rounded-lg border p-3 space-y-2 text-sm">
    <p className="font-medium">Cupom da avaliação</p>
    {existing.isLoading ? <p>Consultando…</p> : existing.error ? <p>Não foi possível consultar o cupom.</p> : coupon ? <p><strong className="font-mono">{coupon.coupon_code}</strong> · Validade: {new Date(coupon.coupon_expires_at!).toLocaleDateString("pt-BR")}</p> : <>
      <p className="text-muted-foreground">Sem cupom registrado. Escolha o prêmio que foi sorteado ao cliente. Os limites da campanha continuam valendo.</p>
      <select aria-label="Prêmio para recuperar" className="w-full rounded-md border bg-background p-2" value={prizeId} onChange={(event) => setPrizeId(event.target.value)}><option value="">Escolher prêmio…</option>{prizes.map((prize) => <option key={prize.id} value={prize.id}>{prize.name}</option>)}</select>
      <Button size="sm" variant="outline" disabled={issue.isPending || !prizeId} onClick={() => issue.mutate({ evaluationId, prizeId }, {
        onSuccess: (result) => {
          if (result.status === "issued") { toast.success("Cupom recuperado"); existing.refetch(); }
          else if (result.status === "cooldown") toast.info("Este telefone já recebeu um prêmio no intervalo configurado.");
          else toast.info("Esta campanha está com a roleta desativada.");
        },
        onError: (error) => toast.error(error.message),
      })}>{issue.isPending ? "Recuperando…" : "Recuperar cupom"}</Button>
    </>}
  </div>;
}
