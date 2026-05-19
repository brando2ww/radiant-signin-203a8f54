import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Search } from "lucide-react";
import { useOperationalTasks, type TaskInstance, type ShiftConfig } from "@/hooks/use-operational-tasks";
import { format, subDays } from "date-fns";
import { toLocalDateStr } from "@/lib/date";

interface Props {
  shifts: ShiftConfig[];
}

export function TaskHistory({ shifts }: Props) {
  const { fetchHistory } = useOperationalTasks();
  const [date, setDate] = useState(toLocalDateStr());
  const [results, setResults] = useState<TaskInstance[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    try {
      const data = await fetchHistory(date, date);
      setResults(data);
    } finally {
      setLoading(false);
    }
  };

  const totalDone = results.filter((r) => r.status === "done").length;
  const grouped = shifts.map((s) => ({
    shift: s,
    tasks: results.filter((r) => r.shift === s.name.toLowerCase() || r.shift === s.name),
  })).filter((g) => g.tasks.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <Label>Data</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button onClick={search} disabled={loading}>
          <Search className="h-4 w-4 mr-2" /> Buscar
        </Button>
      </div>

      {results.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="outline">{totalDone}/{results.length} concluídas</Badge>
          <Badge variant={totalDone === results.length ? "default" : "secondary"}>
            {Math.round((totalDone / results.length) * 100)}%
          </Badge>
        </div>
      )}

      {results.length === 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Selecione uma data e clique em buscar para ver o histórico.
          </CardContent>
        </Card>
      )}

      {grouped.map(({ shift, tasks }) => (
        <Card key={shift.name}>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">{shift.name}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0 space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                {t.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className={`text-sm flex-1 ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                  {t.title}
                </span>
                {t.completedBy && <Badge variant="outline" className="text-xs">{t.completedBy}</Badge>}
                {t.completedAt && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(t.completedAt), "HH:mm")}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
