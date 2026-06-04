import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ToggleRight, Users, Package, TrendingUp, GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import type { AdminDashboardData } from "@/hooks/use-admin-dashboard";
import { useAdminSetting } from "@/hooks/use-admin-setting";

interface Props {
  data?: AdminDashboardData["metrics"];
  isLoading: boolean;
}

export function AdminMetricsGrid({ data, isLoading }: Props) {
  const navigate = useNavigate();
  const { value: goalValue, setValue: setGoalValue } = useAdminSetting<number>(
    "new_tenants_goal",
    5
  );
  const goal = Number.isFinite(goalValue) && goalValue > 0 ? goalValue : 5;
  const setGoal = (n: number) => setGoalValue(n);
  const [editingGoal, setEditingGoal] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const activePct = data.total_tenants
    ? Math.round((data.active_tenants / data.total_tenants) * 100)
    : 0;
  const newDelta = data.new_in_period - data.new_in_previous;
  const goalPct = goal > 0 ? Math.min(100, Math.round((data.new_in_period / goal) * 100)) : 0;

  const items = [
    {
      title: "Total de Tenants",
      value: data.total_tenants,
      subtitle: newDelta >= 0 ? `+${newDelta} vs. período anterior` : `${newDelta} vs. período anterior`,
      icon: Building2,
      onClick: () => navigate("/admin/tenants"),
    },
    {
      title: "Tenants Ativos",
      value: data.active_tenants,
      subtitle: `${activePct}% do total`,
      icon: ToggleRight,
      onClick: () => navigate("/admin/tenants"),
    },
    {
      title: "Total de Usuários",
      value: data.total_users,
      subtitle: "em todos os tenants",
      icon: Users,
      onClick: () => navigate("/admin/tenants"),
    },
    {
      title: "Módulos Ativos",
      value: data.active_modules,
      subtitle: "habilitações somadas",
      icon: Package,
      onClick: () => navigate("/admin/tenants"),
    },
    {
      title: "Novos no período",
      value: data.new_in_period,
      subtitle: `Meta: ${goal} (${goalPct}%)`,
      icon: TrendingUp,
      onClick: () => setEditingGoal(true),
      isGoal: true,
    },
    {
      title: "Franquias",
      value: data.franchises,
      subtitle: "tenants vinculados a matriz",
      icon: GitBranch,
      onClick: () => navigate("/admin/tenants"),
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card
            key={it.title}
            onClick={it.onClick}
            className="cursor-pointer transition-colors hover:bg-muted/40"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{it.title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{it.value}</div>
              {it.isGoal && editingGoal ? (
                <Input
                  type="number"
                  autoFocus
                  defaultValue={goal}
                  className="h-7 mt-1"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0) setGoal(v);
                    setEditingGoal(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
              ) : (
                <p className="text-xs text-muted-foreground mt-1">{it.subtitle}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
