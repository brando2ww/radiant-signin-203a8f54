import { useState } from "react";
import { useAdminDashboard } from "@/hooks/use-admin-dashboard";
import { AdminPeriodFilter, computePeriod } from "@/components/super-admin/dashboard/AdminPeriodFilter";
import { AdminMetricsGrid } from "@/components/super-admin/dashboard/AdminMetricsGrid";
import { AdminActivitySection } from "@/components/super-admin/dashboard/AdminActivitySection";
import { AdminGrowthChart } from "@/components/super-admin/dashboard/AdminGrowthChart";
import { AdminTopTenants } from "@/components/super-admin/dashboard/AdminTopTenants";
import { AdminAlertsPanel } from "@/components/super-admin/dashboard/AdminAlertsPanel";
import { AdminModulesHealth } from "@/components/super-admin/dashboard/AdminModulesHealth";
import { AdminActivityFeed } from "@/components/super-admin/dashboard/AdminActivityFeed";

export default function AdminDashboard() {
  const [period, setPeriod] = useState(() => computePeriod("last_30"));
  const { data, isLoading, error } = useAdminDashboard(period);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Central executiva da plataforma — {period.label.toLowerCase()}
          </p>
        </div>
        <AdminPeriodFilter value={period} onChange={setPeriod} />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Erro ao carregar dados do dashboard: {(error as Error).message}
        </div>
      )}

      <section>
        <AdminMetricsGrid data={data?.metrics} isLoading={isLoading} />
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Atividade da plataforma</h2>
          <p className="text-xs text-muted-foreground">Volume agregado de todos os tenants no período</p>
        </div>
        <AdminActivitySection data={data?.activity} isLoading={isLoading} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminGrowthChart data={data?.growth} isLoading={isLoading} />
        <AdminModulesHealth data={data?.modules_health} isLoading={isLoading} />
      </div>

      <AdminTopTenants data={data?.top_tenants} isLoading={isLoading} />

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminAlertsPanel data={data?.alerts} isLoading={isLoading} />
        <AdminActivityFeed data={data?.feed} isLoading={isLoading} />
      </div>
    </div>
  );
}
