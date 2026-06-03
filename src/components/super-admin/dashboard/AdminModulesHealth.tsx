import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { formatBRLCompact } from "@/lib/format";
import type { AdminDashboardData } from "@/hooks/use-admin-dashboard";

interface Props {
  data?: AdminDashboardData["modules_health"];
  isLoading: boolean;
}

const MODULE_LABELS: Record<string, string> = {
  pdv: "PDV",
  delivery: "Delivery",
  financeiro: "Financeiro",
  avaliacoes: "Avaliações",
  tarefas: "Tarefas",
  checklists: "Checklists",
  fiscal: "Fiscal",
};

export function AdminModulesHealth({ data, isLoading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Saúde dos módulos</CardTitle>
        <CardDescription>Adoção e volume no período</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.modules.map((m) => {
              const pct = data.total_tenants
                ? Math.round((m.tenants / data.total_tenants) * 100)
                : 0;
              let volume = "";
              if (m.module === "pdv") volume = formatBRLCompact(data.volumes.pdv_sales);
              else if (m.module === "delivery") volume = `${data.volumes.delivery_orders} pedidos`;
              else if (m.module === "avaliacoes") volume = `${data.volumes.evaluations} avaliações`;
              else if (m.module === "tarefas" || m.module === "checklists")
                volume = `${data.volumes.checklists} execuções`;

              return (
                <div key={m.module} className="rounded-lg border p-3 bg-card">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold">
                      {MODULE_LABELS[m.module] ?? m.module}
                    </h4>
                    <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-1.5 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {m.tenants} de {data.total_tenants} tenants
                  </p>
                  {volume && (
                    <p className="text-xs text-foreground mt-1 tabular-nums">{volume}</p>
                  )}
                </div>
              );
            })}
            {data.modules.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center col-span-full">
                Nenhum módulo ativo.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
