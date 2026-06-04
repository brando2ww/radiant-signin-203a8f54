import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { EmptyState } from "@/components/pdv/shared/EmptyState";
import { Users } from "lucide-react";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";
import { fetchPaymentsByOrderIds, fetchItemsByOrderIds } from "@/lib/reports-data-source";

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))", "hsl(var(--destructive))"];

interface UserRow {
  user_id: string;
  name: string;
  ordersOpened: number;
  ordersClosed: number;
  items: number;
  revenue: number;
  discount: number;
  cancelled: number;
  cancelledValue: number;
  avgTicket: number;
  firstSale: string | null;
  lastSale: string | null;
  topPaymentMethod: string;
  topPaymentPct: number;
}

const PM_LABELS: Record<string, string> = {
  pix: "Pix", cash: "Dinheiro", credit_card: "Crédito", debit_card: "Débito",
  voucher: "Voucher", others: "Outros", custom: "Outro",
};

export default function ByUserReport() {
  const { visibleUserId } = useEstablishmentId();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));

  const { data, isLoading } = useQuery({
    queryKey: ["report-by-user-v2", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const { data: orders, error } = await supabase
        .from("pdv_orders")
        .select("id, status, discount, opened_by, closed_by_user_id, opened_at, closed_at")
        .eq("user_id", visibleUserId!)
        .gte("opened_at", start.toISOString())
        .lte("opened_at", end.toISOString());
      if (error) throw error;

      const userIds = Array.from(new Set([
        ...(orders || []).map((o: any) => o.opened_by).filter(Boolean),
        ...(orders || []).map((o: any) => o.closed_by_user_id).filter(Boolean),
      ])) as string[];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
        : { data: [] as any[] };
      const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || "—"]));

      const orderIds = (orders || []).map((o: any) => o.id);
      const [items, paymentsByOrder] = await Promise.all([
        fetchItemsByOrderIds(orderIds),
        fetchPaymentsByOrderIds(orderIds),
      ]);

      const itemsByOrder = new Map<string, number>();
      items.forEach((it) => {
        itemsByOrder.set(it.order_id, (itemsByOrder.get(it.order_id) || 0) + it.quantity);
      });

      const orderToUser = new Map<string, string>();
      (orders || []).forEach((o: any) => {
        const uid = o.closed_by_user_id || o.opened_by;
        if (uid) orderToUser.set(o.id, uid);
      });

      // Pagamentos por usuário (forma de pagamento)
      const paymentsByUser = new Map<string, Map<string, number>>();
      paymentsByOrder.forEach((rev, orderId) => {
        const uid = orderToUser.get(orderId);
        if (!uid) return;
        if (!paymentsByUser.has(uid)) paymentsByUser.set(uid, new Map());
        const m = paymentsByUser.get(uid)!;
        Object.entries(rev.byMethod).forEach(([method, amt]) => {
          m.set(method, (m.get(method) || 0) + amt);
        });
      });

      const grouped = new Map<string, UserRow>();
      const ensure = (uid: string): UserRow => {
        if (!grouped.has(uid)) grouped.set(uid, {
          user_id: uid, name: nameMap.get(uid) || uid.slice(0, 8),
          ordersOpened: 0, ordersClosed: 0, items: 0, revenue: 0, discount: 0,
          cancelled: 0, cancelledValue: 0, avgTicket: 0,
          firstSale: null, lastSale: null, topPaymentMethod: "—", topPaymentPct: 0,
        });
        return grouped.get(uid)!;
      };

      (orders || []).forEach((o: any) => {
        if (o.opened_by) ensure(o.opened_by).ordersOpened += 1;
        const closedUid = o.closed_by_user_id || o.opened_by;
        if (!closedUid) return;
        const row = ensure(closedUid);
        const payRev = paymentsByOrder.get(o.id);
        const rev = payRev?.total || 0;
        if (o.status === "fechada") {
          if (rev > 0) row.ordersClosed += 1;
          row.revenue += rev;
          row.discount += Number(o.discount || 0);
          row.items += itemsByOrder.get(o.id) || 0;
          const t = payRev?.paidAt || o.closed_at || o.opened_at;
          if (t) {
            if (!row.firstSale || t < row.firstSale) row.firstSale = t;
            if (!row.lastSale || t > row.lastSale) row.lastSale = t;
          }
        } else if (o.status === "cancelada") {
          row.cancelled += 1;
          row.cancelledValue += rev;
        }
      });

      grouped.forEach((r) => {
        r.avgTicket = r.ordersClosed > 0 ? r.revenue / r.ordersClosed : 0;
        const pm = paymentsByUser.get(r.user_id);
        if (pm && pm.size > 0) {
          let top: [string, number] = ["—", 0];
          let total = 0;
          pm.forEach((v, k) => { total += v; if (v > top[1]) top = [k, v]; });
          r.topPaymentMethod = PM_LABELS[top[0]] || top[0];
          r.topPaymentPct = total > 0 ? top[1] / total : 0;
        }
      });

      return Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
    },
  });

  const rows = data || [];
  const totals = useMemo(() => ({
    users: rows.length,
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    orders: rows.reduce((s, r) => s + r.ordersClosed, 0),
    items: rows.reduce((s, r) => s + r.items, 0),
    cancelled: rows.reduce((s, r) => s + r.cancelled, 0),
    discount: rows.reduce((s, r) => s + r.discount, 0),
  }), [rows]);

  const topByTicket = useMemo(() => [...rows].sort((a, b) => b.avgTicket - a.avgTicket)[0], [rows]);
  const topByDiscount = useMemo(() => [...rows].sort((a, b) => b.discount - a.discount)[0], [rows]);
  const topByCancel = useMemo(() => [...rows].sort((a, b) => b.cancelled - a.cancelled)[0], [rows]);

  const pieData = useMemo(() => rows.slice(0, 6).map((r) => ({ name: r.name, value: r.revenue })), [rows]);

  const onExport = () => {
    exportToXlsx(`vendas-por-usuario-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Por Usuário",
        rows: rows.map((r) => ({
          usuario: r.name,
          pedidos_abertos: r.ordersOpened,
          pedidos_fechados: r.ordersClosed,
          itens: r.items,
          receita: r.revenue,
          ticket_medio: r.avgTicket,
          descontos: r.discount,
          pct_desconto: r.revenue > 0 ? r.discount / r.revenue : 0,
          cancelados: r.cancelled,
          valor_cancelado: r.cancelledValue,
          pct_cancel: r.ordersOpened > 0 ? r.cancelled / r.ordersOpened : 0,
          pagamento_top: r.topPaymentMethod,
          pagamento_top_pct: r.topPaymentPct,
          primeira_venda: r.firstSale,
          ultima_venda: r.lastSale,
        })),
        columns: [
          { key: "usuario", label: "Usuário", width: 26 },
          { key: "pedidos_abertos", label: "Abertos", width: 10, type: "number" },
          { key: "pedidos_fechados", label: "Fechados", width: 10, type: "number" },
          { key: "itens", label: "Itens", width: 10, type: "number" },
          { key: "receita", label: "Receita", width: 14, type: "currency" },
          { key: "ticket_medio", label: "Ticket médio", width: 14, type: "currency" },
          { key: "descontos", label: "Descontos", width: 14, type: "currency" },
          { key: "pct_desconto", label: "% desc.", width: 10, type: "percent" },
          { key: "cancelados", label: "Cancelados", width: 10, type: "number" },
          { key: "valor_cancelado", label: "Vlr cancel.", width: 14, type: "currency" },
          { key: "pct_cancel", label: "% cancel.", width: 10, type: "percent" },
          { key: "pagamento_top", label: "Pagamento top", width: 16 },
          { key: "pagamento_top_pct", label: "%", width: 8, type: "percent" },
          { key: "primeira_venda", label: "Primeira venda", width: 18, type: "datetime" },
          { key: "ultima_venda", label: "Última venda", width: 18, type: "datetime" },
        ],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportPageHeader title="Vendas por Usuário" description={`Período: ${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`} onExport={onExport} exportDisabled={isLoading || rows.length === 0} />
      <ReportDateFilter startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Operadores ativos" value={String(totals.users)} />
        <Kpi label="Receita total" value={formatBRL(totals.revenue)} />
        <Kpi label="Pedidos fechados" value={String(totals.orders)} />
        <Kpi label="Itens vendidos" value={totals.items.toLocaleString("pt-BR")} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Top vendedor (receita)" value={rows[0]?.name || "—"} />
        <Kpi label="Maior ticket médio" value={topByTicket ? `${topByTicket.name} — ${formatBRL(topByTicket.avgTicket)}` : "—"} />
        <Kpi label="+ descontos concedidos" value={topByDiscount && topByDiscount.discount > 0 ? `${topByDiscount.name} — ${formatBRL(topByDiscount.discount)}` : "—"} />
        <Kpi label="+ cancelamentos" value={topByCancel && topByCancel.cancelled > 0 ? `${topByCancel.name} (${topByCancel.cancelled})` : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Ranking de receita</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[300px] w-full" /> : rows.length === 0 ? (
              <EmptyState icon={Users} title="Sem vendas no período" className="h-[300px] py-0" />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={(v) => formatBRLCompact(v)} className="text-xs" />
                    <YAxis type="category" dataKey="name" width={110} className="text-xs" />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Bar dataKey="revenue" name="Receita" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Mix por usuário</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[300px] w-full" /> : pieData.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={100} label={(e: any) => `${((e.value / totals.revenue) * 100).toFixed(0)}%`}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Legend />
                  </PieChart>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="text-right">Fechados</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Ticket médio</TableHead>
                  <TableHead className="text-right">Descontos</TableHead>
                  <TableHead className="text-right">% desc.</TableHead>
                  <TableHead className="text-right">Cancel.</TableHead>
                  <TableHead>Pagamento top</TableHead>
                  <TableHead>Operação</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Sem dados</TableCell></TableRow> :
                    rows.map((r) => (
                      <TableRow key={r.user_id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right">{r.ordersClosed}</TableCell>
                        <TableCell className="text-right">{r.items}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.revenue)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.avgTicket)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.discount)}</TableCell>
                        <TableCell className="text-right">{r.revenue > 0 ? `${((r.discount / r.revenue) * 100).toFixed(1)}%` : "—"}</TableCell>
                        <TableCell className="text-right">{r.cancelled} {r.cancelledValue > 0 && <span className="text-xs text-muted-foreground">({formatBRL(r.cancelledValue)})</span>}</TableCell>
                        <TableCell>{r.topPaymentMethod !== "—" ? `${r.topPaymentMethod} ${(r.topPaymentPct * 100).toFixed(0)}%` : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.firstSale && r.lastSale ? `${format(new Date(r.firstSale), "HH:mm")} – ${format(new Date(r.lastSale), "HH:mm")}` : "—"}
                        </TableCell>
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

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-1 truncate">{value}</p></CardContent></Card>;
}
