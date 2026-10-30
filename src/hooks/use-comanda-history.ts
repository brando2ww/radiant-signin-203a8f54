import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { usePDVPermissions } from "@/hooks/use-pdv-permissions";
import type { ClosedComanda, ClosedComandaDetail } from "@/lib/comanda-history";

export const HISTORY_PAGE_SIZE = 50;

export function useComandaHistory(filters: { from: string; to: string; search: string; page: number }) {
  const { visibleUserId, isLoading: loadingOwner } = useEstablishmentId();
  const { can, isLoading: loadingPermissions } = usePDVPermissions();
  const allowed = !loadingPermissions && can("view_history");
  const query = useQuery({
    queryKey: ["pdv-comanda-history", visibleUserId, filters],
    enabled: !!visibleUserId && !loadingOwner && allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pdv_historico_comandas", {
        p_owner: visibleUserId!, p_de: filters.from || null, p_ate: filters.to || null,
        p_busca: filters.search, p_offset: filters.page * HISTORY_PAGE_SIZE, p_limit: HISTORY_PAGE_SIZE,
      });
      if (error) throw error;
      return data as unknown as { total: number; comandas: ClosedComanda[] };
    },
  });
  return { ...query, allowed, isLoading: loadingOwner || loadingPermissions || query.isLoading };
}

export function useClosedComandaDetail(comandaId: string | null, open: boolean) {
  const { visibleUserId, isLoading } = useEstablishmentId();
  const { can, isLoading: loadingPermissions } = usePDVPermissions();
  return useQuery({
    queryKey: ["pdv-comanda-history-detail", visibleUserId, comandaId],
    enabled: open && !!comandaId && !!visibleUserId && !isLoading && !loadingPermissions && can("view_history"),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pdv_historico_comanda_detalhe", { p_owner: visibleUserId!, p_comanda: comandaId! });
      if (error) throw error;
      return data as unknown as ClosedComandaDetail;
    },
  });
}
