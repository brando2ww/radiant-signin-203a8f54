/**
 * Saúde do ponto.
 *
 * Duas coisas que a norma pede e que ninguém percebe quando quebram:
 *
 *  · o relógio do servidor pode sair do ar legal (a portaria admite 30 segundos
 *    de variação), e ponto com hora errada é ponto inválido;
 *  · jornada aberta (entrou e não saiu) é o defeito que mais aparece no
 *    fechamento, e é fácil de ver no mesmo dia.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

export function usePontoSaude() {
  const { visibleUserId } = useEstablishmentId();

  return useQuery({
    queryKey: ["ponto-saude", visibleUserId],
    enabled: !!visibleUserId,
    refetchInterval: 120_000,
    queryFn: async () => {
      const antes = Date.now();
      const { data: horaServidor } = await supabase.rpc("ponto_hora_servidor");
      const depois = Date.now();
      // Metade da ida e volta é a melhor estimativa do atraso da rede.
      const latencia = (depois - antes) / 2;
      const desvioMs = new Date(horaServidor as any).getTime() - (antes + latencia);

      const hoje = new Date().toISOString().slice(0, 10);
      const { data: marcacoes } = await supabase
        .from("ponto_marcacoes")
        .select("colaborador_id, marcado_em")
        .eq("user_id", visibleUserId!)
        .gte("marcado_em", `${hoje}T00:00:00`)
        .order("marcado_em");

      const porPessoa = new Map<string, number>();
      for (const m of marcacoes ?? []) {
        porPessoa.set(m.colaborador_id, (porPessoa.get(m.colaborador_id) ?? 0) + 1);
      }
      const jornadasAbertas = [...porPessoa.entries()]
        .filter(([, n]) => n % 2 === 1)
        .map(([colaborador_id]) => colaborador_id);

      return {
        desvioMs: Math.round(desvioMs),
        relogioOk: Math.abs(desvioMs) < 30_000,
        jornadasAbertas,
      };
    },
  });
}
