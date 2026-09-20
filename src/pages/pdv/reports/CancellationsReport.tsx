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
import { EmptyState } from "@/components/pdv/shared/EmptyState";
import { Ban } from "lucide-react";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportReport, brandedFromSheets } from "@/lib/reports/branded-export";
import { useReportBrand } from "@/hooks/use-report-brand";
import type { ExportKind } from "@/components/pdv/reports/ReportPageHeader";
import { periodLabel } from "@/components/pdv/reports/ReportShell";
import { eachDay } from "@/lib/report-period";
import { fetchPaymentsByOrderIds, brtRange, brtDateKey } from "@/lib/reports-data-source";
import { fetchCancelledSales, fetchCancelledItems, CATEGORIA_LABEL } from "@/lib/reports/cancellations";

interface CancelOrder {
  id: string;
  /** número da comanda · "#123" quando vem do pedido antigo */
  label: string;
  origin: "comanda" | "pedido";
  customer_name: string | null;
  total: number;
  itemCount: number;
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
      const { startISO, endISO } = brtRange(startDate, endDate);

      // Cancelamento mora na comanda, não no pedido (ver lib/reports/cancellations).
      const [{ sales, items: cancelItems }, itensAvulsos, closedRes] = await Promise.all([
        fetchCancelledSales(visibleUserId!, startISO, endISO),
        fetchCancelledItems(visibleUserId!, startISO, endISO),
        supabase
          .from("pdv_orders")
          .select("id")
          .eq("user_id", visibleUserId!)
          .eq("status", "fechada")
          .gte("opened_at", startISO)
          .lte("opened_at", endISO),
      ]);
      const closed = closedRes.data || [];

      // Base de comparação = receita dos pedidos fechados no período
      const closedPayments = await fetchPaymentsByOrderIds(closed.map((o: any) => o.id));
      let totalSales = 0;
      let totalClosedOrders = 0;
      closedPayments.forEach((r) => { totalSales += r.total; if (r.total > 0) totalClosedOrders += 1; });

      const userIds = Array.from(new Set([
        ...sales.map((v) => v.userId),
        ...itensAvulsos.map((i) => i.userId),
      ].filter(Boolean))) as string[];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
        : { data: [] as any[] };
      const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || "—"]));

      const orders: CancelOrder[] = sales.map((v) => ({
        id: v.id,
        label: v.label,
        origin: v.origin,
        customer_name: v.customerName,
        total: v.value,
        itemCount: v.itemCount,
        reason: v.reason,
        cancelled_at: v.cancelledAt,
        opened_at: v.openedAt,
        user_id: v.userId,
        user_name: (v.userId && nameMap.get(v.userId)) || "—",
        timeToCancelMin: v.cancelledAt && v.openedAt
          ? Math.max(0, (new Date(v.cancelledAt).getTime() - new Date(v.openedAt).getTime()) / 60000)
          : 0,
      }));

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
        const t = o.cancelled_at || o.opened_at;
        const k = t ? brtDateKey(t) : "";
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

      const itensCancelados = itensAvulsos.map((i) => ({
        ...i,
        userName: (i.userId && nameMap.get(i.userId)) || "—",
      }));

      return {
        orders,
        itensCancelados,
        itensValor: itensCancelados.reduce((acc, i) => acc + i.subtotal, 0),
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
  const itensCancelados = data?.itensCancelados || [];
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

  const { businessName } = useReportBrand();
  const rotuloPeriodo = periodLabel(startDate, endDate);

  const onExport = async (kind: ExportKind) => {
    await exportReport(kind, brandedFromSheets(
      {
        title: "Cancelamentos",
        businessName,
        periodLabel: rotuloPeriodo,
        filename: `cancelamentos-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`,
      },
      [
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
          data: o.cancelled_at, comanda: o.label, cliente: o.customer_name, itens: o.itemCount,
          valor: o.total, motivo: o.reason, usuario: o.user_name, tempo_min: o.timeToCancelMin,
        })),
        columns: [
          { key: "data", label: "Data", width: 18, type: "datetime" },
          { key: "comanda", label: "Comanda", width: 12 },
          { key: "cliente", label: "Cliente", width: 26 },
          { key: "itens", label: "Itens", width: 8, type: "number" },
          { key: "valor", label: "Valor", width: 14, type: "currency" },
          { key: "motivo", label: "Motivo", width: 30 },
          { key: "usuario", label: "Usuário", width: 22 },
          { key: "tempo_min", label: "Tempo (min)", width: 12, type: "number" },
        ],
      },
      {
        name: "Itens cancelados",
        rows: itensCancelados.map((i) => ({
          data: i.cancelledAt, comanda: i.comandaNumber, item: i.productName,
          qtd: i.quantity, valor: i.subtotal,
          motivo: [i.category ? (CATEGORIA_LABEL[i.category] || i.category) : "", i.reason || ""].filter(Boolean).join(" · "),
          usuario: i.userName,
        })),
        columns: [
          { key: "data", label: "Data", width: 18, type: "datetime" },
          { key: "comanda", label: "Comanda", width: 12 },
          { key: "item", label: "Item", width: 28 },
          { key: "qtd", label: "Qtd", width: 8, type: "number" },
          { key: "valor", label: "Valor", width: 14, type: "currency" },
          { key: "motivo", label: "Motivo", width: 34 },
          { key: "usuario", label: "Usuário", width: 22 },
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
    ],
    ));
  };

  const reasons = useMemo(() => ["all", ...Array.from(new Set(orders.map((o) => o.reason)))], [orders]);

  return (
    <div className="space-y-4">
      <ReportPageHeader title="Cancelamentos" description={`${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })} · por data do cancelamento`} onExport={onExport} exportDisabled={isLoading || orders.length === 0} />
      <ReportDateFilter startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Cancelamentos" value={String(totals.count)} />
        <Kpi label="Valor cancelado" value={formatBRL(totals.value)} />
        <Kpi label="Ticket médio cancelado" value={formatBRL(totals.avgTicket)} />
        <Kpi label="Tempo médio p/ cancelar" value={`${totals.avgTime.toFixed(0)} min`} />
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <Kpi label="Itens cancelados" value={`${itensCancelados.length} · ${formatBRL(data?.itensValor || 0)}`} />
        <Kpi label="% sobre receita" value={`${(totals.pctVal * 100).toFixed(1)}%`} />
        <Kpi label="% sobre pedidos" value={`${(totals.pctCnt * 100).toFixed(1)}%`} />
        <Kpi label="Top motivo" value={totals.topReason} />
        <Kpi label="Top usuário" value={totals.topUser} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Evolução diária</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[260px] w-full" /> : orders.length === 0 ? (
              <EmptyState icon={Ban} title="Sem cancelamentos no período" className="h-[260px] py-0" />
            ) : (
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
        <CardHeader>
          <CardTitle>Itens cancelados dentro da comanda</CardTitle>
          <p className="text-xs text-muted-foreground">
            Item que saiu da conta com a comanda seguindo aberta. Cada linha guarda quem cancelou, quando e por quê.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Comanda</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Usuário</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {itensCancelados.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum item cancelado no período</TableCell></TableRow>
                ) : itensCancelados.slice(0, 100).map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-muted-foreground">{format(new Date(i.cancelledAt), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                    <TableCell>{i.comandaNumber || "—"}</TableCell>
                    <TableCell className="font-medium">
                      {i.productName}
                      {i.foiParaCozinha && <span className="ml-2 text-[10px] text-amber-600">já tinha ido para a praça</span>}
                    </TableCell>
                    <TableCell className="text-right">{i.quantity}</TableCell>
                    <TableCell className="text-right">{formatBRL(i.subtotal)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.category ? (CATEGORIA_LABEL[i.category] || i.category) : "—"}
                      {i.reason ? ` · ${i.reason}` : ""}
                    </TableCell>
                    <TableCell>{i.userName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {itensCancelados.length > 100 && <p className="text-xs text-muted-foreground mt-2">Mostrando 100 de {itensCancelados.length}. Exporte para ver todos.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Comandas canceladas por inteiro</CardTitle>
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
                <TableHead>Comanda</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead className="text-right">Tempo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sem cancelamentos</TableCell></TableRow> :
                  filtered.slice(0, 100).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-muted-foreground">{o.cancelled_at ? format(new Date(o.cancelled_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}</TableCell>
                      <TableCell>{o.label}</TableCell>
                      <TableCell>{o.customer_name || "—"}</TableCell>
                      <TableCell className="text-right">{o.itemCount || "—"}</TableCell>
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
