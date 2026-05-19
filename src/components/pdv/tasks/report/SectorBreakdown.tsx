import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SECTOR_LABEL, type Sector } from "@/hooks/use-operational-report";

interface Props {
  rows: { sector: Sector; total: number; completed: number; overdue: number; critical: number; rate: number }[];
  onPick?: (sector: Sector) => void;
  selected?: Sector | null;
}

function color(rate: number): string {
  if (rate >= 80) return "bg-emerald-500";
  if (rate >= 60) return "bg-amber-500";
  return "bg-destructive";
}

export function SectorBreakdown({ rows, onPick, selected }: Props) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Desempenho por setor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
        )}
        {rows.map((r) => {
          const isSel = selected === r.sector;
          return (
            <button
              key={r.sector}
              onClick={() => onPick?.(r.sector)}
              className={cn(
                "w-full text-left rounded-md border p-3 transition-colors",
                isSel ? "border-primary bg-muted" : "border-border hover:bg-muted/50"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{SECTOR_LABEL[r.sector]}</span>
                <span className="text-sm tabular-nums">{r.rate}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full", color(r.rate))} style={{ width: `${r.rate}%` }} />
              </div>
              <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                <span>{r.total} tarefas</span>
                <span>{r.overdue} atrasadas</span>
                <span>{r.critical} críticos</span>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
