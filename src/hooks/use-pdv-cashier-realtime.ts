import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mantém os totais da sessão de caixa atual e seus movimentos sincronizados
 * em tempo real, para que os blocos "Gaveta" e "Vendas por forma de pagamento"
 * atualizem sem precisar recarregar a página.
 */
export function usePDVCashierRealtime(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`pdv-cashier-realtime-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pdv_cashier_sessions",
          filter: `id=eq.${sessionId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pdv_cashier_movements",
          filter: `cashier_session_id=eq.${sessionId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
          queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient]);
}
