import { Card, CardContent } from "@/components/ui/card";
import { Users, Trophy, AlertTriangle, Clock } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { useTeamWeekIndicators } from "@/hooks/use-team-week-indicators";

type OperatorRow = Database["public"]["Tables"]["checklist_operators"]["Row"];

interface Props {
  operators: OperatorRow[];
}

export function TeamIndicators({ operators }: Props) {
  const activeCount = operators.filter((o) => o.is_active).length;
  const { data: week } = useTeamWeekIndicators();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const accessedToday = operators.filter((o) => {
    if (!o.last_access_at) return false;
    const d = new Date(o.last_access_at);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }).length;

  const best = week?.best ?? null;
  const worst = week?.worst ?? null;

  const cards = [
    {
      label: "Colaboradores ativos",
      value: activeCount,
      icon: Users,
      color: "text-primary",
    },
    {
      label: "Melhor score da semana",
      value: best ? `${Math.round(best.avgScore)}%` : "—",
      sub: best ? best.name : "Semana atual",
      icon: Trophy,
      color: "text-emerald-500",
    },
    {
      label: "Menor score da semana",
      value: worst && worst !== best ? `${Math.round(worst.avgScore)}%` : "—",
      sub: worst && worst !== best ? worst.name : "Semana atual",
      icon: AlertTriangle,
      color: "text-amber-500",
    },
    {
      label: "Acessaram hoje",
      value: accessedToday,
      icon: Clock,
      color: "text-blue-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="py-4 px-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-muted ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
              {c.sub && <p className="text-[10px] text-muted-foreground">{c.sub}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
