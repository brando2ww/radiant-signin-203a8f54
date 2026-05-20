import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth } from "date-fns";

export interface SupplierPurchaseStat {
  monthTotal: number;
  lastPurchaseAt: string | null;
}

export function useSupplierPurchaseStats() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["supplier-purchase-stats", user?.id],
    queryFn: async () => {
      if (!user?.id) return new Map<string, SupplierPurchaseStat>();

      const monthStart = startOfMonth(new Date()).toISOString();

      // Pedidos no mês atual (para somar)
      const { data: monthRows } = await supabase
        .from("pdv_purchase_orders")
        .select("supplier_id,total,created_at")
        .eq("user_id", user.id)
        .gte("created_at", monthStart);

      // Última compra por fornecedor (pega últimos 500 para mapear o max por supplier)
      const { data: recentRows } = await supabase
        .from("pdv_purchase_orders")
        .select("supplier_id,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);

      const map = new Map<string, SupplierPurchaseStat>();

      (monthRows || []).forEach((r: any) => {
        if (!r.supplier_id) return;
        const cur = map.get(r.supplier_id) || { monthTotal: 0, lastPurchaseAt: null };
        cur.monthTotal += Number(r.total) || 0;
        map.set(r.supplier_id, cur);
      });

      (recentRows || []).forEach((r: any) => {
        if (!r.supplier_id) return;
        const cur = map.get(r.supplier_id) || { monthTotal: 0, lastPurchaseAt: null };
        if (!cur.lastPurchaseAt || new Date(r.created_at) > new Date(cur.lastPurchaseAt)) {
          cur.lastPurchaseAt = r.created_at;
        }
        map.set(r.supplier_id, cur);
      });

      return map;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  });

  return {
    stats: data || new Map<string, SupplierPurchaseStat>(),
    isLoading,
  };
}
