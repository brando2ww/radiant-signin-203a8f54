import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Download, ChevronDown, ChevronUp } from "lucide-react";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { usePdvMonthlyRevenue, type MonthlyRevenuePoint } from "@/hooks/use-pdv-monthly-revenue";

function VariationBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Minus className="h-3.5 w-3.5" /> —
      </span>
    );
  }
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const sign = value > 0 ? "+" : "";
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
      <Icon className="h-3.5 w-3.5" />
      {sign}
      {value.toFixed(1)}%
    </span>
  );
}

function downloadCSV(rows: MonthlyRevenuePoint[]) {
  const header = ["Mes", "Salao", "Balcao", "Delivery", "Total"];
  const lines = rows.map((r) =>
    [r.label, r.salao.toFixed(2), r.balcao.toFixed(2), r.delivery.toFixed(2), r.total.toFixed(2)].join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `evolucao-faturamento-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MonthlyRevenueSection() {
  const { data, isLoading } = usePdvMonthlyRevenue();
  const [tableOpen, setTableOpen] = useState(false);

  const yoyChartData = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const yCur = now.getFullYear();
    const yPrev = yCur - 1;
    const monthLabels = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return monthLabels.map((label, i) => {
      const cur = data.months.find((m) => m.year === yCur && m.monthIndex === i);
      const prev = data.months.find((m) => m.year === yPrev && m.monthIndex === i);
      return {
        month: label,
        [`${yCur}`]: cur?.total ?? 0,
        [`${yPrev}`]: prev?.total ?? 0,
      };
    });
  }, [data]);

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Evolução de Faturamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 animate-pulse bg-muted rounded-md" />
        </CardContent>
      </Card>
    );
  }

  const { summary, months } = data;
  const now = new Date();
  const yCur = now.getFullYear();
  const yPrev = yCur - 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolução de Faturamento</CardTitle>
        <p className="text-sm text-muted-foreground">
          Comparativo mês a mês e ano a ano (últimos 24 meses).
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Cards comparativos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Mês atual</p>
              <p className="text-xl font-semibold text-foreground">{formatBRL(summary.currentMonth)}</p>
              <p className="text-xs text-muted-foreground">
                Mês anterior: {formatBRL(summary.previousMonth)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">vs mês anterior (MoM)</p>
              <VariationBadge value={summary.momChange} />
              <p className="text-xs text-muted-foreground">Variação mensal</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">vs mesmo mês ano anterior (YoY)</p>
              <VariationBadge value={summary.yoyChange} />
              <p className="text-xs text-muted-foreground">
                Ano passado: {formatBRL(summary.sameMonthLastYear)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Acumulado {yCur}</p>
              <p className="text-xl font-semibold text-foreground">{formatBRL(summary.ytdCurrent)}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Acumulado {yPrev}</p>
              <p className="text-xl font-semibold text-foreground">{formatBRL(summary.ytdPrevious)}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Variação acumulada</p>
              <VariationBadge value={summary.ytdChange} />
              <p className="text-xs text-muted-foreground">{yCur} vs {yPrev}</p>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <Tabs defaultValue="mom" className="w-full">
          <TabsList>
            <TabsTrigger value="mom">Mês a Mês</TabsTrigger>
            <TabsTrigger value="yoy">Ano vs Ano</TabsTrigger>
          </TabsList>

          <TabsContent value="mom" className="pt-4">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={60} />
                  <YAxis tickFormatter={(v) => formatBRLCompact(v)} tick={{ fontSize: 11 }} width={80} />
                  <Tooltip
                    formatter={(v: number) => formatBRL(v)}
                    labelClassName="text-foreground"
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Legend />
                  <Bar dataKey="salao" stackId="a" name="Salão" fill="hsl(var(--primary))" />
                  <Bar dataKey="balcao" stackId="a" name="Balcão" fill="hsl(var(--muted-foreground))" />
                  <Bar dataKey="delivery" stackId="a" name="Delivery" fill="hsl(var(--accent-foreground))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="yoy" className="pt-4">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={yoyChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => formatBRLCompact(v)} tick={{ fontSize: 11 }} width={80} />
                  <Tooltip
                    formatter={(v: number) => formatBRL(v)}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey={`${yCur}`} stroke="hsl(var(--primary))" strokeWidth={2} dot />
                  <Line type="monotone" dataKey={`${yPrev}`} stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="4 4" dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>

        {/* Tabela detalhada */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="sm" onClick={() => setTableOpen((v) => !v)} className="gap-2">
              {tableOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {tableOpen ? "Ocultar tabela detalhada" : "Ver tabela detalhada"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCSV(months)} className="gap-2">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>
          {tableOpen && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Mês</th>
                    <th className="text-right p-2">Salão</th>
                    <th className="text-right p-2">Balcão</th>
                    <th className="text-right p-2">Delivery</th>
                    <th className="text-right p-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...months].reverse().map((m) => (
                    <tr key={m.month} className="border-b border-border/60">
                      <td className="p-2 text-foreground">{m.label}</td>
                      <td className="p-2 text-right">{formatBRL(m.salao)}</td>
                      <td className="p-2 text-right">{formatBRL(m.balcao)}</td>
                      <td className="p-2 text-right">{formatBRL(m.delivery)}</td>
                      <td className="p-2 text-right font-medium text-foreground">{formatBRL(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
