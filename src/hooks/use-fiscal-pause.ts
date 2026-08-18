import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

/**
 * Pausa da emissão de notas fiscais.
 *
 * Enquanto há uma pausa em curso (linha com `ended_at` nulo), o caixa vende
 * normalmente e o botão de emitir NFC-e fica indisponível. As vendas do período
 * ficam sem nota; o que fazer com elas é decisão do lojista, depois.
 *
 * A janela é gravada com início e fim justamente para que essa decisão seja
 * possível: é por ela que se listam as vendas que passaram pela pausa.
 */
export interface FiscalPause {
  id: string;
  user_id: string;
  started_at: string;
  started_by_name: string | null;
  ended_at: string | null;
  cashier_session_id: string | null;
}

export function useFiscalPause() {
  const { visibleUserId: ownerId } = useEstablishmentId();
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["fiscal-pause", ownerId],
    queryFn: async () => {
      if (!ownerId) return null;
      const { data, error } = await supabase
        .from("pdv_fiscal_pauses")
        .select("*")
        .eq("user_id", ownerId)
        .is("ended_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data as FiscalPause | null) ?? null;
    },
    enabled: !!ownerId,
    // Dois caixas na mesma loja precisam enxergar a pausa um do outro.
    refetchInterval: 30_000,
  });

  // Toast e invalidação ficam aqui para que os três gatilhos (F11, faixa e
  // diálogo) digam exatamente a mesma coisa.
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fiscal-pause"] });

  const pausar = useMutation({
    mutationFn: async (args: { cashierSessionId?: string | null; operatorName?: string | null }) => {
      if (!ownerId) throw new Error("Estabelecimento não identificado");
      const { error } = await supabase.from("pdv_fiscal_pauses").insert({
        user_id: ownerId,
        started_by: user?.id ?? null,
        // Sem nome do operador, o e-mail já identifica quem foi.
        started_by_name: args.operatorName ?? user?.email ?? null,
        cashier_session_id: args.cashierSessionId ?? null,
      });
      // 23505 = já existe pausa em curso (índice único). Não é erro para o
      // operador: alguém no outro caixa acabou de pausar.
      if (error && (error as any).code !== "23505") throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Modo manutenção ativado");
    },
    onError: (e) => {
      // O motivo real interessa a quem está depurando, não a quem opera o caixa.
      console.error("[modo-manutencao] falha ao ativar", e);
      toast.error("Não foi possível ativar o modo manutenção");
    },
  });

  const retomar = useMutation({
    mutationFn: async (args: { operatorName?: string | null }) => {
      if (!ownerId) throw new Error("Estabelecimento não identificado");
      const { error } = await supabase
        .from("pdv_fiscal_pauses")
        .update({
          ended_at: new Date().toISOString(),
          ended_by: user?.id ?? null,
          ended_by_name: args.operatorName ?? user?.email ?? null,
        })
        .eq("user_id", ownerId)
        .is("ended_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Modo manutenção desativado");
    },
    onError: (e) => {
      console.error("[modo-manutencao] falha ao desativar", e);
      toast.error("Não foi possível desativar o modo manutenção");
    },
  });

  return {
    pause: query.data ?? null,
    isPaused: !!query.data,
    isLoading: query.isLoading,
    pausar,
    retomar,
  };
}
