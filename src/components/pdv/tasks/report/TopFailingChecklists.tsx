import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SECTOR_LABEL, type Sector } from "@/hooks/use-operational-report";

interface Props {
  rows: {
    id: string;
    name: string;
    sector: Sector | null;
    total: number;
    onTimeRate: number;
    topSkippedItem: string | null;
  }[];
}

export function TopFailingChecklists({ rows }: Props) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Checklists com mais falhas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {r.sector ? SECTOR_LABEL[r.sector] : "—"} · {r.total} execuções
                </div>
              </div>
              <Badge variant="outline" className="shrink-0">
                {r.onTimeRate}% no prazo
              </Badge>
            </div>
            {r.topSkippedItem && (
              <div className="mt-2 text-xs text-muted-foreground">
                Item mais ignorado: <span className="text-foreground">{r.topSkippedItem}</span>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
