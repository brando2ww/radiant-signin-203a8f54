/**
 * Banco de horas como livro-caixa.
 *
 * Não é um saldo único: cada crédito tem data de validade e é consumido do mais
 * antigo para o mais novo. O prazo sai do perfil de jornada, porque depende do
 * instrumento: mesmo mês por acordo tácito, 6 meses por acordo individual
 * escrito, 12 meses por norma coletiva (art. 59 da CLT).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

const MESES: Record<string, number> = { mensal: 1, quadrimestral: 4, semestral: 6, anual: 12 };

export interface SaldoBanco {
  colaborador_id: string;
  saldo: number;
  aVencer: number;
}

export function useBancoDeHoras(competencia: string) {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["ponto-banco", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<SaldoBanco[]> => {
      const { data, error } = await supabase
        .from("ponto_banco_lancamentos")
        .select("colaborador_id, tipo, minutos, expira_em")
        .eq("user_id", visibleUserId!);
      if (error) throw error;

      const hoje = new Date().toISOString().slice(0, 10);
      const em30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      const mapa = new Map<string, SaldoBanco>();

      for (const l of data ?? []) {
        const atual = mapa.get(l.colaborador_id) ?? { colaborador_id: l.colaborador_id, saldo: 0, aVencer: 0 };
        // Crédito vencido não conta mais: some do saldo em vez de virar dívida.
        const vencido = l.expira_em && l.expira_em < hoje;
        const sinal = l.tipo === "credito" ? 1 : -1;
        if (!(l.tipo === "credito" && vencido)) atual.saldo += sinal * l.minutos;
        if (l.tipo === "credito" && l.expira_em && l.expira_em >= hoje && l.expira_em <= em30) {
          atual.aVencer += l.minutos;
        }
        mapa.set(l.colaborador_id, atual);
      }
      return [...mapa.values()];
    },
  });

  const lancar = useMutation({
    mutationFn: async (linhas: { colaborador_id: string; credito: number; debito: number }[]) => {
      const { data: perfil } = await supabase
        .from("ponto_perfis_jornada")
        .select("periodo_banco")
        .eq("user_id", visibleUserId!)
        .order("vigencia_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();

      const meses = MESES[(perfil as any)?.periodo_banco ?? "semestral"] ?? 6;
      const data = `${competencia}-01`;
      const expira = new Date(data);
      expira.setMonth(expira.getMonth() + meses);

      const registros = linhas.flatMap((l) => {
        const saida: any[] = [];
        if (l.credito > 0) {
          saida.push({
            user_id: visibleUserId, colaborador_id: l.colaborador_id, data,
            tipo: "credito", minutos: l.credito,
            expira_em: expira.toISOString().slice(0, 10), origem: "fechamento",
          });
        }
        if (l.debito > 0) {
          saida.push({
            user_id: visibleUserId, colaborador_id: l.colaborador_id, data,
            tipo: "debito", minutos: l.debito, origem: "fechamento",
          });
        }
        return saida;
      });

      if (!registros.length) return;
      const { error } = await supabase.from("ponto_banco_lancamentos").insert(registros);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto-banco"] }),
  });

  return {
    saldos: query.data ?? [],
    isLoading: query.isLoading,
    lancarDoMes: lancar.mutateAsync,
    lancando: lancar.isPending,
  };
}
