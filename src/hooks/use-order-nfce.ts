import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OrderNfce {
  id: string;
  status: string;
  chave_acesso?: string | null;
  danfe_pdf_url?: string | null;
  danfe_html_url?: string | null;
  xml_url?: string | null;
  valor_total?: number | null;
}

export function useOrderNfce(orderId?: string | null) {
  return useQuery({
    queryKey: ["order-nfce", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("pdv_nfce_emissions")
        .select("id, status, chave_acesso, danfe_pdf_url, danfe_html_url, xml_url, valor_total")
        .eq("order_id", orderId!)
        .eq("status", "autorizada")
        .maybeSingle();
      return (data as OrderNfce) ?? null;
    },
    enabled: !!orderId,
  });
}
