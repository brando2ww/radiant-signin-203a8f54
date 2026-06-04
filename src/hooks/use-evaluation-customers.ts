import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

export interface EvaluationCustomerFilters {
  from?: Date | null;
  to?: Date | null;
  campaignId?: string | null;
  onlyBirthdaysThisMonth?: boolean;
}

export interface EvaluationCustomer {
  key: string; // phone or name fallback
  name: string;
  whatsapp: string | null;
  birth_date: string | null;
  isBirthdayThisMonth: boolean;
  lastNpsScore: number | null;
  lastEvaluationDate: string;
  lastCampaignId: string | null;
  lastCampaignName: string | null;
  totalEvaluations: number;
}

export function useEvaluationCustomers(filters: EvaluationCustomerFilters = {}) {
  const { visibleUserId } = useEstablishmentId();

  return useQuery({
    queryKey: [
      "evaluation-customers",
      visibleUserId,
      filters.from?.toISOString() ?? null,
      filters.to?.toISOString() ?? null,
      filters.campaignId ?? null,
      !!filters.onlyBirthdaysThisMonth,
    ],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<EvaluationCustomer[]> => {
      let query = supabase
        .from("customer_evaluations")
        .select(
          "id, customer_name, customer_whatsapp, customer_birth_date, nps_score, evaluation_date, campaign_id, evaluation_campaigns(name)"
        )
        .eq("user_id", visibleUserId!)
        .order("evaluation_date", { ascending: false })
        .limit(2000);

      if (filters.campaignId) query = query.eq("campaign_id", filters.campaignId);
      if (filters.from) query = query.gte("evaluation_date", filters.from.toISOString());
      if (filters.to) query = query.lte("evaluation_date", filters.to.toISOString());

      const { data, error } = await query;
      if (error) throw error;

      const currentMonth = new Date().getMonth() + 1;
      const grouped = new Map<string, EvaluationCustomer>();

      for (const row of data || []) {
        const key =
          (row.customer_whatsapp && row.customer_whatsapp.replace(/\D/g, "")) ||
          row.customer_name ||
          (row as any).id;
        const existing = grouped.get(key);
        const birthMonth = row.customer_birth_date
          ? Number(String(row.customer_birth_date).slice(5, 7))
          : null;
        const isBirthday = birthMonth === currentMonth;

        if (!existing) {
          grouped.set(key, {
            key,
            name: row.customer_name || "Anônimo",
            whatsapp: row.customer_whatsapp,
            birth_date: row.customer_birth_date,
            isBirthdayThisMonth: isBirthday,
            lastNpsScore: row.nps_score ?? null,
            lastEvaluationDate: row.evaluation_date,
            lastCampaignId: row.campaign_id,
            lastCampaignName: (row as any).evaluation_campaigns?.name ?? null,
            totalEvaluations: 1,
          });
        } else {
          existing.totalEvaluations += 1;
        }
      }

      let result = Array.from(grouped.values());
      if (filters.onlyBirthdaysThisMonth) {
        result = result.filter((c) => c.isBirthdayThisMonth);
      }
      return result;
    },
  });
}
