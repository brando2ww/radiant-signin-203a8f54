import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";

interface Row {
  product_id: string | null;
  product_name: string;
  category: string;
  quantity: number;
  revenue: number;
  orders: number;
  avgTicket: number;
  share: number;
}

export default function SalesByProductReport() {
  const { visibleUserId } = useEstablishmentId();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-sales-by-product", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<Row[]> => {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("pdv_order_items")
        .select("product_id, product_name, quantity, subtotal, order:pdv_orders!inner(user_id, status, closed_at, id)")
        .eq("order.user_id", visibleUserId!)
        .eq("order.status", "fechada")
        .gte("order.closed_at", start.toISOString())
        .lte("order.closed_at", end.toISOString());
      if (error) throw error;

      const productIds = Array.from(new Set((data || []).map((d: any) => d.product_id).filter(Boolean)));
      const { data: products } = productIds.length
        ? await supabase.from("pdv_products").select("id, category").in("id", productIds as string[])
        : { data: [] as any[] };
      const catMap = new Map((products || []).map((p: any) => [p.id, p.category || "Sem categoria"]));

      const grouped = new Map<string, Row>();
      const orderSet = new Map<string, Set<string>>();
      (data || []).forEach((it: any) => {
        const key = it.product_id || it.product_name;
        if (!grouped.has(key)) {
          grouped.set(key, {
            product_id: it.product_id,
            product_name: it.product_name,
            category: catMap.get(it.product_id) || "Sem categoria",
            quantity: 0, revenue: 0, orders: 0, avgTicket: 0, share: 0,
          });
          orderSet.set(key, new Set());
        }
        const row = grouped.get(key)!;
        row.quantity += Number(it.quantity || 0);
        row.revenue += Number(it.subtotal || 0);
        orderSet.get(key)!.add(it.order?.id);
      });
      const list = Array.from(grouped.values());
      list.forEach((r) => {
        r.orders = orderSet.get(r.product_id || r.product_name)?.size || 0;
        r.avgTicket = r.quantity > 0 ? r.revenue / r.quantity : 0;
      });
      const total = list.reduce((s, r) => s + r.revenue, 0);
      list.forEach((r) => { r.share = total > 0 ? r.revenue / total : 0; });
      return list.sort((a, b) => b.revenue - a.revenue);
    },
  });

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows]);
  const filtered = useMemo(
    () => rows.filter((r) => (category === "all" || r.category === category) && r.product_name.toLowerCase().includes(search.toLowerCase())),
    [rows, category, search],
  );

  const totals = useMemo(() => ({
    products: filtered.length,
    qty: filtered.reduce((s, r) => s + r.quantity, 0),
    revenue: filtered.reduce((s, r) => s + r.revenue, 0),
    orders: filtered.reduce((s, r) => s + r.orders, 0),
  }), [filtered]);

  const chartData = filtered.slice(0, 10).map((r) => ({ name: r.product_name, receita: r.revenue }));

  const onExport = () => {
    exportToXlsx(`vendas-por-produto-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Vendas por Produto",
        rows: filtered.map((r) => ({
          produto: r.product_name,
          categoria: r.category,
          quantidade: r.quantity,
          receita: r.revenue,
          ticket_medio_item: r.avgTicket,
          pedidos: r.orders,
          participacao: r.share,
        })),
        columns: [
          { key: "produto", label: "Produto", width: 36 },
          { key: "categoria", label: "Categoria", width: 22 },
          { key: "quantidade", label: "Qtd", width: 10, type: "number" },
          { key: "receita", label: "Receita", width: 16, type: "currency" },
          { key: "ticket_medio_item", label: "Ticket médio", width: 16, type: "currency" },
          { key: "pedidos", label: "Pedidos", width: 10, type: "number" },
          { key: "participacao", label: "% Receita", width: 12, type: "percent" },
        ],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportPageHeader
        title="Vendas por Produto"
        description={`Período: ${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`}
        onExport={onExport}
        exportDisabled={isLoading || filtered.length === 0}
      />
      <ReportDateFilter
        startDate={startDate}
        endDate={endDate}
        onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Produtos vendidos" value={String(totals.products)} />
        <KpiCard label="Qtd total" value={totals.qty.toLocaleString("pt-BR")} />
        <KpiCard label="Receita" value={formatBRL(totals.revenue)} />
        <KpiCard label="Pedidos distintos" value={String(totals.orders)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Top 10 por Receita</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados no período.</p>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatBRLCompact(v)} className="text-xs" />
                  <YAxis type="category" dataKey="name" width={140} className="text-xs" />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Bar dataKey="receita" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Detalhamento</CardTitle>
          <div className="flex items-center gap-2">
            <Input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Ticket médio</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">% Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sem dados</TableCell></TableRow>
                  ) : filtered.map((r) => (
                    <TableRow key={(r.product_id || r.product_name)}>
                      <TableCell className="font-medium">{r.product_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.category}</TableCell>
                      <TableCell className="text-right">{r.quantity.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{formatBRL(r.revenue)}</TableCell>
                      <TableCell className="text-right">{formatBRL(r.avgTicket)}</TableCell>
                      <TableCell className="text-right">{r.orders}</TableCell>
                      <TableCell className="text-right">{(r.share * 100).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
