import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

export type FiscalCouponStatus = "autorizada" | "pendente" | "rejeitada" | "cancelada";

export interface FiscalCouponItem {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  ncm?: string | null;
  cfop?: string | null;
  cest?: string | null;
  ean?: string | null;
  unidade?: string | null;
  origem?: number | null;
}

export interface FiscalCoupon {
  id: string;
  user_id: string;
  status: FiscalCouponStatus | string;
  ambiente: string;
  serie: string | null;
  numero: number | null;
  chave_acesso: string | null;
  protocolo_autorizacao: string | null;
  data_emissao: string;
  data_autorizacao: string | null;
  valor_total: number;
  valor_desconto: number;
  valor_servico: number;
  forma_pagamento: string | null;
  parcelas: number | null;
  customer_cpf: string | null;
  customer_email: string | null;
  customer_name: string | null;
  comanda_id: string | null;
  table_id: string | null;
  order_id: string | null;
  cashier_session_id: string | null;
  rejection_reason: string | null;
  cancellation_reason: string | null;
  cancellation_protocol: string | null;
  cancelled_at: string | null;
  last_status_check_at: string | null;
  parent_emission_id: string | null;
  
  danfe_pdf_url: string | null;
  danfe_html_url: string | null;
  xml_url: string | null;
  items_snapshot: FiscalCouponItem[] | null;
  created_at: string;
  updated_at: string;
}

export interface FiscalCouponsFilter {
  startDate?: Date;
  endDate?: Date;
  status?: string;
  ambiente?: string;
  paymentMethod?: string;
  search?: string;
}

export function useFiscalCoupons(filter: FiscalCouponsFilter = {}) {
  const { visibleUserId } = useEstablishmentId();

  return useQuery({
    queryKey: ["fiscal-coupons", visibleUserId, filter],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<FiscalCoupon[]> => {
      let q = supabase
        .from("pdv_nfce_emissions")
        .select("*")
        .eq("user_id", visibleUserId!)
        .order("data_emissao", { ascending: false })
        .limit(500);

      if (filter.startDate) q = q.gte("data_emissao", filter.startDate.toISOString());
      if (filter.endDate) q = q.lte("data_emissao", filter.endDate.toISOString());
      if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
      if (filter.ambiente && filter.ambiente !== "all") q = q.eq("ambiente", filter.ambiente);
      if (filter.paymentMethod && filter.paymentMethod !== "all") q = q.eq("forma_pagamento", filter.paymentMethod);

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as unknown as FiscalCoupon[];
      const term = filter.search?.trim().toLowerCase();
      if (!term) return rows;
      return rows.filter((r) =>
        [
          String(r.numero ?? ""),
          r.chave_acesso ?? "",
          r.customer_cpf ?? "",
          r.customer_name ?? "",
        ].some((v) => v.toLowerCase().includes(term))
      );
    },
  });
}
