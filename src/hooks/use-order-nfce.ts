import { useQuery } from "@tanstack/react-query";
import { notasFiscais } from "@/lib/fiscal-db";

// Nota fiscal de um pedido de delivery.
//
// O vínculo é `origem_tipo`/`origem_id` em `notas_fiscais` — que é o que o
// emissor grava. Antes este hook consultava `pdv_nfce_emissions` (tabela da
// integração antiga, sem nenhum escritor), então o botão "Cupom fiscal" do
// pedido nunca aparecia.

export interface OrderNfce {
  id: string;
  status: string;
  chave_acesso?: string | null;
  danfe_pdf_url?: string | null;
  xml_url?: string | null;
  qrcode?: string | null;
  url_consulta?: string | null;
  valor_total?: number | null;
  mensagem_sefaz?: string | null;
}

export function useOrderNfce(orderId?: string | null) {
  return useQuery({
    queryKey: ["order-nfce", orderId],
    queryFn: async (): Promise<OrderNfce | null> => {
      const { data } = await notasFiscais()
        .select(
          "id, status, chave_acesso, caminho_danfe, caminho_xml, qrcode, url_consulta, valor_total, mensagem_sefaz",
        )
        .eq("tipo", "nfce")
        .eq("origem_tipo", "delivery_order")
        .eq("origem_id", orderId!)
        .eq("status", "autorizada")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return null;
      return {
        id: data.id,
        status: data.status,
        chave_acesso: data.chave_acesso,
        danfe_pdf_url: data.caminho_danfe,
        xml_url: data.caminho_xml,
        qrcode: data.qrcode,
        url_consulta: data.url_consulta,
        valor_total: data.valor_total,
        mensagem_sefaz: data.mensagem_sefaz,
      };
    },
    enabled: !!orderId,
  });
}
