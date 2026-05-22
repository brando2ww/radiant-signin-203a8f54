import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface MonthRow {
  month: number;
  label: string;
  currentRevenue: number;
  currentOrders: number;
  currentTicket: number;
  prevRevenue: number;
  prevOrders: number;
  yoy: number; // %
}

export default function MonthlyReport() {
  const { visibleUserId } = useEstablishmentId();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-monthly", visibleUserId, year],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<MonthRow[]> => {
      const start = new Date(year - 1, 0, 1).toISOString();
      const end = new Date(year + 1, 0, 1).toISOString();
      const { data, error } = await supabase
        .from("pdv_orders")
        .select("total, closed_at")
        .eq("user_id", visibleUserId!)
        .eq("status", "fechada")
        .not("closed_at", "is", null)
        .gte("closed_at", start)
        .lt("closed_at", end);
      if (error) throw error;

      const buckets: Record<string, { revenue: number; orders: number }> = {};
      (data || []).forEach((o: any) => {
        const d = new Date(o.closed_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!buckets[key]) buckets[key] = { revenue: 0, orders: 0 };
        buckets[key].revenue += Number(o.total || 0);
        buckets[key].orders += 1;
      });

      return MONTHS.map((label, m) => {
        const cur = buckets[`${year}-${m}`] || { revenue: 0, orders: 0 };
        const prev = buckets[`${year - 1}-${m}`] || { revenue: 0, orders: 0 };
        const yoy = prev.revenue > 0 ? (cur.revenue - prev.revenue) / prev.revenue : 0;
        return {
          month: m,
          label,
          currentRevenue: cur.revenue,
          currentOrders: cur.orders,
          currentTicket: cur.orders > 0 ? cur.revenue / cur.orders : 0,
          prevRevenue: prev.revenue,
          prevOrders: prev.orders,
          yoy,
        };
      });
    },
  });

  const totals = useMemo(() => {
    const cur = rows.reduce((s, r) => s + r.currentRevenue, 0);
    const prev = rows.reduce((s, r) => s + r.prevRevenue, 0);
    const orders = rows.reduce((s, r) => s + r.currentOrders, 0);
    return {
      revenue: cur,
      orders,
      ticket: orders > 0 ? cur / orders : 0,
      yoy: prev > 0 ? (cur - prev) / prev : 0,
    };
  }, [rows]);

  const chartData = rows.map((r) => ({ name: r.label, atual: r.currentRevenue, anterior: r.prevRevenue }));

  const onExport = () => {
    exportToXlsx(`relatorio-mensal-${year}`, [
      {
        name: `Mensal ${year}`,
        rows: rows.map((r) => ({
          mes: r.label,
          pedidos: r.currentOrders,
          receita: r.currentRevenue,
          ticket_medio: r.currentTicket,
        })),
        columns: [
          { key: "mes", label: "Mês", width: 10 },
          { key: "pedidos", label: "Pedidos", width: 12, type: "number" },
          { key: "receita", label: "Receita", width: 16, type: "currency" },
          { key: "ticket_medio", label: "Ticket médio", width: 16, type: "currency" },
        ],
      },
      {
        name: `Comparativo ${year - 1} vs ${year}`,
        rows: rows.map((r) => ({
          mes: r.label,
          ano_anterior: r.prevRevenue,
          ano_atual: r.currentRevenue,
          variacao: r.yoy,
        })),
        columns: [
          { key: "mes", label: "Mês", width: 10 },
          { key: "ano_anterior", label: `${year - 1}`, width: 16, type: "currency" },
          { key: "ano_atual", label: `${year}`, width: 16, type: "currency" },
          { key: "variacao", label: "Variação", width: 12, type: "percent" },
        ],
      },
    ]);
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-4">
      <ReportPageHeader title="Mensal — Evolução e YoY" onExport={onExport} exportDisabled={isLoading} />
      <Card>
        <CardContent className="pt-6 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Ano:</span>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label={`Receita ${year}`} value={formatBRL(totals.revenue)} />
        <Kpi label="Pedidos" value={totals.orders.toLocaleString("pt-BR")} />
        <Kpi label="Ticket médio" value={formatBRL(totals.ticket)} />
        <Kpi label={`vs ${year - 1}`} value={`${(totals.yoy * 100).toFixed(1)}%`} />
      </div>

      <Card>
        <CardHeader><CardTitle>Comparativo {year - 1} vs {year}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[300px] w-full" /> : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis tickFormatter={(v) => formatBRLCompact(v)} className="text-xs" />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Legend />
                  <Bar dataKey="anterior" name={String(year - 1)} fill="hsl(var(--muted-foreground))" />
                  <Bar dataKey="atual" name={String(year)} fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Detalhe por mês</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Ticket médio</TableHead>
                  <TableHead className="text-right">{year - 1}</TableHead>
                  <TableHead className="text-right">YoY</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.month}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right">{r.currentOrders}</TableCell>
                    <TableCell className="text-right">{formatBRL(r.currentRevenue)}</TableCell>
                    <TableCell className="text-right">{formatBRL(r.currentTicket)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatBRL(r.prevRevenue)}</TableCell>
                    <TableCell className="text-right">{r.prevRevenue > 0 ? `${(r.yoy * 100).toFixed(1)}%` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="pt-6">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </CardContent></Card>
  );
}
