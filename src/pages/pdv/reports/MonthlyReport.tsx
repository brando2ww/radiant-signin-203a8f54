import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, ComposedChart } from "recharts";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface MonthRow {
  month: number;
  label: string;
  currentRevenue: number;
  currentOrders: number;
  currentItems: number;
  currentTicket: number;
  prevRevenue: number;
  prevOrders: number;
  yoyRevenue: number;
  yoyOrders: number;
  ytdCurrent: number;
  ytdPrev: number;
  ma3: number;
}

export default function MonthlyReport() {
  const { visibleUserId } = useEstablishmentId();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [metric, setMetric] = useState<"revenue" | "orders" | "ticket">("revenue");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-monthly-v3", visibleUserId, year],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<MonthRow[]> => {
      const startISO = new Date(year - 1, 0, 1).toISOString();
      const endISO = new Date(year + 1, 0, 1).toISOString();

      // 1) Receita REAL do sistema = pdv_cashier_movements (type=venda)
      const { fetchCashierSalesByPeriod } = await import("@/lib/reports-data-source");
      const movements = await fetchCashierSalesByPeriod(visibleUserId!, startISO, endISO);

      // 2) Itens (apenas para "Itens vendidos") — comanda items + delivery items
      const [pdvOrdersRes, delItemsRes] = await Promise.all([
        supabase
          .from("pdv_orders")
          .select("id, opened_at")
          .eq("user_id", visibleUserId!)
          .eq("status", "fechada")
          .gte("opened_at", startISO)
          .lt("opened_at", endISO),
        supabase
          .from("delivery_order_items")
          .select("quantity, order:delivery_orders!inner(user_id, status, delivered_at, created_at)")
          .eq("order.user_id", visibleUserId!)
          .in("order.status", ["entregue", "delivered", "completed"])
          .gte("order.created_at", startISO)
          .lt("order.created_at", endISO),
      ]);
      const pdvOrderIds = (pdvOrdersRes.data || []).map((o: any) => o.id);
      const orderTime = new Map<string, string>(
        (pdvOrdersRes.data || []).map((o: any) => [o.id, o.opened_at]),
      );
      const pdvItems = pdvOrderIds.length
        ? await (await import("@/lib/reports-data-source")).fetchItemsByOrderIds(pdvOrderIds)
        : [];

      // Buckets por mês (year-month index)
      type Bucket = { revenue: number; salesCount: number; items: number };
      const buckets: Record<string, Bucket> = {};
      const ensure = (key: string): Bucket => {
        if (!buckets[key]) buckets[key] = { revenue: 0, salesCount: 0, items: 0 };
        return buckets[key];
      };

      movements.forEach((m) => {
        const d = new Date(m.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const b = ensure(key);
        b.revenue += m.amount;
        b.salesCount += 1;
      });

      pdvItems.forEach((it: any) => {
        const t = orderTime.get(it.order_id);
        if (!t) return;
        const d = new Date(t);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        ensure(key).items += Number(it.quantity || 0);
      });

      (delItemsRes.data || []).forEach((it: any) => {
        const t = it.order?.delivered_at || it.order?.created_at;
        if (!t) return;
        const d = new Date(t);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        ensure(key).items += Number(it.quantity || 0);
      });

      const list: MonthRow[] = MONTHS.map((label, m) => {
        const cur = buckets[`${year}-${m}`] || { revenue: 0, salesCount: 0, items: 0 };
        const prev = buckets[`${year - 1}-${m}`] || { revenue: 0, salesCount: 0, items: 0 };
        return {
          month: m,
          label,
          currentRevenue: cur.revenue,
          currentOrders: cur.salesCount,
          currentItems: cur.items,
          currentTicket: cur.salesCount > 0 ? cur.revenue / cur.salesCount : 0,
          prevRevenue: prev.revenue,
          prevOrders: prev.salesCount,
          yoyRevenue: prev.revenue > 0 ? (cur.revenue - prev.revenue) / prev.revenue : 0,
          yoyOrders: prev.salesCount > 0 ? (cur.salesCount - prev.salesCount) / prev.salesCount : 0,
          ytdCurrent: 0, ytdPrev: 0, ma3: 0,
        };
      });

      let accCur = 0, accPrev = 0;
      list.forEach((r, i) => {
        accCur += r.currentRevenue; accPrev += r.prevRevenue;
        r.ytdCurrent = accCur; r.ytdPrev = accPrev;
        const window = list.slice(Math.max(0, i - 2), i + 1);
        r.ma3 = window.reduce((s, x) => s + x.currentRevenue, 0) / window.length;
      });

      return list;
    },
  });


  const totals = useMemo(() => {
    const cur = rows.reduce((s, r) => s + r.currentRevenue, 0);
    const prev = rows.reduce((s, r) => s + r.prevRevenue, 0);
    const orders = rows.reduce((s, r) => s + r.currentOrders, 0);
    const items = rows.reduce((s, r) => s + r.currentItems, 0);
    const withSales = rows.filter((r) => r.currentRevenue > 0);
    const best = withSales.reduce<MonthRow | null>((a, b) => !a || b.currentRevenue > a.currentRevenue ? b : a, null);
    const worst = withSales.reduce<MonthRow | null>((a, b) => !a || b.currentRevenue < a.currentRevenue ? b : a, null);
    return {
      revenue: cur,
      orders,
      items,
      ticket: orders > 0 ? cur / orders : 0,
      yoy: prev > 0 ? (cur - prev) / prev : 0,
      best, worst,
    };
  }, [rows]);

  const chartData = rows.map((r) => ({
    name: r.label,
    atual: metric === "revenue" ? r.currentRevenue : metric === "orders" ? r.currentOrders : r.currentTicket,
    anterior: metric === "revenue" ? r.prevRevenue : metric === "orders" ? r.prevOrders : (r.prevOrders > 0 ? r.prevRevenue / r.prevOrders : 0),
  }));

  const ytdChart = rows.map((r) => ({ name: r.label, [`${year}`]: r.ytdCurrent, [`${year - 1}`]: r.ytdPrev, ma3: r.ma3 }));

  const onExport = () => {
    exportToXlsx(`relatorio-mensal-${year}`, [
      {
        name: `Mensal ${year}`,
        rows: rows.map((r) => ({
          mes: r.label,
          pedidos: r.currentOrders,
          itens: r.currentItems,
          receita: r.currentRevenue,
          ticket_medio: r.currentTicket,
          ma3: r.ma3,
          ytd: r.ytdCurrent,
        })),
        columns: [
          { key: "mes", label: "Mês", width: 10 },
          { key: "pedidos", label: "Pedidos", width: 12, type: "number" },
          { key: "itens", label: "Itens", width: 12, type: "number" },
          { key: "receita", label: "Receita", width: 16, type: "currency" },
          { key: "ticket_medio", label: "Ticket médio", width: 16, type: "currency" },
          { key: "ma3", label: "Média móvel 3m", width: 16, type: "currency" },
          { key: "ytd", label: "YTD", width: 16, type: "currency" },
        ],
      },
      {
        name: `Comparativo ${year - 1} vs ${year}`,
        rows: rows.map((r) => ({
          mes: r.label,
          ano_anterior: r.prevRevenue,
          ano_atual: r.currentRevenue,
          variacao: r.yoyRevenue,
          pedidos_anterior: r.prevOrders,
          pedidos_atual: r.currentOrders,
          variacao_pedidos: r.yoyOrders,
        })),
        columns: [
          { key: "mes", label: "Mês", width: 10 },
          { key: "ano_anterior", label: `Receita ${year - 1}`, width: 16, type: "currency" },
          { key: "ano_atual", label: `Receita ${year}`, width: 16, type: "currency" },
          { key: "variacao", label: "Δ Receita", width: 10, type: "percent" },
          { key: "pedidos_anterior", label: `Pedidos ${year - 1}`, width: 14, type: "number" },
          { key: "pedidos_atual", label: `Pedidos ${year}`, width: 14, type: "number" },
          { key: "variacao_pedidos", label: "Δ Pedidos", width: 10, type: "percent" },
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
        <Kpi label="Itens vendidos" value={totals.items.toLocaleString("pt-BR")} />
        <Kpi label={`vs ${year - 1}`} value={`${(totals.yoy * 100).toFixed(1)}%`} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Ticket médio" value={formatBRL(totals.ticket)} />
        <Kpi label="Melhor mês" value={totals.best ? `${totals.best.label} — ${formatBRL(totals.best.currentRevenue)}` : "—"} />
        <Kpi label="Pior mês (c/ venda)" value={totals.worst ? `${totals.worst.label} — ${formatBRL(totals.worst.currentRevenue)}` : "—"} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Comparativo {year - 1} vs {year}</CardTitle>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as any)}>
            <TabsList>
              <TabsTrigger value="revenue">Receita</TabsTrigger>
              <TabsTrigger value="orders">Pedidos</TabsTrigger>
              <TabsTrigger value="ticket">Ticket médio</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[300px] w-full" /> : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis tickFormatter={(v) => metric === "orders" ? String(v) : formatBRLCompact(v)} className="text-xs" />
                  <Tooltip formatter={(v: number) => metric === "orders" ? v.toLocaleString("pt-BR") : formatBRL(v)} />
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
        <CardHeader><CardTitle>Acumulado YTD + Sazonalidade (média móvel 3m)</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[300px] w-full" /> : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={ytdChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis tickFormatter={(v) => formatBRLCompact(v)} className="text-xs" />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Legend />
                  <Line type="monotone" dataKey={`${year - 1}`} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey={`${year}`} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ma3" name="Média móvel 3m" stroke="hsl(var(--accent))" strokeWidth={1.5} dot={false} />
                </ComposedChart>
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
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Ticket médio</TableHead>
                  <TableHead className="text-right">{year - 1}</TableHead>
                  <TableHead className="text-right">YoY Receita</TableHead>
                  <TableHead className="text-right">YoY Pedidos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.month}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right">{r.currentOrders}</TableCell>
                    <TableCell className="text-right">{r.currentItems}</TableCell>
                    <TableCell className="text-right">{formatBRL(r.currentRevenue)}</TableCell>
                    <TableCell className="text-right">{formatBRL(r.currentTicket)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatBRL(r.prevRevenue)}</TableCell>
                    <TableCell className={`text-right ${r.prevRevenue > 0 ? (r.yoyRevenue >= 0 ? "" : "text-destructive") : "text-muted-foreground"}`}>
                      {r.prevRevenue > 0 ? `${r.yoyRevenue >= 0 ? "+" : ""}${(r.yoyRevenue * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell className={`text-right ${r.prevOrders > 0 ? (r.yoyOrders >= 0 ? "" : "text-destructive") : "text-muted-foreground"}`}>
                      {r.prevOrders > 0 ? `${r.yoyOrders >= 0 ? "+" : ""}${(r.yoyOrders * 100).toFixed(1)}%` : "—"}
                    </TableCell>
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
      <p className="text-xl font-bold mt-1 truncate">{value}</p>
    </CardContent></Card>
  );
}
