import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { usePDVReports } from "@/hooks/use-pdv-reports";
import { ReportSummaryCards } from "@/components/pdv/ReportSummaryCards";
import { PaymentMethodChart } from "@/components/pdv/PaymentMethodChart";
import { ProductsTable } from "@/components/pdv/ProductsTable";
import { HourlySalesChart } from "@/components/pdv/HourlySalesChart";
import { MonthlyRevenueSection } from "@/components/pdv/MonthlyRevenueSection";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { exportToXlsx } from "@/lib/xlsx-export";
import { previousPeriod, pctDelta, fmtDelta } from "@/lib/report-period";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function OverviewReport() {
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const { visibleUserId } = useEstablishmentId();
  const { salesReport, paymentReport, productReport, hourlyReport, isLoading } = usePDVReports(startDate, endDate);

  const { data: extra, isLoading: extraLoading } = useQuery({
    queryKey: ["report-overview-extra", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const { prevStart, prevEnd } = previousPeriod(start, end);

      const [curRes, prevRes, itemsRes] = await Promise.all([
        supabase
          .from("pdv_orders")
          .select("id, total, discount, status, customer_id, customer_name, closed_at, cancelled_at, opened_at")
          .eq("user_id", visibleUserId!)
          .gte("opened_at", start.toISOString())
          .lte("opened_at", end.toISOString()),
        supabase
          .from("pdv_orders")
          .select("total, status")
          .eq("user_id", visibleUserId!)
          .gte("opened_at", prevStart.toISOString())
          .lte("opened_at", prevEnd.toISOString()),
        supabase
          .from("pdv_order_items")
          .select("quantity, subtotal, product_id, order:pdv_orders!inner(user_id, status, closed_at)")
          .eq("order.user_id", visibleUserId!)
          .eq("order.status", "fechada")
          .gte("order.closed_at", start.toISOString())
          .lte("order.closed_at", end.toISOString()),
      ]);

      const curOrders = curRes.data || [];
      const prevOrders = prevRes.data || [];
      const items = itemsRes.data || [];

      const closed = curOrders.filter((o: any) => o.status === "fechada");
      const cancelled = curOrders.filter((o: any) => o.status === "cancelada");
      const revenue = closed.reduce((s, o: any) => s + Number(o.total || 0), 0);
      const totalDiscount = closed.reduce((s, o: any) => s + Number(o.discount || 0), 0);
      const totalItems = items.reduce((s, it: any) => s + Number(it.quantity || 0), 0);
      const cancelledRate = curOrders.length > 0 ? cancelled.length / curOrders.length : 0;

      const prevClosed = prevOrders.filter((o: any) => o.status === "fechada");
      const prevRevenue = prevClosed.reduce((s, o: any) => s + Number(o.total || 0), 0);
      const prevAvgTicket = prevClosed.length > 0 ? prevRevenue / prevClosed.length : 0;
      const curAvgTicket = closed.length > 0 ? revenue / closed.length : 0;

      // Weekday
      const wd = WEEKDAYS.map((label, i) => ({ day: label, idx: i, revenue: 0, orders: 0 }));
      closed.forEach((o: any) => {
        const t = o.closed_at || o.opened_at;
        if (!t) return;
        const d = new Date(t).getDay();
        wd[d].revenue += Number(o.total || 0);
        wd[d].orders += 1;
      });

      // Top customers
      const byCust = new Map<string, { id: string; name: string; revenue: number; orders: number }>();
      closed.forEach((o: any) => {
        const id = o.customer_id || o.customer_name || "anon";
        if (id === "anon" || !o.customer_name) return;
        if (!byCust.has(id)) byCust.set(id, { id, name: o.customer_name, revenue: 0, orders: 0 });
        const r = byCust.get(id)!;
        r.revenue += Number(o.total || 0);
        r.orders += 1;
      });
      const topCustomers = Array.from(byCust.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

      // Top categories
      const pids = Array.from(new Set(items.map((it: any) => it.product_id).filter(Boolean))) as string[];
      const { data: products } = pids.length
        ? await supabase.from("pdv_products").select("id, category").in("id", pids)
        : { data: [] as any[] };
      const catMap = new Map((products || []).map((p: any) => [p.id, p.category || "Sem categoria"]));
      const byCat = new Map<string, number>();
      items.forEach((it: any) => {
        const c = catMap.get(it.product_id) || "Sem categoria";
        byCat.set(c, (byCat.get(c) || 0) + Number(it.subtotal || 0));
      });
      const topCategories = Array.from(byCat.entries()).map(([category, revenue]) => ({ category, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 3);

      return {
        revenue, totalDiscount, totalItems, cancelledRate,
        prevRevenue, prevAvgTicket, curAvgTicket,
        avgItemsPerOrder: closed.length > 0 ? totalItems / closed.length : 0,
        discountPct: revenue > 0 ? totalDiscount / revenue : 0,
        revenueDelta: pctDelta(revenue, prevRevenue),
        ticketDelta: pctDelta(curAvgTicket, prevAvgTicket),
        weekday: wd,
        topCustomers,
        topCategories,
      };
    },
  });

  const onExport = () => {
    exportToXlsx(`visao-geral-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Resumo",
        rows: [
          { metrica: "Total de vendas", valor: salesReport?.totalSales ?? 0 },
          { metrica: "Total de pedidos", valor: salesReport?.totalOrders ?? 0 },
          { metrica: "Ticket médio", valor: salesReport?.averageTicket ?? 0 },
          { metrica: "Itens vendidos", valor: extra?.totalItems ?? 0 },
          { metrica: "Itens por pedido", valor: extra?.avgItemsPerOrder ?? 0 },
          { metrica: "% desconto", valor: extra?.discountPct ?? 0 },
          { metrica: "% cancelamento", valor: extra?.cancelledRate ?? 0 },
          { metrica: "Δ receita vs período anterior", valor: extra?.revenueDelta ?? 0 },
        ],
        columns: [{ key: "metrica", label: "Métrica", width: 30 }, { key: "valor", label: "Valor", width: 16, type: "number" }],
      },
      {
        name: "Pagamentos",
        rows: (paymentReport || []).map((p) => ({ metodo: p.method, qtd: p.count, total: p.total, participacao: p.percentage / 100 })),
        columns: [
          { key: "metodo", label: "Método", width: 22 },
          { key: "qtd", label: "Qtd", width: 10, type: "number" },
          { key: "total", label: "Total", width: 14, type: "currency" },
          { key: "participacao", label: "%", width: 10, type: "percent" },
        ],
      },
      {
        name: "Produtos",
        rows: (productReport || []).map((p) => ({ produto: p.product_name, qtd: p.quantity, receita: p.revenue, pedidos: p.orders })),
        columns: [
          { key: "produto", label: "Produto", width: 30 },
          { key: "qtd", label: "Qtd", width: 10, type: "number" },
          { key: "receita", label: "Receita", width: 14, type: "currency" },
          { key: "pedidos", label: "Pedidos", width: 10, type: "number" },
        ],
      },
      {
        name: "Por hora",
        rows: (hourlyReport || []).map((h) => ({ hora: `${h.hour}h`, pedidos: h.orders, vendas: h.sales, ticket_medio: h.averageTicket })),
        columns: [
          { key: "hora", label: "Hora", width: 10 },
          { key: "pedidos", label: "Pedidos", width: 10, type: "number" },
          { key: "vendas", label: "Vendas", width: 14, type: "currency" },
          { key: "ticket_medio", label: "Ticket médio", width: 14, type: "currency" },
        ],
      },
      {
        name: "Dia da semana",
        rows: (extra?.weekday || []).map((d) => ({ dia: d.day, pedidos: d.orders, receita: d.revenue })),
        columns: [{ key: "dia", label: "Dia", width: 8 }, { key: "pedidos", label: "Pedidos", width: 10, type: "number" }, { key: "receita", label: "Receita", width: 14, type: "currency" }],
      },
      {
        name: "Top clientes",
        rows: (extra?.topCustomers || []).map((c) => ({ cliente: c.name, pedidos: c.orders, receita: c.revenue })),
        columns: [{ key: "cliente", label: "Cliente", width: 30 }, { key: "pedidos", label: "Pedidos", width: 10, type: "number" }, { key: "receita", label: "Receita", width: 14, type: "currency" }],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportPageHeader
        title="Visão Geral"
        description={`Período: ${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`}
        onExport={onExport}
        exportDisabled={isLoading}
      />
      <ReportDateFilter startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
      <ReportSummaryCards data={salesReport} isLoading={isLoading} />

      {/* Comparativo período anterior */}
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Itens vendidos" value={extra ? extra.totalItems.toLocaleString("pt-BR") : "—"} loading={extraLoading} />
        <Kpi label="Itens/pedido" value={extra ? extra.avgItemsPerOrder.toFixed(1) : "—"} loading={extraLoading} />
        <Kpi label="% desconto médio" value={extra ? `${(extra.discountPct * 100).toFixed(1)}%` : "—"} loading={extraLoading} />
        <Kpi label="% cancelamento" value={extra ? `${(extra.cancelledRate * 100).toFixed(1)}%` : "—"} loading={extraLoading} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Kpi
          label="Receita vs período anterior"
          value={extra ? `${formatBRL(extra.prevRevenue)} → ${formatBRL(extra.revenue)}` : "—"}
          hint={extra ? fmtDelta(extra.revenueDelta) : ""}
          loading={extraLoading}
        />
        <Kpi
          label="Ticket médio vs período anterior"
          value={extra ? `${formatBRL(extra.prevAvgTicket)} → ${formatBRL(extra.curAvgTicket)}` : "—"}
          hint={extra ? fmtDelta(extra.ticketDelta) : ""}
          loading={extraLoading}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PaymentMethodChart data={paymentReport} isLoading={isLoading} />
        <HourlySalesChart data={hourlyReport} isLoading={isLoading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Receita por dia da semana</CardTitle></CardHeader>
          <CardContent>
            {extraLoading ? <Skeleton className="h-[240px] w-full" /> : (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={extra?.weekday || []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" />
                    <YAxis tickFormatter={(v) => formatBRLCompact(v)} className="text-xs" />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Bar dataKey="revenue" name="Receita" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top 5 clientes</CardTitle></CardHeader>
          <CardContent>
            {extraLoading ? <Skeleton className="h-48 w-full" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(extra?.topCustomers || []).length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sem clientes identificados</TableCell></TableRow> :
                    extra!.topCustomers.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">{c.orders}</TableCell>
                        <TableCell className="text-right">{formatBRL(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Top 3 categorias</CardTitle></CardHeader>
        <CardContent>
          {extraLoading ? <Skeleton className="h-24 w-full" /> : (extra?.topCategories || []).length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
            <div className="grid gap-3 md:grid-cols-3">
              {extra!.topCategories.map((c, i) => (
                <div key={i} className="border rounded-md p-3">
                  <p className="text-xs text-muted-foreground">{i + 1}º lugar</p>
                  <p className="font-semibold truncate">{c.category}</p>
                  <p className="text-lg font-bold mt-1">{formatBRL(c.revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ProductsTable data={productReport} isLoading={isLoading} />
      <MonthlyRevenueSection />
    </div>
  );
}

function Kpi({ label, value, hint, loading }: { label: string; value: string; hint?: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="h-7 w-24 mt-1" /> : <p className="text-xl font-bold mt-1 truncate">{value}</p>}
        {hint && <p className={`text-xs mt-1 ${hint.startsWith("+") ? "text-foreground" : "text-destructive"}`}>{hint}</p>}
      </CardContent>
    </Card>
  );
}
