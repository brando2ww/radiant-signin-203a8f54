import { Link } from "react-router-dom";
import { AlertTriangle, UserX, PackageX, Power } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { AdminDashboardData } from "@/hooks/use-admin-dashboard";

interface Props {
  data?: AdminDashboardData["alerts"];
  isLoading: boolean;
}

interface Bucket {
  title: string;
  description: string;
  icon: typeof AlertTriangle;
  items: Array<{ id: string; name: string; sub?: string }>;
  tone: "destructive" | "warning" | "info";
}

const toneClasses: Record<Bucket["tone"], string> = {
  destructive: "border-destructive/40 bg-destructive/5",
  warning: "border-yellow-500/40 bg-yellow-500/5",
  info: "border-primary/30 bg-primary/5",
};

export function AdminAlertsPanel({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const buckets: Bucket[] = [
    {
      title: "Tenants inativos",
      description: "Desativados — verificar churn",
      icon: Power,
      tone: "destructive",
      items: data.inativos.map((t) => ({
        id: t.id,
        name: t.name,
        sub: `Desativado em ${format(new Date(t.updated_at), "dd/MM/yyyy", { locale: ptBR })}`,
      })),
    },
    {
      title: "Sem nenhum módulo ativo",
      description: "Tenants que não consomem nada hoje",
      icon: PackageX,
      tone: "warning",
      items: data.sem_modulos.map((t) => ({ id: t.id, name: t.name })),
    },
    {
      title: "Onboarding incompleto",
      description: "Sem usuários adicionais além do owner",
      icon: UserX,
      tone: "info",
      items: data.sem_users.map((t) => ({ id: t.id, name: t.name })),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          Alertas e atenção
        </CardTitle>
        <CardDescription>Itens que precisam de ação manual</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {buckets.map((b) => {
          const Icon = b.icon;
          return (
            <div key={b.title} className={`rounded-lg border p-3 ${toneClasses[b.tone]}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">{b.title}</h4>
                </div>
                <span className="text-xs text-muted-foreground">{b.items.length}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{b.description}</p>
              {b.items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Tudo certo por aqui.</p>
              ) : (
                <ul className="space-y-1">
                  {b.items.slice(0, 5).map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center justify-between gap-2 text-sm py-1"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{it.name}</p>
                        {it.sub && (
                          <p className="text-xs text-muted-foreground">{it.sub}</p>
                        )}
                      </div>
                      <Button asChild variant="ghost" size="sm" className="shrink-0">
                        <Link to={`/admin/tenants/${it.id}`}>Ver</Link>
                      </Button>
                    </li>
                  ))}
                  {b.items.length > 5 && (
                    <li className="text-xs text-muted-foreground pt-1">
                      +{b.items.length - 5} mais…
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
