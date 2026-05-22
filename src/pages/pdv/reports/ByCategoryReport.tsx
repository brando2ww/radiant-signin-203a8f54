import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";
import { previousPeriod, pctDelta, eachDay } from "@/lib/report-period";
import { fetchItemsByOrderIds } from "@/lib/reports-data-source";

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))", "hsl(var(--destructive))"];

interface CatRow {
  category: string;
  quantity: number;
  revenue: number;
  orders: Set<string>;
  share: number;
  avgTicket: number;
  avgPrice: number;
  prevRevenue: number;
  delta: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
}

export default function ByCategoryReport() {
  const { visibleUserId } = useEstablishmentId();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["report-by-category-v2", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const { prevStart, prevEnd } = previousPeriod(start, end);

      const fetchItems = async (s: Date, e: Date) => {
        const { data, error } = await supabase
          .from("pdv_order_items")
          .select("order_id, product_id, product_name, quantity, subtotal, order:pdv_orders!inner(user_id, status, closed_at)")
          .eq("order.user_id", visibleUserId!)
          .eq("order.status", "fechada")
          .gte("order.closed_at", s.toISOString())
          .lte("order.closed_at", e.toISOString());
        if (error) throw error;
        return data || [];
      };

      const [curItems, prevItems] = await Promise.all([fetchItems(start, end), fetchItems(prevStart, prevEnd)]);

      const allPids = Array.from(new Set([...curItems, ...prevItems].map((d: any) => d.product_id).filter(Boolean))) as string[];
      const { data: products } = allPids.length
        ? await supabase.from("pdv_products").select("id, category").in("id", allPids)
        : { data: [] as any[] };
      const catMap = new Map((products || []).map((p: any) => [p.id, p.category || "Sem categoria"]));

      const build = (items: any[]) => {
        const grouped = new Map<string, CatRow>();
        items.forEach((it: any) => {
          const cat = catMap.get(it.product_id) || "Sem categoria";
          if (!grouped.has(cat)) grouped.set(cat, {
            category: cat, quantity: 0, revenue: 0, orders: new Set(), share: 0,
            avgTicket: 0, avgPrice: 0, prevRevenue: 0, delta: 0, topProducts: [],
          });
          const r = grouped.get(cat)!;
          r.quantity += Number(it.quantity || 0);
          r.revenue += Number(it.subtotal || 0);
          if (it.order_id) r.orders.add(it.order_id);
        });
        return grouped;
      };

      const cur = build(curItems);
      const prev = build(prevItems);

      // Top products per category (current period)
      const productsByCat = new Map<string, Map<string, { name: string; quantity: number; revenue: number }>>();
      curItems.forEach((it: any) => {
        const cat = catMap.get(it.product_id) || "Sem categoria";
        if (!productsByCat.has(cat)) productsByCat.set(cat, new Map());
        const m = productsByCat.get(cat)!;
        const k = it.product_id || it.product_name;
        if (!m.has(k)) m.set(k, { name: it.product_name, quantity: 0, revenue: 0 });
        const r = m.get(k)!;
        r.quantity += Number(it.quantity || 0);
        r.revenue += Number(it.subtotal || 0);
      });

      const total = Array.from(cur.values()).reduce((s, r) => s + r.revenue, 0);
      cur.forEach((r) => {
        r.share = total > 0 ? r.revenue / total : 0;
        r.avgTicket = r.orders.size > 0 ? r.revenue / r.orders.size : 0;
        r.avgPrice = r.quantity > 0 ? r.revenue / r.quantity : 0;
        const p = prev.get(r.category);
        r.prevRevenue = p?.revenue || 0;
        r.delta = pctDelta(r.revenue, r.prevRevenue);
        const m = productsByCat.get(r.category);
        if (m) r.topProducts = Array.from(m.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      });

      // Daily evolution for top 5 categories
      const list = Array.from(cur.values()).sort((a, b) => b.revenue - a.revenue);
      const top5 = list.slice(0, 5).map((r) => r.category);
      const days = eachDay(start, end);
      const dailyRows = days.map((d) => {
        const row: any = { day: d };
        top5.forEach((c) => { row[c] = 0; });
        return row;
      });
      const dayIndex = new Map(dailyRows.map((r, i) => [r.day, i]));
      curItems.forEach((it: any) => {
        const cat = catMap.get(it.product_id) || "Sem categoria";
        if (!top5.includes(cat)) return;
        const closed = (it.order?.closed_at || "").slice(0, 10);
        const idx = dayIndex.get(closed);
        if (idx !== undefined) dailyRows[idx][cat] += Number(it.subtotal || 0);
      });

      return { rows: list, daily: dailyRows, top5 };
    },
  });

  const rows = data?.rows || [];
  const daily = data?.daily || [];
  const top5 = data?.top5 || [];

  const total = useMemo(() => rows.reduce((s, r) => s + r.revenue, 0), [rows]);
  const growing = useMemo(() => [...rows].filter((r) => r.prevRevenue > 0).sort((a, b) => b.delta - a.delta)[0], [rows]);

  const onExport = () => {
    exportToXlsx(`vendas-por-categoria-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Categorias",
        rows: rows.map((r) => ({
          categoria: r.category, quantidade: r.quantity, receita: r.revenue,
          pedidos: r.orders.size, ticket_medio: r.avgTicket, preco_medio: r.avgPrice,
          participacao: r.share, receita_anterior: r.prevRevenue, variacao: r.delta,
        })),
        columns: [
          { key: "categoria", label: "Categoria", width: 30 },
          { key: "quantidade", label: "Qtd", width: 10, type: "number" },
          { key: "pedidos", label: "Pedidos", width: 10, type: "number" },
          { key: "receita", label: "Receita", width: 14, type: "currency" },
          { key: "ticket_medio", label: "Ticket médio", width: 14, type: "currency" },
          { key: "preco_medio", label: "Preço médio", width: 14, type: "currency" },
          { key: "participacao", label: "%", width: 10, type: "percent" },
          { key: "receita_anterior", label: "Receita anterior", width: 16, type: "currency" },
          { key: "variacao", label: "Δ", width: 10, type: "percent" },
        ],
      },
      {
        name: "Top produtos por categoria",
        rows: rows.flatMap((r) => r.topProducts.map((p) => ({ categoria: r.category, produto: p.name, qtd: p.quantity, receita: p.revenue }))),
        columns: [
          { key: "categoria", label: "Categoria", width: 26 },
          { key: "produto", label: "Produto", width: 30 },
          { key: "qtd", label: "Qtd", width: 10, type: "number" },
          { key: "receita", label: "Receita", width: 14, type: "currency" },
        ],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportPageHeader title="Vendas por Categoria" description={`Período: ${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`} onExport={onExport} exportDisabled={isLoading || rows.length === 0} />
      <ReportDateFilter startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Categorias c/ venda" value={String(rows.length)} />
        <Kpi label="Receita total" value={formatBRL(total)} />
        <Kpi label="Top categoria" value={rows[0]?.category || "—"} />
        <Kpi label="Em crescimento" value={growing ? `${growing.category} (${(growing.delta * 100).toFixed(0)}%)` : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Receita por categoria</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[300px] w-full" /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows.slice(0, 12)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={(v) => formatBRLCompact(v)} className="text-xs" />
                    <YAxis type="category" dataKey="category" width={120} className="text-xs" />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Bar dataKey="revenue" name="Receita" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Evolução diária — top 5</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[300px] w-full" /> : top5.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" tickFormatter={(v) => v.slice(5)} />
                    <YAxis tickFormatter={(v) => formatBRLCompact(v)} className="text-xs" />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Legend />
                    {top5.map((c, i) => <Line key={c} type="monotone" dataKey={c} stroke={COLORS[i % COLORS.length]} dot={false} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Detalhamento</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
                <TableHead className="text-right">Preço médio</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Δ período</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Sem dados</TableCell></TableRow> :
                  rows.flatMap((r) => {
                    const isOpen = expanded === r.category;
                    const main = (
                      <TableRow key={r.category} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpanded(isOpen ? null : r.category)}>
                        <TableCell><Button variant="ghost" size="sm" className="h-6 w-6 p-0">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button></TableCell>
                        <TableCell className="font-medium">{r.category}</TableCell>
                        <TableCell className="text-right">{r.quantity.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right">{r.orders.size}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.avgTicket)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.avgPrice)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.revenue)}</TableCell>
                        <TableCell className="text-right">{(r.share * 100).toFixed(1)}%</TableCell>
                        <TableCell className={`text-right ${r.prevRevenue === 0 ? "text-muted-foreground" : r.delta >= 0 ? "" : "text-destructive"}`}>{r.prevRevenue > 0 ? `${r.delta >= 0 ? "+" : ""}${(r.delta * 100).toFixed(1)}%` : "—"}</TableCell>
                      </TableRow>
                    );
                    const expand = isOpen ? (
                      <TableRow key={r.category + "-exp"}>
                        <TableCell></TableCell>
                        <TableCell colSpan={8}>
                          <div className="bg-muted/30 rounded p-3">
                            <p className="text-xs font-medium mb-2 text-muted-foreground">Top 5 produtos</p>
                            {r.topProducts.length === 0 ? <p className="text-xs text-muted-foreground">Sem itens.</p> : (
                              <Table>
                                <TableHeader><TableRow>
                                  <TableHead>Produto</TableHead>
                                  <TableHead className="text-right">Qtd</TableHead>
                                  <TableHead className="text-right">Receita</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                  {r.topProducts.map((p, i) => (
                                    <TableRow key={i}>
                                      <TableCell>{p.name}</TableCell>
                                      <TableCell className="text-right">{p.quantity}</TableCell>
                                      <TableCell className="text-right">{formatBRL(p.revenue)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null;
                    return expand ? [main, expand] : [main];
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-1 truncate">{value}</p></CardContent></Card>;
}
