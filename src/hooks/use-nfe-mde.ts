import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "./use-establishment-id";

export interface NfeMde {
  id: string;
  invoice_key: string;
  invoice_number: string;
  series?: string | null;
  emission_date: string;
  supplier_cnpj: string;
  supplier_name: string;
  total_invoice: number;
  status: string;
  mde_status?: string | null;
  mde_queried_at?: string | null;
  created_at: string;
}

export interface MdeLastQuery {
  last_mde_version: string | null;
  last_mde_query_at: string | null;
  cnpj: string | null;
}

export function useNfeMde(filters?: { mde_status?: string }) {
  const { visibleUserId } = useEstablishmentId();

  const { data, isLoading, error } = useQuery({
    queryKey: ["nfe-mde", visibleUserId, filters],
    queryFn: async () => {
      if (!visibleUserId) return [];

      let query = supabase
        .from("pdv_invoices")
        .select(
          "id, invoice_key, invoice_number, series, emission_date, supplier_cnpj, supplier_name, total_invoice, status, mde_status, mde_queried_at, created_at"
        )
        .eq("user_id", visibleUserId)
        .eq("source", "mde")
        .order("emission_date", { ascending: false });

      if (filters?.mde_status) {
        query = query.eq("mde_status", filters.mde_status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as NfeMde[];
    },
    enabled: !!visibleUserId,
  });

  return { invoices: data ?? [], isLoading, error };
}

export function useMdeLastQuery() {
  const { visibleUserId } = useEstablishmentId();

  const { data, isLoading } = useQuery({
    queryKey: ["mde-last-query", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return null;
      const { data } = await supabase
        .from("tenant_fiscal_config")
        .select("last_mde_version, last_mde_query_at, cnpj")
        .eq("user_id", visibleUserId)
        .maybeSingle();
      return data as MdeLastQuery | null;
    },
    enabled: !!visibleUserId,
  });

  return { config: data ?? null, isLoading };
}

export function useInvalidateNfeMde() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["nfe-mde"] });
    qc.invalidateQueries({ queryKey: ["mde-last-query"] });
  };
}
