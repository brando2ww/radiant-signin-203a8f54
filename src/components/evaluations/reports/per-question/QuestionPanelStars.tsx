import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowUpDown } from "lucide-react";
import type { QuestionAnswer } from "@/hooks/use-campaign-question-analytics";

interface Props {
  answers: QuestionAnswer[];
}

function classify(nps: number) {
  if (nps >= 75) return { label: "Excelente", color: "text-emerald-600" };
  if (nps >= 50) return { label: "Ótimo", color: "text-emerald-500" };
  if (nps >= 0) return { label: "Bom", color: "text-amber-600" };
  return { label: "Ruim", color: "text-destructive" };
}

export function QuestionPanelStars({ answers }: Props) {
  const [sortBy, setSortBy] = useState<"date" | "score">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const valid = useMemo(
    () => answers.filter(a => typeof a.score === "number") as (QuestionAnswer & { score: number })[],
    [answers]
  );

  const stats = useMemo(() => {
    if (valid.length === 0) {
      return { total: 0, avg: 0, nps: 0, promoters: 0, neutrals: 0, detractors: 0, scale10: true };
    }
    const max = Math.max(...valid.map(v => v.score));
    const scale10 = max > 5;
    const promoters = valid.filter(v => scale10 ? v.score >= 9 : v.score >= 5).length;
    const neutrals = valid.filter(v => scale10 ? (v.score >= 7 && v.score <= 8) : v.score === 4).length;
    const detractors = valid.filter(v => scale10 ? v.score <= 6 : v.score <= 3).length;
    const nps = Math.round(((promoters - detractors) / valid.length) * 100);
    const avg = valid.reduce((s, v) => s + v.score, 0) / valid.length;
    return { total: valid.length, avg, nps, promoters, neutrals, detractors, scale10 };
  }, [valid]);

  const evolution = useMemo(() => {
    const byDay = new Map<string, number[]>();
    valid.forEach(v => {
      const d = format(parseISO(v.evaluation_date), "yyyy-MM-dd");
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(v.score);
    });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, scores]) => ({
        date: format(parseISO(date), "dd/MM", { locale: ptBR }),
        media: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
      }));
  }, [valid]);

  const sorted = useMemo(() => {
    const arr = [...valid];
    arr.sort((a, b) => {
      const cmp = sortBy === "date"
        ? a.evaluation_date.localeCompare(b.evaluation_date)
        : a.score - b.score;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [valid, sortBy, sortDir]);

  const pages = Math.ceil(sorted.length / pageSize);
  const pageRows = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const cls = classify(stats.nps);
  const maxScale = stats.scale10 ? 10 : 5;

  if (valid.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Sem respostas no período.</p>;
  }

  const promPct = (stats.promoters / stats.total) * 100;
  const neutPct = (stats.neutrals / stats.total) * 100;
  const detPct = (stats.detractors / stats.total) * 100;

  const promLabel = stats.scale10 ? "Promotores (9-10)" : "Promotores (5)";
  const neutLabel = stats.scale10 ? "Neutros (7-8)" : "Neutros (4)";
  const detLabel = stats.scale10 ? "Detratores (0-6)" : "Detratores (≤3)";

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">NPS</p>
            <p className={`text-4xl font-bold ${cls.color}`}>{stats.nps}</p>
            <p className="text-sm text-muted-foreground mt-1">{cls.label}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total de respostas</p>
            <p className="text-4xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Média</p>
            <p className="text-4xl font-bold text-foreground">
              {stats.avg.toFixed(1)} <span className="text-lg text-muted-foreground">/ {maxScale}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-emerald-600">{promLabel}</span>
            <span className="text-sm text-muted-foreground">{promPct.toFixed(0)}%</span>
          </div>
          <p className="text-2xl font-bold text-foreground my-1">{stats.promoters}</p>
          <Progress value={promPct} className="h-2" />
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-amber-600">{neutLabel}</span>
            <span className="text-sm text-muted-foreground">{neutPct.toFixed(0)}%</span>
          </div>
          <p className="text-2xl font-bold text-foreground my-1">{stats.neutrals}</p>
          <Progress value={neutPct} className="h-2" />
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-destructive">{detLabel}</span>
            <span className="text-sm text-muted-foreground">{detPct.toFixed(0)}%</span>
          </div>
          <p className="text-2xl font-bold text-foreground my-1">{stats.detractors}</p>
          <Progress value={detPct} className="h-2" />
        </div>
      </div>

      {/* Evolução */}
      {evolution.length > 1 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-medium mb-2">Evolução da média</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={evolution}>
              <defs>
                <linearGradient id="qStarsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, maxScale]} />
              <Tooltip />
              <Area type="monotone" dataKey="media" name="Média" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#qStarsGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2">
                  <button
                    onClick={() => { setSortBy("date"); setSortDir(sortBy === "date" && sortDir === "desc" ? "asc" : "desc"); }}
                    className="flex items-center gap-1 font-medium"
                  >
                    Data <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-left p-2">
                  <button
                    onClick={() => { setSortBy("score"); setSortDir(sortBy === "score" && sortDir === "desc" ? "asc" : "desc"); }}
                    className="flex items-center gap-1 font-medium"
                  >
                    Nota <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-left p-2">Cliente</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2">{format(parseISO(r.evaluation_date), "dd/MM/yyyy HH:mm", { locale: ptBR })}</td>
                  <td className="p-2 font-medium">{r.score}</td>
                  <td className="p-2">{r.customer_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between p-2 border-t border-border bg-muted/40">
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {pages}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
