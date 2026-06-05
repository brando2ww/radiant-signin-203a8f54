import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

// ---- Settings ----
export function useLoyaltySettings(userId?: string) {
  const { visibleUserId: ownerId } = useEstablishmentId();
  const id = userId || ownerId;
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
  const { visibleUserId: ownerId } = useEstablishmentId();
  return useMutation({
    mutationFn: async (values: {
      points_per_real: number;
      min_points_redeem: number;
      cashback_value_per_point: number;
      is_active: boolean;
      points_expire_days?: number;
      otp_session_minutes?: number;
    }) => {
      if (!ownerId) throw new Error("Auth required");
      const { data: existing } = await supabase
        .from("delivery_loyalty_settings")
        .select("id")
        .eq("user_id", ownerId)
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
          .insert({ ...values, user_id: ownerId } as any);
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
  const { visibleUserId: ownerId } = useEstablishmentId();
  const id = userId || ownerId;
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
  const { visibleUserId: ownerId } = useEstablishmentId();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      description?: string;
      points_cost: number;
      image_url?: string;
      is_active?: boolean;
      max_quantity?: number | null;
    }) => {
      if (!ownerId) throw new Error("Auth required");
      const { error } = await supabase
        .from("delivery_loyalty_prizes")
        .insert({ ...values, user_id: ownerId } as any);
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

// ---- Public customer balance/history via SECURITY DEFINER RPCs (auth-based) ----
export function useCustomerLoyaltyBalance(userId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["loyalty-balance-rpc", userId, user?.id ?? null],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.rpc("loyalty_get_balance", {
        _user_id: userId,
      });
      if (error) throw error;
      return data as unknown as { balance: number; expiring_soon: number; authenticated: boolean; linked?: boolean };
    },
    enabled: !!userId,
  });
}

export function useCustomerLoyaltyHistory(userId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["loyalty-history-rpc", userId, user?.id ?? null],
    queryFn: async () => {
      if (!userId || !user) return [];
      const { data, error } = await supabase.rpc("loyalty_get_history", {
        _user_id: userId,
      });
      if (error) throw error;
      return ((data as unknown) as any[]) || [];
    },
    enabled: !!userId && !!user,
  });
}

export function useRedeemLoyaltyPrize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { user_id: string; prize_id: string }) => {
      const { data, error } = await supabase.rpc("redeem_loyalty_prize", {
        _user_id: values.user_id,
        _prize_id: values.prize_id,
      });
      if (error) throw error;
      return data as unknown as { new_balance: number; prize_name: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty-balance-rpc"] });
      qc.invalidateQueries({ queryKey: ["loyalty-history-rpc"] });
      qc.invalidateQueries({ queryKey: ["loyalty-prizes"] });
    },
  });
}

export function useRedeemCashback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { user_id: string; order_id?: string; points: number }) => {
      const { data, error } = await supabase.rpc("redeem_cashback", {
        _user_id: values.user_id,
        _order_id: values.order_id ?? null,
        _points: values.points,
      });
      if (error) throw error;
      return data as unknown as { new_balance: number; redeemed: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty-balance-rpc"] });
      qc.invalidateQueries({ queryKey: ["loyalty-history-rpc"] });
    },
  });
}

// ---- Ranking (admin — resolves owner via establishment) ----
export function useCustomerRanking() {
  const { user } = useAuth();
  const { visibleUserId: ownerId } = useEstablishmentId();
  return useQuery({
    queryKey: ["loyalty-ranking", ownerId],
    queryFn: async () => {
      if (!ownerId) return [];
      const { data, error } = await supabase
        .from("delivery_loyalty_points")
        .select("customer_id, points, delivery_customers(name, phone)")
        .eq("user_id", ownerId);
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
    enabled: !!user && !!ownerId,
  });
}

// ---- Redemption history (admin) ----
export function useRedemptionHistory() {
  const { user } = useAuth();
  const { visibleUserId: ownerId } = useEstablishmentId();
  return useQuery({
    queryKey: ["loyalty-redemptions", ownerId],
    queryFn: async () => {
      if (!ownerId) return [];
      const { data, error } = await supabase
        .from("delivery_loyalty_points")
        .select("*, delivery_customers(name, phone)")
        .eq("user_id", ownerId)
        .eq("type", "redeem")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!ownerId,
  });
}
