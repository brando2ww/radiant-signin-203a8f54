import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ---- Settings ----
export function useLoyaltySettings(userId?: string) {
  const { user } = useAuth();
  const id = userId || user?.id;
  return useQuery({
    queryKey: ["loyalty-settings", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("delivery_loyalty_settings")
        .select("*")
        .eq("user_id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useUpsertLoyaltySettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      points_per_real: number;
      min_points_redeem: number;
      cashback_value_per_point: number;
      is_active: boolean;
    }) => {
      if (!user) throw new Error("Auth required");
      const { data: existing } = await supabase
        .from("delivery_loyalty_settings")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("delivery_loyalty_settings")
          .update(values)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("delivery_loyalty_settings")
          .insert({ ...values, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty-settings"] });
      toast.success("Configurações salvas!");
    },
    onError: () => toast.error("Erro ao salvar configurações"),
  });
}

// ---- Prizes ----
export function useLoyaltyPrizes(userId?: string) {
  const { user } = useAuth();
  const id = userId || user?.id;
  return useQuery({
    queryKey: ["loyalty-prizes", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("delivery_loyalty_prizes")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });
}

export function useCreateLoyaltyPrize() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      description?: string;
      points_cost: number;
      image_url?: string;
      is_active?: boolean;
      max_quantity?: number | null;
    }) => {
      if (!user) throw new Error("Auth required");
      const { error } = await supabase
        .from("delivery_loyalty_prizes")
        .insert({ ...values, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty-prizes"] });
      toast.success("Prêmio criado!");
    },
    onError: () => toast.error("Erro ao criar prêmio"),
  });
}

export function useUpdateLoyaltyPrize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: {
      id: string;
      name?: string;
      description?: string;
      points_cost?: number;
      image_url?: string;
      is_active?: boolean;
      max_quantity?: number | null;
    }) => {
      const { error } = await supabase
        .from("delivery_loyalty_prizes")
        .update(values)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty-prizes"] });
      toast.success("Prêmio atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar prêmio"),
  });
}

export function useDeleteLoyaltyPrize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("delivery_loyalty_prizes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty-prizes"] });
      toast.success("Prêmio excluído!");
    },
    onError: () => toast.error("Erro ao excluir prêmio"),
  });
}

// ---- Points ----
export function useCustomerPoints(userId?: string, customerId?: string) {
  return useQuery({
    queryKey: ["loyalty-points-balance", userId, customerId],
    queryFn: async () => {
      if (!userId || !customerId) return 0;
      const { data, error } = await supabase
        .from("delivery_loyalty_points")
        .select("points")
        .eq("user_id", userId)
        .eq("customer_id", customerId);
      if (error) throw error;
      return (data || []).reduce((sum, r) => sum + r.points, 0);
    },
    enabled: !!userId && !!customerId,
  });
}

export function useEarnPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      user_id: string;
      customer_id: string;
      points: number;
      reference_id?: string;
      description?: string;
    }) => {
      const { error } = await supabase
        .from("delivery_loyalty_points")
        .insert({ ...values, type: "earn" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loyalty-points-balance", vars.user_id, vars.customer_id] });
    },
  });
}

export function useRedeemPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      user_id: string;
      customer_id: string;
      points: number;
      reference_id?: string;
      description?: string;
    }) => {
      const { error } = await supabase
        .from("delivery_loyalty_points")
        .insert({ ...values, points: -Math.abs(values.points), type: "redeem" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loyalty-points-balance", vars.user_id, vars.customer_id] });
    },
  });
}

// ---- Public customer history ----
export function useCustomerPointsHistory(userId?: string, customerId?: string) {
  return useQuery({
    queryKey: ["loyalty-points-history", userId, customerId],
    queryFn: async () => {
      if (!userId || !customerId) return [];
      const { data, error } = await supabase
        .from("delivery_loyalty_points")
        .select("id, points, type, description, created_at, reference_id")
        .eq("user_id", userId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId && !!customerId,
  });
}

// ---- Public prize redemption via secure RPC ----
export function useRedeemLoyaltyPrize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { user_id: string; customer_id: string; prize_id: string }) => {
      const { data, error } = await supabase.rpc("redeem_loyalty_prize", {
        _user_id: values.user_id,
        _customer_id: values.customer_id,
        _prize_id: values.prize_id,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loyalty-points-balance", vars.user_id, vars.customer_id] });
      qc.invalidateQueries({ queryKey: ["loyalty-points-history", vars.user_id, vars.customer_id] });
      qc.invalidateQueries({ queryKey: ["loyalty-prizes", vars.user_id] });
    },
  });
}

// ---- Ranking (admin) ----
export function useCustomerRanking() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["loyalty-ranking", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("delivery_loyalty_points")
        .select("customer_id, points, delivery_customers(name, phone)")
        .eq("user_id", user.id);
      if (error) throw error;

      const map = new Map<string, { name: string; phone: string; total: number; earned: number; redeemed: number }>();
      for (const row of data || []) {
        const c = row.customer_id;
        const existing = map.get(c) || {
          name: (row as any).delivery_customers?.name || "—",
          phone: (row as any).delivery_customers?.phone || "",
          total: 0,
          earned: 0,
          redeemed: 0,
        };
        existing.total += row.points;
        if (row.points > 0) existing.earned += row.points;
        else existing.redeemed += Math.abs(row.points);
        map.set(c, existing);
      }

      return Array.from(map.entries())
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.total - a.total);
    },
    enabled: !!user,
  });
}

// ---- Redemption history (admin) ----
export function useRedemptionHistory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["loyalty-redemptions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("delivery_loyalty_points")
        .select("*, delivery_customers(name, phone)")
        .eq("user_id", user.id)
        .eq("type", "redeem")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}
