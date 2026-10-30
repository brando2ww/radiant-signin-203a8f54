import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buscarClientesDeliveryDaLoja } from "@/lib/delivery-clientes-loja";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";
import { telefoneSoNumeros } from "@/lib/telefone";
import { fetchAll } from "@/lib/reports/fetch-all";
import { customerActivity, type CustomerActivity, type CustomerConsumption, type CustomerCredit } from "@/lib/customer-consumption";

export interface PDVCustomer {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  cpf: string | null;
  email: string | null;
  birth_date: string | null;
  notes: string | null;
  total_spent: number;
  visit_count: number;
  last_visit: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnifiedCustomer extends CustomerActivity {
  id: string;
  name: string;
  phone: string | null;
  cpf: string | null;
  email: string | null;
  birth_date: string | null;
  notes: string | null;
  total_spent: number;
  visit_count: number;
  last_visit: string | null;
  created_at: string;
  source: "pdv" | "delivery";
  cashback_balance: number;
}

export interface CustomerLead {
  customer_whatsapp: string;
  customer_name: string;
  customer_birth_date: string;
  evaluation_count: number;
  last_nps: number | null;
  last_evaluation_date: string;
  campaign_names: string[];
}

export function usePDVCustomers() {
  const { visibleUserId, isLoading: loadingOwner } = useEstablishmentId();

  const { data: pdvCustomers = [], isLoading: loadingPdv, error: customersError, refetch: refetchCustomers } = useQuery({
    queryKey: ["pdv-customers", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) throw new Error("Usuário não autenticado");
      return fetchAll<PDVCustomer>((from, to) => supabase
        .from("pdv_customers")
        .select("*")
        .eq("user_id", visibleUserId)
        .order("name")
        .order("id")
        .range(from, to));
    },
    enabled: !!visibleUserId && !loadingOwner,
    refetchInterval: 60_000,
  });

  const { data: deliveryCustomers = [], isLoading: loadingDelivery, error: deliveryError, refetch: refetchDelivery } = useQuery({
    queryKey: ["delivery-customers-unified", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [];
      // Só os clientes do delivery DESTA loja (o cadastro é global).
      const clientes = await buscarClientesDeliveryDaLoja(visibleUserId);
      return clientes.sort((a, b) =>
        String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR"),
      );
    },
    enabled: !!visibleUserId && !loadingOwner,
    refetchInterval: 60_000,
  });

  const { data: cashback = [], isLoading: loadingCashback, error: cashbackError, refetch: refetchCashback } = useQuery({
    queryKey: ["pdv-customer-cashback", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [];
      return fetchAll((from, to) => supabase
        .rpc("pdv_clientes_cashback", { p_owner: visibleUserId })
        .order("telefone")
        .range(from, to));
    },
    enabled: !!visibleUserId && !loadingOwner,
    refetchInterval: 60_000,
  });
  const cashbackByPhone = new Map(cashback.map((credit) => [credit.telefone, Number(credit.saldo)]));

  const { data: consumptions = [], isLoading: loadingConsumption, error: consumptionError, refetch: refetchConsumption } = useQuery({
    queryKey: ["pdv-customer-consumption", visibleUserId],
    enabled: !!visibleUserId && !loadingOwner,
    queryFn: () => fetchAll((from, to) => supabase
      .rpc("pdv_clientes_consumos", { p_owner: visibleUserId! })
      .order("data_consumo", { ascending: false }).order("canal").order("referencia").range(from, to)),
    refetchInterval: 60_000,
  });
  const { data: credits = [], isLoading: loadingCredits, error: creditsError, refetch: refetchCredits } = useQuery({
    queryKey: ["pdv-customer-credits", visibleUserId],
    enabled: !!visibleUserId && !loadingOwner,
    queryFn: () => fetchAll((from, to) => supabase
      .rpc("pdv_clientes_creditos", { p_owner: visibleUserId! })
      .order("vence_em").order("id").range(from, to)),
    refetchInterval: 60_000,
  });
  const consumptionByPhone = new Map<string, CustomerConsumption[]>();
  for (const row of consumptions) {
    const list = consumptionByPhone.get(row.telefone) ?? [];
    list.push({ ...row, canal: row.canal as CustomerConsumption["canal"], valor: Number(row.valor) });
    consumptionByPhone.set(row.telefone, list);
  }
  const creditsByPhone = new Map<string, CustomerCredit[]>();
  for (const row of credits) {
    const list = creditsByPhone.get(row.telefone) ?? [];
    list.push({ ...row, valor: Number(row.valor), restante: Number(row.restante) });
    creditsByPhone.set(row.telefone, list);
  }
  const deliveryPhones = new Set(deliveryCustomers.map((customer) => telefoneSoNumeros(customer.phone)).filter(Boolean));

  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["customer-leads", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [];
      const { data, error } = await supabase
        .from("customer_evaluations")
        .select("customer_name, customer_whatsapp, customer_birth_date, nps_score, evaluation_date, campaign_id, evaluation_campaigns(name)")
        .eq("user_id", visibleUserId)
        .order("evaluation_date", { ascending: false });
      if (error) throw error;

      const grouped = new Map<string, CustomerLead>();
      for (const row of data || []) {
        const key = row.customer_whatsapp;
        const existing = grouped.get(key);
        const campaignName = (row as unknown as { evaluation_campaigns: { name?: string } | null }).evaluation_campaigns?.name;
        if (existing) {
          existing.evaluation_count++;
          if (campaignName && !existing.campaign_names.includes(campaignName)) {
            existing.campaign_names.push(campaignName);
          }
        } else {
          grouped.set(key, {
            customer_whatsapp: row.customer_whatsapp,
            customer_name: row.customer_name,
            customer_birth_date: row.customer_birth_date,
            evaluation_count: 1,
            last_nps: row.nps_score,
            last_evaluation_date: row.evaluation_date,
            campaign_names: campaignName ? [campaignName] : [],
          });
        }
      }
      return Array.from(grouped.values());
    },
    enabled: !!visibleUserId && !loadingOwner,
  });

  // Unify PDV + Delivery customers, deduplicate by phone (PDV wins)
  const customers: UnifiedCustomer[] = (() => {
    const seenPhones = new Set<string>();
    const result: UnifiedCustomer[] = [];

    for (const c of pdvCustomers) {
      const phone = telefoneSoNumeros(c.phone) || c.phone?.replace(/\D/g, "");
      if (phone) seenPhones.add(phone);
      const activity = customerActivity(deliveryPhones.has(phone) ? ["pdv", "delivery"] : ["pdv"], consumptionByPhone.get(phone) ?? [], creditsByPhone.get(phone) ?? []);
      result.push({
        ...activity,
        id: c.id,
        name: c.name,
        phone: c.phone,
        cpf: c.cpf,
        email: c.email,
        birth_date: c.birth_date,
        notes: c.notes,
        total_spent: activity.salon_spent + activity.delivery_spent,
        visit_count: activity.salon_visits + activity.delivery_visits,
        last_visit: activity.consumptions[0]?.data_consumo ?? c.last_visit,
        created_at: c.created_at,
        source: "pdv",
        cashback_balance: cashbackByPhone.get(phone) ?? 0,
      });
    }

    for (const d of deliveryCustomers) {
      const cleanPhone = telefoneSoNumeros(d.phone) || d.phone?.replace(/\D/g, "") || "";
      if (cleanPhone && seenPhones.has(cleanPhone)) continue;
      if (cleanPhone) seenPhones.add(cleanPhone);
      const activity = customerActivity(["delivery"], consumptionByPhone.get(cleanPhone) ?? [], creditsByPhone.get(cleanPhone) ?? []);
      result.push({
        ...activity,
        id: d.id,
        name: d.name,
        phone: d.phone,
        cpf: d.cpf,
        email: d.email,
        birth_date: d.birth_date,
        notes: null,
        total_spent: activity.salon_spent + activity.delivery_spent,
        visit_count: activity.salon_visits + activity.delivery_visits,
        last_visit: activity.consumptions[0]?.data_consumo ?? null,
        created_at: d.created_at,
        source: "delivery",
        cashback_balance: cashbackByPhone.get(cleanPhone) ?? 0,
      });
    }

    return result;
  })();

  const isLoading = loadingOwner || loadingPdv || loadingDelivery || loadingLeads || loadingConsumption || loadingCashback || loadingCredits;

  return {
    customers, leads, isLoading,
    customersError: customersError || deliveryError,
    cashbackError: cashbackError || creditsError,
    consumptionError,
    refetchCustomers: () => Promise.all([refetchCustomers(), refetchDelivery(), refetchConsumption()]),
    refetchCashback: () => Promise.all([refetchCashback(), refetchCredits()]),
  };
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();

  return useMutation({
    mutationFn: async (data: { name: string; phone?: string; cpf?: string; email?: string; birth_date?: string; notes?: string }) => {
      const uid = visibleUserId || user?.id;
      if (!uid) throw new Error("Usuário não autenticado");
      const { error } = await supabase.from("pdv_customers").insert({
        user_id: uid,
        name: data.name,
        phone: data.phone || null,
        cpf: data.cpf || null,
        email: data.email || null,
        birth_date: data.birth_date || null,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-customers"] });
      toast.success("Cliente cadastrado com sucesso!");
    },
    onError: () => toast.error("Erro ao cadastrar cliente"),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PDVCustomer> }) => {
      const { error } = await supabase.from("pdv_customers").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-customers"] });
      toast.success("Cliente atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar cliente"),
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pdv_customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-customers"] });
      toast.success("Cliente excluído!");
    },
    onError: () => toast.error("Erro ao excluir cliente"),
  });
}

export function useConvertLeadToCustomer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();

  return useMutation({
    mutationFn: async (lead: CustomerLead) => {
      const uid = visibleUserId || user?.id;
      if (!uid) throw new Error("Usuário não autenticado");
      const { error } = await supabase.from("pdv_customers").insert({
        user_id: uid,
        name: lead.customer_name,
        phone: lead.customer_whatsapp,
        birth_date: lead.customer_birth_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-customers"] });
      toast.success("Lead convertido em cliente!");
    },
    onError: () => toast.error("Erro ao converter lead"),
  });
}
