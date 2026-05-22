import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";

interface UserRow {
  user_id: string;
  name: string;
  ordersOpened: number;
  ordersClosed: number;
  revenue: number;
  discount: number;
  cancelled: number;
  cancelledValue: number;
  avgTicket: number;
}

export default function ByUserReport() {
  const { visibleUserId } = useEstablishmentId();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));

  const { data, isLoading } = useQuery({
    queryKey: ["report-by-user", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const { data: orders, error } = await supabase
        .from("pdv_orders")
        .select("id, order_number, status, total, discount, opened_by, closed_by_user_id, opened_at, closed_at")
        .eq("user_id", visibleUserId!)
        .gte("opened_at", start.toISOString())
        .lte("opened_at", end.toISOString());
      if (error) throw error;

      const userIds = Array.from(new Set([
        ...((orders || []).map((o: any) => o.opened_by).filter(Boolean)),
        ...((orders || []).map((o: any) => o.closed_by_user_id).filter(Boolean)),
      ])) as string[];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
        : { data: [] as any[] };
      const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || "—"]));

      const grouped = new Map<string, UserRow>();
      const ensure = (uid: string): UserRow => {
        if (!grouped.has(uid)) grouped.set(uid, {
          user_id: uid, name: nameMap.get(uid) || uid.slice(0, 8),
          ordersOpened: 0, ordersClosed: 0, revenue: 0, discount: 0, cancelled: 0, cancelledValue: 0, avgTicket: 0,
        });
        return grouped.get(uid)!;
      };

      (orders || []).forEach((o: any) => {
        if (o.opened_by) ensure(o.opened_by).ordersOpened += 1;
        const closedUid = o.closed_by_user_id || o.opened_by;
        if (!closedUid) return;
        const row = ensure(closedUid);
        if (o.status === "fechada") {
          row.ordersClosed += 1;
          row.revenue += Number(o.total || 0);
          row.discount += Number(o.discount || 0);
        } else if (o.status === "cancelada") {
          row.cancelled += 1;
          row.cancelledValue += Number(o.total || 0);
        }
      });
      const list = Array.from(grouped.values());
      list.forEach((r) => { r.avgTicket = r.ordersClosed > 0 ? r.revenue / r.ordersClosed : 0; });
      return list.sort((a, b) => b.revenue - a.revenue);
    },
  });

  const rows = data || [];
  const totals = useMemo(() => ({
    users: rows.length,
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    orders: rows.reduce((s, r) => s + r.ordersClosed, 0),
  }), [rows]);

  const onExport = () => {
    exportToXlsx(`vendas-por-usuario-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Por Usuário",
        rows: rows.map((r) => ({
          usuario: r.name,
          pedidos_abertos: r.ordersOpened,
          pedidos_fechados: r.ordersClosed,
          receita: r.revenue,
          ticket_medio: r.avgTicket,
          descontos: r.discount,
          cancelados: r.cancelled,
          valor_cancelado: r.cancelledValue,
        })),
        columns: [
          { key: "usuario", label: "Usuário", width: 26 },
          { key: "pedidos_abertos", label: "Abertos", width: 12, type: "number" },
          { key: "pedidos_fechados", label: "Fechados", width: 12, type: "number" },
          { key: "receita", label: "Receita", width: 16, type: "currency" },
          { key: "ticket_medio", label: "Ticket médio", width: 16, type: "currency" },
          { key: "descontos", label: "Descontos", width: 14, type: "currency" },
          { key: "cancelados", label: "Cancelados", width: 12, type: "number" },
          { key: "valor_cancelado", label: "Vlr cancelado", width: 16, type: "currency" },
        ],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportPageHeader title="Vendas por Usuário" description={`Período: ${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`} onExport={onExport} exportDisabled={isLoading || rows.length === 0} />
      <ReportDateFilter startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Operadores ativos" value={String(totals.users)} />
        <Kpi label="Receita total" value={formatBRL(totals.revenue)} />
        <Kpi label="Top vendedor" value={rows[0]?.name || "—"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Detalhamento</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="text-right">Abertos</TableHead>
                  <TableHead className="text-right">Fechados</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Ticket médio</TableHead>
                  <TableHead className="text-right">Descontos</TableHead>
                  <TableHead className="text-right">Cancelados</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sem dados</TableCell></TableRow> :
                    rows.map((r) => (
                      <TableRow key={r.user_id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right">{r.ordersOpened}</TableCell>
                        <TableCell className="text-right">{r.ordersClosed}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.revenue)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.avgTicket)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.discount)}</TableCell>
                        <TableCell className="text-right">{r.cancelled} ({formatBRL(r.cancelledValue)})</TableCell>
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
