import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";
import { eachDay } from "@/lib/report-period";
import { fetchPaymentsByOrderIds, fetchItemsByOrderIds, aggregateItemsByOrder } from "@/lib/reports-data-source";

interface CancelOrder {
  id: string;
  order_number: number | null;
  customer_name: string | null;
  total: number;
  reason: string;
  cancelled_at: string | null;
  opened_at: string | null;
  user_id: string | null;
  user_name: string;
  timeToCancelMin: number;
}

export default function CancellationsReport() {
  const { visibleUserId } = useEstablishmentId();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const [reasonFilter, setReasonFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["report-cancellations-v2", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);

      const [cancelledRes, closedRes] = await Promise.all([
        supabase
          .from("pdv_orders")
          .select("id, order_number, customer_name, cancellation_reason, cancelled_at, opened_at, closed_by_user_id, opened_by")
          .eq("user_id", visibleUserId!)
          .eq("status", "cancelada")
          .gte("opened_at", start.toISOString())
          .lte("opened_at", end.toISOString())
          .order("cancelled_at", { ascending: false }),
        supabase
          .from("pdv_orders")
          .select("id")
          .eq("user_id", visibleUserId!)
          .eq("status", "fechada")
          .gte("opened_at", start.toISOString())
          .lte("opened_at", end.toISOString()),
      ]);
      if (cancelledRes.error) throw cancelledRes.error;
      const cancelled = cancelledRes.data || [];
      const closed = closedRes.data || [];

      // Revenue base = closed payments
      const closedPayments = await fetchPaymentsByOrderIds(closed.map((o: any) => o.id));
      let totalSales = 0;
      let totalClosedOrders = 0;
      closedPayments.forEach((r) => { totalSales += r.total; if (r.total > 0) totalClosedOrders += 1; });

      // Cancelled order value = sum of comanda items (no payments expected)
      const cancelIds = cancelled.map((o: any) => o.id);
      const cancelItems = await fetchItemsByOrderIds(cancelIds);
      const cancelValByOrder = aggregateItemsByOrder(cancelItems);

      const userIds = Array.from(new Set(cancelled.map((o: any) => o.closed_by_user_id || o.opened_by).filter(Boolean))) as string[];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
        : { data: [] as any[] };
      const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || "—"]));

      // Fallback de nome do cliente via pdv_comandas
      const comandaNameMap = new Map<string, string>();
      if (cancelIds.length) {
        const { data: comandas } = await supabase
          .from("pdv_comandas")
          .select("order_id, customer_name")
          .in("order_id", cancelIds);
        (comandas || []).forEach((c: any) => {
          const n = (c.customer_name || "").trim();
          if (!n) return;
          const existing = comandaNameMap.get(c.order_id);
          // prefere nome real ao invés de "Mesa ..."
          if (!existing || (/^mesa\b/i.test(existing) && !/^mesa\b/i.test(n))) {
            comandaNameMap.set(c.order_id, n);
          }
        });
      }

      const orders: CancelOrder[] = cancelled.map((o: any) => {
        const uid = o.closed_by_user_id || o.opened_by;
        const ttm = o.cancelled_at && o.opened_at
          ? (new Date(o.cancelled_at).getTime() - new Date(o.opened_at).getTime()) / 60000
          : 0;
        const displayName = (o.customer_name && String(o.customer_name).trim()) || comandaNameMap.get(o.id) || "";
        return {
          id: o.id,
          order_number: o.order_number,
          customer_name: displayName,
          total: cancelValByOrder.get(o.id)?.revenue || 0,
          reason: o.cancellation_reason || "Sem motivo",
          cancelled_at: o.cancelled_at,
          opened_at: o.opened_at,
          user_id: uid,
          user_name: nameMap.get(uid) || "—",
          timeToCancelMin: ttm,
        };
      });

      // Per reason
      const byReason = new Map<string, { reason: string; count: number; value: number }>();
      orders.forEach((o) => {
        if (!byReason.has(o.reason)) byReason.set(o.reason, { reason: o.reason, count: 0, value: 0 });
        const r = byReason.get(o.reason)!;
        r.count += 1; r.value += o.total;
      });

      // Per user
      const byUser = new Map<string, { user_id: string; name: string; count: number; value: number }>();
      orders.forEach((o) => {
        const uid = o.user_id || "unknown";
        if (!byUser.has(uid)) byUser.set(uid, { user_id: uid, name: o.user_name, count: 0, value: 0 });
        const r = byUser.get(uid)!;
        r.count += 1; r.value += o.total;
      });

      // Per day
      const days = eachDay(start, end);
      const byDay = new Map(days.map((d) => [d, { day: d, count: 0, value: 0 }]));
      orders.forEach((o) => {
        const k = (o.cancelled_at || o.opened_at || "").slice(0, 10);
        if (byDay.has(k)) {
          const r = byDay.get(k)!;
          r.count += 1; r.value += o.total;
        }
      });

      // Items in cancelled orders
      const byItem = new Map<string, { name: string; qty: number; value: number }>();
      cancelItems.forEach((it) => {
        const k = it.product_name || "—";
        if (!byItem.has(k)) byItem.set(k, { name: k, qty: 0, value: 0 });
        const r = byItem.get(k)!;
        r.qty += it.quantity;
        r.value += it.subtotal;
      });

      return {
        orders,
        byReason: Array.from(byReason.values()).sort((a, b) => b.count - a.count),
        byUser: Array.from(byUser.values()).sort((a, b) => b.count - a.count),
        byDay: Array.from(byDay.values()),
        byItem: Array.from(byItem.values()).sort((a, b) => b.qty - a.qty).slice(0, 10),
        totalSales,
        totalClosedOrders,
      };
    },
  });

  const orders = data?.orders || [];
  const byReason = data?.byReason || [];
  const byUser = data?.byUser || [];
  const byDay = data?.byDay || [];
  const byItem = data?.byItem || [];

  const filtered = useMemo(() => reasonFilter === "all" ? orders : orders.filter((o) => o.reason === reasonFilter), [orders, reasonFilter]);

  const totals = useMemo(() => {
    const value = orders.reduce((s, o) => s + o.total, 0);
    const avgTicket = orders.length > 0 ? value / orders.length : 0;
    const avgTime = orders.length > 0 ? orders.reduce((s, o) => s + o.timeToCancelMin, 0) / orders.length : 0;
    const pctVal = data?.totalSales ? value / data.totalSales : 0;
    const pctCnt = data?.totalClosedOrders ? orders.length / (data.totalClosedOrders + orders.length) : 0;
    return {
      count: orders.length,
      value,
      avgTicket,
      avgTime,
      pctVal,
      pctCnt,
      topReason: byReason[0]?.reason || "—",
      topUser: byUser[0]?.name || "—",
    };
  }, [orders, byReason, byUser, data]);

  const onExport = () => {
    exportToXlsx(`cancelamentos-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Resumo",
        rows: [
          { metrica: "Cancelamentos", valor: totals.count },
          { metrica: "Valor cancelado", valor: totals.value },
          { metrica: "Ticket médio cancelado", valor: totals.avgTicket },
          { metrica: "% sobre receita", valor: totals.pctVal },
          { metrica: "% sobre nº de pedidos", valor: totals.pctCnt },
          { metrica: "Tempo médio até cancelar (min)", valor: totals.avgTime },
        ],
        columns: [{ key: "metrica", label: "Métrica", width: 30 }, { key: "valor", label: "Valor", width: 16, type: "number" }],
      },
      {
        name: "Cancelamentos",
        rows: orders.map((o) => ({
          data: o.cancelled_at, pedido: o.order_number, cliente: o.customer_name,
          valor: o.total, motivo: o.reason, usuario: o.user_name, tempo_min: o.timeToCancelMin,
        })),
        columns: [
          { key: "data", label: "Data", width: 18, type: "datetime" },
          { key: "pedido", label: "Pedido", width: 10, type: "number" },
          { key: "cliente", label: "Cliente", width: 26 },
          { key: "valor", label: "Valor", width: 14, type: "currency" },
          { key: "motivo", label: "Motivo", width: 30 },
          { key: "usuario", label: "Usuário", width: 22 },
          { key: "tempo_min", label: "Tempo (min)", width: 12, type: "number" },
        ],
      },
      {
        name: "Por motivo",
        rows: byReason.map((r) => ({ motivo: r.reason, qtd: r.count, valor: r.value })),
        columns: [{ key: "motivo", label: "Motivo", width: 30 }, { key: "qtd", label: "Qtd", width: 10, type: "number" }, { key: "valor", label: "Valor", width: 14, type: "currency" }],
      },
      {
        name: "Por usuário",
        rows: byUser.map((u) => ({ usuario: u.name, qtd: u.count, valor: u.value })),
        columns: [{ key: "usuario", label: "Usuário", width: 26 }, { key: "qtd", label: "Qtd", width: 10, type: "number" }, { key: "valor", label: "Valor", width: 14, type: "currency" }],
      },
      {
        name: "Por dia",
        rows: byDay.map((d) => ({ data: d.day, qtd: d.count, valor: d.value })),
        columns: [{ key: "data", label: "Data", width: 14, type: "date" }, { key: "qtd", label: "Qtd", width: 10, type: "number" }, { key: "valor", label: "Valor", width: 14, type: "currency" }],
      },
      {
        name: "Top itens cancelados",
        rows: byItem.map((i) => ({ produto: i.name, qtd: i.qty, valor: i.value })),
        columns: [{ key: "produto", label: "Produto", width: 30 }, { key: "qtd", label: "Qtd", width: 10, type: "number" }, { key: "valor", label: "Valor", width: 14, type: "currency" }],
      },
    ]);
  };

  const reasons = useMemo(() => ["all", ...Array.from(new Set(orders.map((o) => o.reason)))], [orders]);

  return (
    <div className="space-y-4">
      <ReportPageHeader title="Cancelamentos" description={`Período: ${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`} onExport={onExport} exportDisabled={isLoading || orders.length === 0} />
      <ReportDateFilter startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Cancelamentos" value={String(totals.count)} />
        <Kpi label="Valor cancelado" value={formatBRL(totals.value)} />
        <Kpi label="Ticket médio cancelado" value={formatBRL(totals.avgTicket)} />
        <Kpi label="Tempo médio p/ cancelar" value={`${totals.avgTime.toFixed(0)} min`} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="% sobre receita" value={`${(totals.pctVal * 100).toFixed(1)}%`} />
        <Kpi label="% sobre pedidos" value={`${(totals.pctCnt * 100).toFixed(1)}%`} />
        <Kpi label="Top motivo" value={totals.topReason} />
        <Kpi label="Top usuário" value={totals.topUser} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Evolução diária</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[260px] w-full" /> : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={byDay}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" tickFormatter={(v) => v.slice(5)} />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" name="Qtd" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top motivos</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[260px] w-full" /> : byReason.length === 0 ? <p className="text-sm text-muted-foreground">Sem cancelamentos.</p> : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byReason.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="reason" className="text-xs" tickFormatter={(v) => v.length > 16 ? v.slice(0, 16) + "…" : v} />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="count" name="Qtd" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Por usuário</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {byUser.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">—</TableCell></TableRow> :
                    byUser.map((u) => (
                      <TableRow key={u.user_id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-right">{u.count}</TableCell>
                        <TableCell className="text-right">{formatBRL(u.value)}</TableCell>
                        <TableCell className="text-right">{totals.count > 0 ? `${((u.count / totals.count) * 100).toFixed(1)}%` : "—"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top itens cancelados</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {byItem.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">—</TableCell></TableRow> :
                    byItem.map((i, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{i.name}</TableCell>
                        <TableCell className="text-right">{i.qty}</TableCell>
                        <TableCell className="text-right">{formatBRL(i.value)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pedidos cancelados</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Motivo:</span>
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="w-56 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {reasons.map((r) => <SelectItem key={r} value={r}>{r === "all" ? "Todos" : r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead className="text-right">Tempo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sem cancelamentos</TableCell></TableRow> :
                  filtered.slice(0, 100).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-muted-foreground">{o.cancelled_at ? format(new Date(o.cancelled_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}</TableCell>
                      <TableCell>#{o.order_number ?? "—"}</TableCell>
                      <TableCell>{o.customer_name || "—"}</TableCell>
                      <TableCell className="text-right">{formatBRL(o.total)}</TableCell>
                      <TableCell>{o.reason}</TableCell>
                      <TableCell>{o.user_name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{o.timeToCancelMin > 0 ? `${o.timeToCancelMin.toFixed(0)} min` : "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
          {filtered.length > 100 && <p className="text-xs text-muted-foreground mt-2">Mostrando 100 de {filtered.length}. Exporte para Excel para ver todos.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-1 truncate">{value}</p></CardContent></Card>;
}
