import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";
import { eachDay } from "@/lib/report-period";
import { fetchCashierSalesByPeriod } from "@/lib/reports-data-source";

export default function DiscountsReport() {
  const { visibleUserId } = useEstablishmentId();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const [visibleCount, setVisibleCount] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ["report-discounts-v3", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const [discOrdersRes, pdvOrdersRes, couponsRedeemedRes, couponsGeneratedRes, cashierMovs] = await Promise.all([
        supabase
          .from("delivery_orders")
          .select("id, order_number, customer_id, customer_name, customer_phone, subtotal, discount, total, delivery_fee, coupon_code, created_at, status")
          .eq("user_id", visibleUserId!)
          .gt("discount", 0)
          .not("status", "in", "(cancelled,cancelado)")
          .gte("created_at", startISO)
          .lte("created_at", endISO)
          .order("created_at", { ascending: false }),
        supabase
          .from("pdv_orders")
          .select("id, order_number, customer_name, subtotal, discount, total, source, table_id, closed_at, created_at, status")
          .eq("user_id", visibleUserId!)
          .gt("discount", 0)
          .not("status", "in", "(cancelled,cancelado,aberta,open,cancelada)")
          .gte("created_at", startISO)
          .lte("created_at", endISO)
          .order("created_at", { ascending: false }),
        supabase
          .from("campaign_prize_wins")
          .select("id, customer_name, customer_whatsapp, coupon_code, is_redeemed, redeemed_at, created_at, campaign_id, prize_id")
          .eq("is_redeemed", true)
          .gte("redeemed_at", startISO)
          .lte("redeemed_at", endISO)
          .order("redeemed_at", { ascending: false }),
        supabase
          .from("campaign_prize_wins")
          .select("id, is_redeemed, created_at, redeemed_at")
          .gte("created_at", startISO)
          .lte("created_at", endISO),
        fetchCashierSalesByPeriod(visibleUserId!, startISO, endISO),
      ]);

      if (discOrdersRes.error) throw discOrdersRes.error;
      if (pdvOrdersRes.error) throw pdvOrdersRes.error;
      const rawOrders = discOrdersRes.data || [];
      const rawPdvOrders = pdvOrdersRes.data || [];
      const couponsRedeemed = couponsRedeemedRes.data || [];
      const couponsGenerated = couponsGeneratedRes.data || [];

      const totalRevenue = (cashierMovs || []).reduce((s, m) => s + Number(m.amount || 0), 0);

      const campaignIds = Array.from(new Set(couponsRedeemed.map((c: any) => c.campaign_id).filter(Boolean))) as string[];
      const prizeIds = Array.from(new Set(couponsRedeemed.map((c: any) => c.prize_id).filter(Boolean))) as string[];
      const [{ data: campaigns }, { data: prizes }] = await Promise.all([
        campaignIds.length ? supabase.from("evaluation_campaigns").select("id, name").in("id", campaignIds) : Promise.resolve({ data: [] as any[] }),
        prizeIds.length ? supabase.from("campaign_prizes").select("id, name").in("id", prizeIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const campMap = new Map((campaigns || []).map((c: any) => [c.id, c.name]));
      const prizeMap = new Map((prizes || []).map((p: any) => [p.id, p.name]));

      const missingNameIds = Array.from(new Set(
        rawOrders
          .filter((o: any) => !(o.customer_name && String(o.customer_name).trim()) && o.customer_id)
          .map((o: any) => o.customer_id)
      )) as string[];
      const customersMap = new Map<string, string>();
      if (missingNameIds.length) {
        const { data: custs } = await supabase
          .from("delivery_customers")
          .select("id, name")
          .in("id", missingNameIds);
        (custs || []).forEach((c: any) => {
          if (c?.id && c?.name) customersMap.set(c.id, c.name);
        });
      }

      const deliveryOrders = rawOrders.map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        customer_name: (o.customer_name && String(o.customer_name).trim())
          || customersMap.get(o.customer_id)
          || "",
        subtotal: Number(o.subtotal || 0),
        discount: Number(o.discount || 0),
        total: Number(o.total || 0),
        coupon_code: o.coupon_code || null,
        origin: "Delivery" as const,
        closed_at: o.created_at,
        created_at: o.created_at,
      }));

      const pdvOrders = rawPdvOrders.map((o: any) => {
        const src = String(o.source || "").toLowerCase();
        const origin: "Salão" | "Balcão" =
          src === "salao" || src === "salão" || src === "mesa" || o.table_id
            ? "Salão"
            : "Balcão";
        return {
          id: o.id,
          order_number: o.order_number,
          customer_name: o.customer_name || "",
          subtotal: Number(o.subtotal || 0),
          discount: Number(o.discount || 0),
          total: Number(o.total || 0),
          coupon_code: null as string | null,
          origin,
          closed_at: o.closed_at || o.created_at,
          created_at: o.created_at,
        };
      });

      const orders = [...deliveryOrders, ...pdvOrders].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const couponsEnriched = couponsRedeemed.map((c: any) => ({
        ...c,
        campaign_name: campMap.get(c.campaign_id) || "—",
        prize_name: prizeMap.get(c.prize_id) || "—",
        leadTimeHours: c.redeemed_at && c.created_at
          ? (new Date(c.redeemed_at).getTime() - new Date(c.created_at).getTime()) / 36e5
          : 0,
      }));

      // Aggregation by coupon code
      const byCoupon = new Map<string, { coupon: string; count: number; discount: number; revenue: number; subtotal: number }>();
      orders.forEach((o) => {
        const k = o.coupon_code || "(sem cupom)";
        if (!byCoupon.has(k)) byCoupon.set(k, { coupon: k, count: 0, discount: 0, revenue: 0, subtotal: 0 });
        const r = byCoupon.get(k)!;
        r.count += 1;
        r.discount += o.discount;
        r.revenue += o.total;
        r.subtotal += o.subtotal;
      });

      // Aggregation by origin (Delivery / Salão / Balcão)
      const byOrigin = new Map<string, { origin: string; count: number; discount: number; revenue: number }>(
        [
          ["Delivery", { origin: "Delivery", count: 0, discount: 0, revenue: 0 }],
          ["Salão", { origin: "Salão", count: 0, discount: 0, revenue: 0 }],
          ["Balcão", { origin: "Balcão", count: 0, discount: 0, revenue: 0 }],
        ]
      );
      orders.forEach((o) => {
        const r = byOrigin.get(o.origin)!;
        r.count += 1;
        r.discount += o.discount;
        r.revenue += o.total;
      });

      // Daily evolution
      const days = eachDay(start, end);
      const byDay = new Map(days.map((d) => [d, { day: d, discount: 0, count: 0 }]));
      orders.forEach((o) => {
        const k = (o.created_at || "").slice(0, 10);
        if (byDay.has(k)) {
          const r = byDay.get(k)!;
          r.discount += o.discount;
          r.count += 1;
        }
      });

      // By campaign / prize (cupons resgatados)
      const byCampaign = new Map<string, { campaign: string; prize: string; count: number }>();
      couponsEnriched.forEach((c: any) => {
        const k = `${c.campaign_name}__${c.prize_name}`;
        if (!byCampaign.has(k)) byCampaign.set(k, { campaign: c.campaign_name, prize: c.prize_name, count: 0 });
        byCampaign.get(k)!.count += 1;
      });

      return {
        orders,
        coupons: couponsEnriched,
        totalRevenue,
        byCoupon: Array.from(byCoupon.values()).sort((a, b) => b.discount - a.discount),
        byOrigin: Array.from(byOrigin.values()),
        byDay: Array.from(byDay.values()),
        byCampaign: Array.from(byCampaign.values()).sort((a, b) => b.count - a.count),
        couponsGenerated: couponsGenerated.length,
        couponsRedeemedCount: couponsRedeemed.length,
        couponsAvgLeadHours: couponsEnriched.length > 0
          ? couponsEnriched.reduce((s, c: any) => s + c.leadTimeHours, 0) / couponsEnriched.length
          : 0,
      };
    },
  });

  const orders = data?.orders || [];

  useEffect(() => {
    setVisibleCount(10);
  }, [startDate, endDate, orders.length]);
  const coupons = data?.coupons || [];
  const byCoupon = data?.byCoupon || [];
  const byDay = data?.byDay || [];
  const byCampaign = data?.byCampaign || [];

  const totals = useMemo(() => {
    const discount = orders.reduce((s, o: any) => s + Number(o.discount || 0), 0);
    const subtotal = orders.reduce((s, o: any) => s + Number(o.subtotal || 0), 0);
    const totalSum = orders.reduce((s, o: any) => s + Number(o.total || 0), 0);
    const avgDiscount = orders.length > 0 ? discount / orders.length : 0;
    const avgTicket = orders.length > 0 ? totalSum / orders.length : 0;
    const pctOverSubtotal = subtotal > 0 ? discount / subtotal : 0;
    const pctOverGlobalRevenue = (data?.totalRevenue ?? 0) > 0 ? discount / (data!.totalRevenue) : 0;
    const maxDiscount = orders.reduce((m: number, o: any) => Math.max(m, Number(o.discount || 0)), 0);
    const redemptionRate = (data?.couponsGenerated ?? 0) > 0 ? (data!.couponsRedeemedCount) / (data!.couponsGenerated) : 0;
    return {
      discount, count: orders.length, avgDiscount, avgTicket,
      pctOverSubtotal, pctOverGlobalRevenue, maxDiscount,
      coupons: coupons.length, redemptionRate,
      couponsAvgLeadHours: data?.couponsAvgLeadHours ?? 0,
    };
  }, [orders, coupons, data]);

  const onExport = () => {
    exportToXlsx(`descontos-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Resumo",
        rows: [
          { metrica: "Total descontos", valor: totals.discount },
          { metrica: "Pedidos com desconto", valor: totals.count },
          { metrica: "Desconto médio por pedido", valor: totals.avgDiscount },
          { metrica: "% desconto / subtotal", valor: totals.pctOverSubtotal },
          { metrica: "% desconto / receita total", valor: totals.pctOverGlobalRevenue },
          { metrica: "Maior desconto único", valor: totals.maxDiscount },
          { metrica: "Cupons gerados", valor: data?.couponsGenerated ?? 0 },
          { metrica: "Cupons resgatados", valor: totals.coupons },
          { metrica: "Taxa de resgate", valor: totals.redemptionRate },
          { metrica: "Tempo médio até resgate (h)", valor: totals.couponsAvgLeadHours },
        ],
        columns: [
          { key: "metrica", label: "Métrica", width: 32 },
          { key: "valor", label: "Valor", width: 16, type: "number" },
        ],
      },
      {
        name: "Descontos Diretos",
        rows: orders.map((o: any) => ({
          data: o.created_at, pedido: o.order_number, cliente: o.customer_name,
          subtotal: Number(o.subtotal || 0), desconto: Number(o.discount || 0), total: Number(o.total || 0), cupom: o.coupon_code || "—",
          pct: Number(o.subtotal || 0) > 0 ? Number(o.discount || 0) / Number(o.subtotal || 0) : 0,
        })),
        columns: [
          { key: "data", label: "Data", width: 18, type: "datetime" },
          { key: "pedido", label: "Pedido", width: 10, type: "number" },
          { key: "cliente", label: "Cliente", width: 26 },
          { key: "subtotal", label: "Subtotal", width: 14, type: "currency" },
          { key: "desconto", label: "Desconto", width: 14, type: "currency" },
          { key: "pct", label: "% desc.", width: 10, type: "percent" },
          { key: "total", label: "Total", width: 14, type: "currency" },
          { key: "cupom", label: "Cupom", width: 16 },
        ],
      },
      {
        name: "Por Cupom",
        rows: byCoupon.map((u) => ({
          cupom: u.coupon, pedidos: u.count, desconto_total: u.discount,
          desconto_medio: u.count > 0 ? u.discount / u.count : 0,
          receita: u.revenue, pct: u.revenue > 0 ? u.discount / u.revenue : 0,
        })),
        columns: [
          { key: "cupom", label: "Cupom", width: 20 },
          { key: "pedidos", label: "Pedidos", width: 10, type: "number" },
          { key: "desconto_total", label: "Desconto total", width: 16, type: "currency" },
          { key: "desconto_medio", label: "Desconto médio", width: 16, type: "currency" },
          { key: "receita", label: "Receita", width: 16, type: "currency" },
          { key: "pct", label: "% s/ receita", width: 12, type: "percent" },
        ],
      },
      {
        name: "Evolução Diária",
        rows: byDay.map((d) => ({ data: d.day, pedidos: d.count, desconto: d.discount })),
        columns: [
          { key: "data", label: "Data", width: 14, type: "date" },
          { key: "pedidos", label: "Pedidos", width: 10, type: "number" },
          { key: "desconto", label: "Desconto", width: 14, type: "currency" },
        ],
      },
      {
        name: "Cupons Resgatados",
        rows: coupons.map((c: any) => ({
          data: c.redeemed_at, cupom: c.coupon_code, cliente: c.customer_name, whatsapp: c.customer_whatsapp,
          premio: c.prize_name, campanha: c.campaign_name, tempo_resgate_h: c.leadTimeHours,
        })),
        columns: [
          { key: "data", label: "Resgatado em", width: 18, type: "datetime" },
          { key: "cupom", label: "Cupom", width: 16 },
          { key: "cliente", label: "Cliente", width: 26 },
          { key: "whatsapp", label: "WhatsApp", width: 16 },
          { key: "premio", label: "Prêmio", width: 26 },
          { key: "campanha", label: "Campanha", width: 22 },
          { key: "tempo_resgate_h", label: "Tempo até resgate (h)", width: 16, type: "number" },
        ],
      },
      {
        name: "Por Campanha",
        rows: byCampaign.map((c) => ({ campanha: c.campaign, premio: c.prize, resgatados: c.count })),
        columns: [
          { key: "campanha", label: "Campanha", width: 26 },
          { key: "premio", label: "Prêmio", width: 26 },
          { key: "resgatados", label: "Resgatados", width: 12, type: "number" },
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
        <Kpi label="Desconto médio" value={formatBRL(totals.avgDiscount)} />
        <Kpi label="Maior desconto" value={formatBRL(totals.maxDiscount)} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="% desc. / subtotal" value={`${(totals.pctOverSubtotal * 100).toFixed(1)}%`} />
        <Kpi label="% desc. / receita total" value={`${(totals.pctOverGlobalRevenue * 100).toFixed(1)}%`} />
        <Kpi label="Ticket médio (c/ desc.)" value={formatBRL(totals.avgTicket)} />
        <Kpi label="Cupons resgatados" value={String(totals.coupons)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Evolução diária de descontos</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[260px] w-full" /> : byDay.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={byDay}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" tickFormatter={(v) => v.slice(5)} />
                    <YAxis className="text-xs" tickFormatter={(v) => formatBRLCompact(v)} />
                    <Tooltip formatter={(v: number) => formatBRL(v)} labelFormatter={(l) => `Data: ${l}`} />
                    <Line type="monotone" dataKey="discount" name="Desconto" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cupons: geração x resgate</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Gerados no período" value={String(data?.couponsGenerated ?? 0)} />
              <Kpi label="Resgatados" value={String(totals.coupons)} />
              <Kpi label="Taxa de resgate" value={`${(totals.redemptionRate * 100).toFixed(1)}%`} />
              <Kpi label="Tempo médio resgate" value={`${totals.couponsAvgLeadHours.toFixed(1)} h`} />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Top campanhas / prêmios</p>
              {byCampaign.length === 0 ? <p className="text-xs text-muted-foreground">Sem cupons resgatados.</p> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Prêmio</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {byCampaign.slice(0, 5).map((c, i) => (
                      <TableRow key={i}>
                        <TableCell>{c.campaign}</TableCell>
                        <TableCell>{c.prize}</TableCell>
                        <TableCell className="text-right">{c.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Descontos por cupom</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cupom</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Desconto total</TableHead>
                <TableHead className="text-right">Desconto médio</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">% s/ receita</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {byCoupon.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum desconto</TableCell></TableRow> :
                  byCoupon.map((u) => (
                    <TableRow key={u.coupon}>
                      <TableCell className="font-mono font-medium">{u.coupon}</TableCell>
                      <TableCell className="text-right">{u.count}</TableCell>
                      <TableCell className="text-right">{formatBRL(u.discount)}</TableCell>
                      <TableCell className="text-right">{formatBRL(u.count > 0 ? u.discount / u.count : 0)}</TableCell>
                      <TableCell className="text-right">{formatBRL(u.revenue)}</TableCell>
                      <TableCell className="text-right">{u.revenue > 0 ? `${((u.discount / u.revenue) * 100).toFixed(1)}%` : "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
                <TableHead className="text-right">% desc.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Cupom</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {orders.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum desconto no período</TableCell></TableRow> :
                  orders.slice(0, visibleCount).map((o: any) => {
                    const pct = Number(o.subtotal || 0) > 0 ? (Number(o.discount || 0) / Number(o.subtotal || 0)) * 100 : 0;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="text-muted-foreground">{o.created_at ? format(new Date(o.created_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}</TableCell>
                        <TableCell>#{o.order_number ?? "—"}</TableCell>
                        <TableCell>{o.customer_name || "—"}</TableCell>
                        <TableCell className="text-right">{formatBRL(o.subtotal)}</TableCell>
                        <TableCell className="text-right">{formatBRL(o.discount)}</TableCell>
                        <TableCell className="text-right">{pct.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{formatBRL(o.total)}</TableCell>
                        <TableCell className="font-mono">{o.coupon_code || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
          {orders.length > visibleCount && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">Mostrando {visibleCount} de {orders.length}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((c) => Math.min(c + 10, orders.length))}
              >
                Carregar mais 10
              </Button>
            </div>
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
                <TableHead className="text-right">Tempo até resgate</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {coupons.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum cupom resgatado</TableCell></TableRow> :
                  coupons.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-muted-foreground">{c.redeemed_at ? format(new Date(c.redeemed_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}</TableCell>
                      <TableCell className="font-mono">{c.coupon_code}</TableCell>
                      <TableCell>{c.customer_name || "—"}</TableCell>
                      <TableCell>{c.customer_whatsapp || "—"}</TableCell>
                      <TableCell>{c.prize_name}</TableCell>
                      <TableCell>{c.campaign_name}</TableCell>
                      <TableCell className="text-right">{c.leadTimeHours > 0 ? `${c.leadTimeHours.toFixed(1)} h` : "—"}</TableCell>
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
