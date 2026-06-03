import { Link } from "react-router-dom";
import { Building2, Package, Plug } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminDashboardData } from "@/hooks/use-admin-dashboard";

interface Props {
  data?: AdminDashboardData["feed"];
  isLoading: boolean;
}

const KIND_ICON = {
  tenant_created: Building2,
  module_toggle: Package,
  integration_added: Plug,
} as const;

function describe(item: AdminDashboardData["feed"][number]): string {
  switch (item.kind) {
    case "tenant_created":
      return "Novo tenant cadastrado";
    case "module_toggle":
      return `Módulo "${item.detail ?? ""}" habilitado`;
    case "integration_added":
      return `Integração "${item.detail ?? ""}" conectada`;
  }
}

export function AdminActivityFeed({ data, isLoading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Atividade recente</CardTitle>
        <CardDescription>Últimas 20 ações na plataforma</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma atividade registrada.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((item, idx) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <li key={`${item.kind}-${item.ref}-${idx}`} className="flex items-start gap-3">
                  <div className="rounded-md bg-muted p-2 mt-0.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <Link
                        to={`/admin/tenants/${item.ref}`}
                        className="font-medium hover:underline"
                      >
                        {item.tenant_name}
                      </Link>{" "}
                      <span className="text-muted-foreground">— {describe(item)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
