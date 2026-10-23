import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buscarClientesDeliveryDaLoja } from "@/lib/delivery-clientes-loja";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

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

export interface UnifiedCustomer {
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
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();

  const { data: pdvCustomers = [], isLoading: loadingPdv } = useQuery({
    queryKey: ["pdv-customers", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) throw new Error("Usuário não autenticado");
      const { data, error } = await supabase
        .from("pdv_customers")
        .select("*")
        .eq("user_id", visibleUserId)
        .order("name");
      if (error) throw error;
      return data as PDVCustomer[];
    },
    enabled: !!visibleUserId,
  });

  const { data: deliveryCustomers = [], isLoading: loadingDelivery } = useQuery({
    queryKey: ["delivery-customers-unified", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [];
      // Só os clientes do delivery DESTA loja (o cadastro é global).
      const clientes = await buscarClientesDeliveryDaLoja(visibleUserId);
      return clientes.sort((a, b) =>
        String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR"),
      );
    },
    enabled: !!visibleUserId,
  });

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
        const campaignName = (row as any).evaluation_campaigns?.name;
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
    enabled: !!visibleUserId,
  });

  // Unify PDV + Delivery customers, deduplicate by phone (PDV wins)
  const customers: UnifiedCustomer[] = (() => {
    const seenPhones = new Set<string>();
    const result: UnifiedCustomer[] = [];

    for (const c of pdvCustomers) {
      if (c.phone) seenPhones.add(c.phone.replace(/\D/g, ""));
      result.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        cpf: c.cpf,
        email: c.email,
        birth_date: c.birth_date,
        notes: c.notes,
        total_spent: c.total_spent,
        visit_count: c.visit_count,
        last_visit: c.last_visit,
        created_at: c.created_at,
        source: "pdv",
      });
    }

    for (const d of deliveryCustomers) {
      const cleanPhone = d.phone?.replace(/\D/g, "") || "";
      if (cleanPhone && seenPhones.has(cleanPhone)) continue;
      if (cleanPhone) seenPhones.add(cleanPhone);
      result.push({
        id: d.id,
        name: d.name,
        phone: d.phone,
        cpf: d.cpf,
        email: d.email,
        birth_date: d.birth_date,
        notes: null,
        total_spent: 0,
        visit_count: 0,
        last_visit: null,
        created_at: d.created_at,
        source: "delivery",
      });
    }

    return result;
  })();

  const isLoading = loadingPdv || loadingDelivery || loadingLeads;

  return { customers, leads, isLoading };
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
