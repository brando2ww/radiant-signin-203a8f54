import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { formatBRL } from "@/lib/format";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";

interface CancelOrder {
  id: string;
  order_number: number | null;
  customer_name: string | null;
  total: number;
  reason: string;
  cancelled_at: string | null;
  user_name: string;
}

export default function CancellationsReport() {
  const { visibleUserId } = useEstablishmentId();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));

  const { data, isLoading } = useQuery({
    queryKey: ["report-cancellations", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);

      const { data: cancelled, error } = await supabase
        .from("pdv_orders")
        .select("id, order_number, customer_name, total, cancellation_reason, cancelled_at, closed_by_user_id, opened_by, opened_at")
        .eq("user_id", visibleUserId!)
        .eq("status", "cancelada")
        .gte("opened_at", start.toISOString())
        .lte("opened_at", end.toISOString())
        .order("cancelled_at", { ascending: false });
      if (error) throw error;

      // total sales in period (for %)
      const { data: closed } = await supabase
        .from("pdv_orders")
        .select("total")
        .eq("user_id", visibleUserId!)
        .eq("status", "fechada")
        .gte("closed_at", start.toISOString())
        .lte("closed_at", end.toISOString());
      const totalSales = (closed || []).reduce((s, o: any) => s + Number(o.total || 0), 0);

      const userIds = Array.from(new Set((cancelled || []).map((o: any) => o.closed_by_user_id || o.opened_by).filter(Boolean))) as string[];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
        : { data: [] as any[] };
      const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || "—"]));

      const orders: CancelOrder[] = (cancelled || []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        customer_name: o.customer_name,
        total: Number(o.total || 0),
        reason: o.cancellation_reason || "Sem motivo",
        cancelled_at: o.cancelled_at,
        user_name: nameMap.get(o.closed_by_user_id || o.opened_by) || "—",
      }));

      const byReason = new Map<string, { reason: string; count: number; value: number }>();
      orders.forEach((o) => {
        if (!byReason.has(o.reason)) byReason.set(o.reason, { reason: o.reason, count: 0, value: 0 });
        const r = byReason.get(o.reason)!;
        r.count += 1; r.value += o.total;
      });

      return { orders, byReason: Array.from(byReason.values()).sort((a, b) => b.value - a.value), totalSales };
    },
  });

  const orders = data?.orders || [];
  const byReason = data?.byReason || [];
  const totals = useMemo(() => {
    const value = orders.reduce((s, o) => s + o.total, 0);
    return {
      count: orders.length,
      value,
      pct: data?.totalSales ? value / data.totalSales : 0,
      topReason: byReason[0]?.reason || "—",
    };
  }, [orders, byReason, data]);

  const onExport = () => {
    exportToXlsx(`cancelamentos-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Cancelamentos",
        rows: orders.map((o) => ({
          data: o.cancelled_at,
          pedido: o.order_number,
          cliente: o.customer_name,
          valor: o.total,
          motivo: o.reason,
          usuario: o.user_name,
        })),
        columns: [
          { key: "data", label: "Data", width: 18, type: "datetime" },
          { key: "pedido", label: "Pedido", width: 10, type: "number" },
          { key: "cliente", label: "Cliente", width: 26 },
          { key: "valor", label: "Valor", width: 14, type: "currency" },
          { key: "motivo", label: "Motivo", width: 30 },
          { key: "usuario", label: "Usuário", width: 22 },
        ],
      },
      {
        name: "Por motivo",
        rows: byReason.map((r) => ({ motivo: r.reason, qtd: r.count, valor: r.value })),
        columns: [
          { key: "motivo", label: "Motivo", width: 30 },
          { key: "qtd", label: "Qtd", width: 10, type: "number" },
          { key: "valor", label: "Valor", width: 14, type: "currency" },
        ],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportPageHeader title="Cancelamentos" description={`Período: ${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`} onExport={onExport} exportDisabled={isLoading || orders.length === 0} />
      <ReportDateFilter startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Cancelamentos" value={String(totals.count)} />
        <Kpi label="Valor cancelado" value={formatBRL(totals.value)} />
        <Kpi label="% sobre vendas" value={`${(totals.pct * 100).toFixed(1)}%`} />
        <Kpi label="Top motivo" value={totals.topReason} />
      </div>

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
                  <Tooltip formatter={(v: number, n: string) => n === "value" ? formatBRL(v) : v} />
                  <Bar dataKey="count" name="Qtd" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pedidos cancelados</CardTitle></CardHeader>
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
              </TableRow></TableHeader>
              <TableBody>
                {orders.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sem cancelamentos no período</TableCell></TableRow> :
                  orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-muted-foreground">{o.cancelled_at ? format(new Date(o.cancelled_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}</TableCell>
                      <TableCell>#{o.order_number ?? "—"}</TableCell>
                      <TableCell>{o.customer_name || "—"}</TableCell>
                      <TableCell className="text-right">{formatBRL(o.total)}</TableCell>
                      <TableCell>{o.reason}</TableCell>
                      <TableCell>{o.user_name}</TableCell>
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
  return <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-1 truncate">{value}</p></CardContent></Card>;
}
