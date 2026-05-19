import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowDown, ArrowUp, ListChecks, CheckCircle2, Clock, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  metrics: {
    total: number;
    totalDelta: number;
    completionRate: number;
    completionRateDelta: number;
    overdue: number;
    overduePct: number;
    overdueDelta: number;
    criticalOpen: number;
  };
}

function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-xs text-muted-foreground">sem variação</span>;
  const up = value > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs", "text-muted-foreground")}>
      <Icon className="h-3 w-3" />
      {Math.abs(value)}
      {suffix} vs período anterior
    </span>
  );
}

function rateColor(rate: number): string {
  if (rate >= 80) return "bg-emerald-500";
  if (rate >= 60) return "bg-amber-500";
  return "bg-destructive";
}

export function MetricsCards({ metrics }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total de tarefas</span>
            <ListChecks className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-3xl font-bold">{metrics.total}</div>
          <div className="mt-1"><Delta value={metrics.totalDelta} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Taxa de conclusão</span>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-3xl font-bold">{metrics.completionRate}%</div>
          <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full transition-all", rateColor(metrics.completionRate))}
              style={{ width: `${metrics.completionRate}%` }}
            />
          </div>
          <div className="mt-1">
            <Delta value={metrics.completionRateDelta} suffix="pp" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Tarefas atrasadas</span>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-3xl font-bold">{metrics.overdue}</div>
          <div className="mt-1 text-xs text-muted-foreground">{metrics.overduePct}% do total</div>
          <div className="mt-1"><Delta value={metrics.overdueDelta} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Itens críticos em aberto</span>
            <AlertOctagon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-3xl font-bold">{metrics.criticalOpen}</div>
          <div className="mt-1 text-xs text-muted-foreground">não conformes</div>
        </CardContent>
      </Card>
    </div>
  );
}
