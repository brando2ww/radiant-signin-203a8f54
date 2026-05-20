import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { startOfDay, startOfMonth } from "date-fns";

export type DriverStatus = "disponivel" | "em_entrega" | "inativo";
export type VehicleType = "moto" | "bicicleta" | "carro" | "a_pe";

export interface DeliveryDriver {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  vehicle_type: VehicleType;
  plate: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  notes: string | null;
  is_active: boolean;
  status: DriverStatus;
  current_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverWithStats extends DeliveryDriver {
  deliveries_today: number;
  deliveries_month: number;
  active_orders: { id: string; order_number: string }[];
  active_count: number;
}

export interface DriverInput {
  name: string;
  phone?: string | null;
  vehicle_type: VehicleType;
  plate?: string | null;
  avatar_url?: string | null;
  avatar_color?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(var(--accent))",
  "hsl(var(--muted))",
];

export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function useDeliveryDrivers() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const driversQuery = useQuery({
    queryKey: ["delivery-drivers", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [] as DeliveryDriver[];
      const { data, error } = await supabase
        .from("delivery_drivers")
        .select("*")
        .eq("user_id", visibleUserId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DeliveryDriver[];
    },
    enabled: !!visibleUserId,
  });

  const statsQuery = useQuery({
    queryKey: ["delivery-driver-stats", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return { byDriverDay: {}, byDriverMonth: {}, activeOrders: {} } as any;
      const dayStart = startOfDay(new Date()).toISOString();
      const monthStart = startOfMonth(new Date()).toISOString();
      const { data, error } = await supabase
        .from("delivery_orders")
        .select("id, order_number, driver_id, status, delivered_at, created_at")
        .eq("user_id", visibleUserId)
        .not("driver_id", "is", null)
        .gte("created_at", monthStart);
      if (error) throw error;
      const byDriverDay: Record<string, number> = {};
      const byDriverMonth: Record<string, number> = {};
      const activeOrders: Record<string, { id: string; order_number: string }[]> = {};
      for (const r of data || []) {
        const d = r.driver_id as string;
        if (r.status === "completed") {
          byDriverMonth[d] = (byDriverMonth[d] || 0) + 1;
          const ts = (r as any).delivered_at || r.created_at;
          if (ts && ts >= dayStart) byDriverDay[d] = (byDriverDay[d] || 0) + 1;
        }
        if (r.status === "delivering") {
          if (!activeOrders[d]) activeOrders[d] = [];
          activeOrders[d].push({ id: r.id as string, order_number: r.order_number as string });
        }
      }
      return { byDriverDay, byDriverMonth, activeOrders };
    },
    enabled: !!visibleUserId,
    refetchInterval: 30_000,
  });

  // Realtime
  useEffect(() => {
    if (!visibleUserId) return;
    const ch = supabase
      .channel(`delivery-drivers-${visibleUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_drivers", filter: `user_id=eq.${visibleUserId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["delivery-drivers", visibleUserId] });
          qc.invalidateQueries({ queryKey: ["delivery-driver-stats", visibleUserId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [visibleUserId, qc]);

  const drivers: DriverWithStats[] = useMemo(() => {
    const stats = statsQuery.data || { byDriverDay: {}, byDriverMonth: {}, activeOrders: {} };
    return (driversQuery.data || []).map((d) => {
      const active = stats.activeOrders[d.id] || [];
      return {
        ...d,
        deliveries_today: stats.byDriverDay[d.id] || 0,
        deliveries_month: stats.byDriverMonth[d.id] || 0,
        active_orders: active,
        active_count: active.length,
      };
    });
  }, [driversQuery.data, statsQuery.data]);

  const create = useMutation({
    mutationFn: async (input: DriverInput) => {
      if (!visibleUserId) throw new Error("Sem estabelecimento");
      const { data, error } = await supabase
        .from("delivery_drivers")
        .insert({
          ...input,
          user_id: visibleUserId,
          avatar_color: input.avatar_color || colorForName(input.name),
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as DeliveryDriver;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-drivers", visibleUserId] });
      toast.success("Entregador cadastrado");
    },
    onError: (e: Error) => toast.error("Erro ao cadastrar: " + e.message),
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<DriverInput> & { status?: DriverStatus } }) => {
      const { error } = await supabase
        .from("delivery_drivers")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-drivers", visibleUserId] });
      toast.success("Entregador atualizado");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar: " + e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("delivery_drivers")
        .update({ is_active: false, status: "inativo" as DriverStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-drivers", visibleUserId] });
      toast.success("Entregador desativado");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  return {
    drivers,
    isLoading: driversQuery.isLoading,
    create: create.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    isMutating: create.isPending || update.isPending || remove.isPending,
  };
}

/**
 * Atribuir/remover entregador de um pedido.
 * Atualiza pedido e driver em paralelo.
 */
export function useAssignDriver() {
  const qc = useQueryClient();

  const assign = useMutation({
    mutationFn: async (input: { orderId: string; driverId: string }) => {
      const now = new Date().toISOString();
      const [a, b] = await Promise.all([
        supabase
          .from("delivery_orders")
          .update({ driver_id: input.driverId, driver_assigned_at: now })
          .eq("id", input.orderId),
        supabase
          .from("delivery_drivers")
          .update({ status: "em_entrega" as DriverStatus, current_order_id: input.orderId })
          .eq("id", input.driverId),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdv-delivery-queue"] });
      qc.invalidateQueries({ queryKey: ["delivery-drivers"] });
      qc.invalidateQueries({ queryKey: ["delivery-driver-stats"] });
      qc.invalidateQueries({ queryKey: ["delivery-orders"] });
    },
    onError: (e: Error) => toast.error("Erro ao atribuir entregador: " + e.message),
  });

  const unassign = useMutation({
    mutationFn: async (input: { orderId: string; driverId: string }) => {
      const [a, b] = await Promise.all([
        supabase
          .from("delivery_orders")
          .update({ driver_id: null, driver_assigned_at: null })
          .eq("id", input.orderId),
        supabase
          .from("delivery_drivers")
          .update({ status: "disponivel" as DriverStatus, current_order_id: null })
          .eq("id", input.driverId),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdv-delivery-queue"] });
      qc.invalidateQueries({ queryKey: ["delivery-drivers"] });
      qc.invalidateQueries({ queryKey: ["delivery-driver-stats"] });
      qc.invalidateQueries({ queryKey: ["delivery-orders"] });
    },
    onError: (e: Error) => toast.error("Erro ao remover entregador: " + e.message),
  });

  return {
    assignDriver: assign.mutateAsync,
    unassignDriver: unassign.mutateAsync,
    isAssigning: assign.isPending || unassign.isPending,
  };
}

/**
 * Libera o entregador (volta para disponivel) quando o pedido é finalizado.
 * Chamada após registro de pagamento ou confirmação de recebimento online.
 */
export async function releaseDriverForOrder(orderId: string) {
  const { data: order } = await supabase
    .from("delivery_orders")
    .select("driver_id")
    .eq("id", orderId)
    .maybeSingle();
  const driverId = (order as any)?.driver_id;
  if (!driverId) return;
  await supabase
    .from("delivery_drivers")
    .update({ status: "disponivel" as DriverStatus, current_order_id: null })
    .eq("id", driverId);
}
