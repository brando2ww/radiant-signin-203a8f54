import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Nome do estabelecimento para o cabeçalho dos relatórios exportados.
 *
 * Vem de `pdv_settings` e cai para `business_settings` — as duas guardam nome,
 * e qual está preenchida depende de por onde o cliente foi cadastrado. Sem
 * nenhuma das duas, o relatório sai com o nome do produto em vez de sair sem
 * cabeçalho.
 */
export function useReportBrand() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["report-brand", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [pdv, business] = await Promise.all([
        supabase.from("pdv_settings").select("business_name").eq("user_id", user!.id).maybeSingle(),
        supabase.from("business_settings").select("business_name").eq("user_id", user!.id).maybeSingle(),
      ]);
      return (
        pdv.data?.business_name?.trim() ||
        business.data?.business_name?.trim() ||
        ""
      );
    },
  });

  return { businessName: data || "Velara" };
}
