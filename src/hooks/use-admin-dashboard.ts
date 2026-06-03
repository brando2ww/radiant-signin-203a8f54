import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AdminPeriodKey = "today" | "last_7" | "last_30" | "this_month" | "custom";

export interface AdminPeriod {
  key: AdminPeriodKey;
  start: Date;
  end: Date;
  label: string;
}

export interface AdminDashboardData {
  metrics: {
    total_tenants: number;
    active_tenants: number;
    total_users: number;
    active_modules: number;
    new_in_period: number;
    new_in_previous: number;
    franchises: number;
  };
  activity: {
    sales: number;
    delivery_orders: number;
    evaluations: number;
    checklists: number;
    coupons: number;
  };
  growth: Array<{ month: string; novos: number; cancelados: number; ativos: number }>;
  top_tenants: Array<{
    id: string;
    name: string;
    is_active: boolean;
    volume: number;
    delivery_orders: number;
    evaluations: number;
  }>;
  alerts: {
    inativos: Array<{ id: string; name: string; updated_at: string }>;
    sem_modulos: Array<{ id: string; name: string }>;
    sem_users: Array<{ id: string; name: string }>;
  };
  modules_health: {
    total_tenants: number;
    modules: Array<{ module: string; tenants: number }>;
    volumes: {
      pdv_sales: number;
      delivery_orders: number;
      evaluations: number;
      checklists: number;
    };
  };
  feed: Array<{
    kind: "tenant_created" | "module_toggle" | "integration_added";
    at: string;
    ref: string;
    tenant_name: string;
    detail: string | null;
  }>;
}

export function useAdminDashboard(period: AdminPeriod) {
  return useQuery({
    queryKey: ["admin-dashboard", period.start.toISOString(), period.end.toISOString()],
    queryFn: async (): Promise<AdminDashboardData> => {
      const { data, error } = await supabase.rpc("get_admin_dashboard_stats", {
        p_start: period.start.toISOString(),
        p_end: period.end.toISOString(),
      });
      if (error) throw error;
      return data as unknown as AdminDashboardData;
    },
    staleTime: 60_000,
  });
}
