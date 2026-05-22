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

export default function DiscountsReport() {
  const { visibleUserId } = useEstablishmentId();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));

  const { data, isLoading } = useQuery({
    queryKey: ["report-discounts", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const { data: orders, error } = await supabase
        .from("pdv_orders")
        .select("id, order_number, customer_name, subtotal, discount, total, closed_at, closed_by_user_id, opened_by")
        .eq("user_id", visibleUserId!)
        .eq("status", "fechada")
        .gt("discount", 0)
        .gte("closed_at", start.toISOString())
        .lte("closed_at", end.toISOString())
        .order("closed_at", { ascending: false });
      if (error) throw error;

      const userIds = Array.from(new Set((orders || []).map((o: any) => o.closed_by_user_id || o.opened_by).filter(Boolean))) as string[];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
        : { data: [] as any[] };
      const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || "—"]));

      const { data: coupons } = await supabase
        .from("campaign_prize_wins")
        .select("id, customer_name, customer_whatsapp, coupon_code, is_redeemed, redeemed_at, created_at, campaign_id, prize_id")
        .eq("is_redeemed", true)
        .gte("redeemed_at", start.toISOString())
        .lte("redeemed_at", end.toISOString())
        .order("redeemed_at", { ascending: false });

      // Optional enrich coupons with campaign + prize names (best effort)
      const campaignIds = Array.from(new Set((coupons || []).map((c: any) => c.campaign_id).filter(Boolean)));
      const prizeIds = Array.from(new Set((coupons || []).map((c: any) => c.prize_id).filter(Boolean)));
      const [{ data: campaigns }, { data: prizes }] = await Promise.all([
        campaignIds.length ? supabase.from("evaluation_campaigns").select("id, name").in("id", campaignIds) : Promise.resolve({ data: [] as any[] }),
        prizeIds.length ? supabase.from("evaluation_prizes").select("id, name").in("id", prizeIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const campMap = new Map((campaigns || []).map((c: any) => [c.id, c.name]));
      const prizeMap = new Map((prizes || []).map((p: any) => [p.id, p.name]));

      return {
        orders: (orders || []).map((o: any) => ({
          ...o,
          user_name: nameMap.get(o.closed_by_user_id || o.opened_by) || "—",
        })),
        coupons: (coupons || []).map((c: any) => ({
          ...c,
          campaign_name: campMap.get(c.campaign_id) || "—",
          prize_name: prizeMap.get(c.prize_id) || "—",
        })),
      };
    },
  });

  const orders = data?.orders || [];
  const coupons = data?.coupons || [];

  const totals = useMemo(() => {
    const discount = orders.reduce((s, o: any) => s + Number(o.discount || 0), 0);
    const avg = orders.length > 0 ? orders.reduce((s, o: any) => s + Number(o.total || 0), 0) / orders.length : 0;
    return { discount, count: orders.length, avg, coupons: coupons.length };
  }, [orders, coupons]);

  const onExport = () => {
    exportToXlsx(`descontos-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Descontos Diretos",
        rows: orders.map((o: any) => ({
          data: o.closed_at, pedido: o.order_number, cliente: o.customer_name,
          subtotal: Number(o.subtotal || 0), desconto: Number(o.discount || 0), total: Number(o.total || 0), usuario: o.user_name,
        })),
        columns: [
          { key: "data", label: "Data", width: 18, type: "datetime" },
          { key: "pedido", label: "Pedido", width: 10, type: "number" },
          { key: "cliente", label: "Cliente", width: 26 },
          { key: "subtotal", label: "Subtotal", width: 14, type: "currency" },
          { key: "desconto", label: "Desconto", width: 14, type: "currency" },
          { key: "total", label: "Total", width: 14, type: "currency" },
          { key: "usuario", label: "Usuário", width: 22 },
        ],
      },
      {
        name: "Cupons Resgatados",
        rows: coupons.map((c: any) => ({
          data: c.redeemed_at, cupom: c.coupon_code, cliente: c.customer_name, whatsapp: c.customer_whatsapp,
          premio: c.prize_name, campanha: c.campaign_name,
        })),
        columns: [
          { key: "data", label: "Resgatado em", width: 18, type: "datetime" },
          { key: "cupom", label: "Cupom", width: 16 },
          { key: "cliente", label: "Cliente", width: 26 },
          { key: "whatsapp", label: "WhatsApp", width: 16 },
          { key: "premio", label: "Prêmio", width: 26 },
          { key: "campanha", label: "Campanha", width: 22 },
        ],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportPageHeader title="Descontos e Cupons" description={`Período: ${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`} onExport={onExport} exportDisabled={isLoading} />
      <ReportDateFilter startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Total descontos" value={formatBRL(totals.discount)} />
        <Kpi label="Pedidos com desconto" value={String(totals.count)} />
        <Kpi label="Ticket médio (c/ desc.)" value={formatBRL(totals.avg)} />
        <Kpi label="Cupons resgatados" value={String(totals.coupons)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Pedidos com desconto</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Usuário</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {orders.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum desconto no período</TableCell></TableRow> :
                  orders.map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-muted-foreground">{o.closed_at ? format(new Date(o.closed_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}</TableCell>
                      <TableCell>#{o.order_number ?? "—"}</TableCell>
                      <TableCell>{o.customer_name || "—"}</TableCell>
                      <TableCell className="text-right">{formatBRL(o.subtotal)}</TableCell>
                      <TableCell className="text-right">{formatBRL(o.discount)}</TableCell>
                      <TableCell className="text-right">{formatBRL(o.total)}</TableCell>
                      <TableCell>{o.user_name}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cupons resgatados</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Resgatado em</TableHead>
                <TableHead>Cupom</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Prêmio</TableHead>
                <TableHead>Campanha</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {coupons.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cupom resgatado</TableCell></TableRow> :
                  coupons.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-muted-foreground">{c.redeemed_at ? format(new Date(c.redeemed_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}</TableCell>
                      <TableCell className="font-mono">{c.coupon_code}</TableCell>
                      <TableCell>{c.customer_name || "—"}</TableCell>
                      <TableCell>{c.customer_whatsapp || "—"}</TableCell>
                      <TableCell>{c.prize_name}</TableCell>
                      <TableCell>{c.campaign_name}</TableCell>
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
