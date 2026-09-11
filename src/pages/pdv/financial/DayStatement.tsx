import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Download, DollarSign, Banknote, CreditCard, Smartphone, ArrowDownFromLine, AlertTriangle, TrendingUp, ShoppingBag, Receipt, XCircle, Tag, ListOrdered } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { usePDVCashierStatement } from "@/hooks/use-pdv-cashier-statement";
import { SessionsTable, riskBadge } from "@/components/pdv/financial/SessionsTable";
import { formatBRL } from "@/lib/format";
import { downloadCsv } from "@/lib/csv-export";
import { brtRange } from "@/lib/reports-data-source";

const movementLabel: Record<string, string> = {
  venda: "Venda",
  sangria: "Sangria",
  reforco: "Reforço",
};

export default function DayStatement() {
  const navigate = useNavigate();
  const { date } = useParams<{ date: string }>();
  // Usar "T00:00:00" para forçar interpretação como hora local (não UTC midnight)
  const parsedDate = useMemo(() => (date ? new Date(date + "T00:00:00") : new Date()), [date]);
  const validDate = isValid(parsedDate);
  const d = validDate ? parsedDate : new Date();
  const { data, isLoading } = usePDVCashierStatement({ from: d, to: d });

  const sessionIds = useMemo(() => (data?.sessions || []).map((s) => s.id), [data]);

  const allMovements = useMemo(
    () => (data?.sessions || []).flatMap((s) => s.movements || []),
    [data]
  );

  const { data: orders } = useQuery({
    queryKey: ["day-orders", sessionIds],
    queryFn: async () => {
      if (sessionIds.length === 0) return [];
      const { data: rows } = await supabase
        .from("pdv_orders")
        .select("id,order_number,subtotal,total,discount,status,cancellation_reason,cancelled_at,closed_at,created_at,opened_at,source,pdv_payments(payment_method,amount)")
        .in("cashier_session_id", sessionIds)
        .order("created_at", { ascending: true });
      return rows ?? [];
    },
    enabled: sessionIds.length > 0,
  });

  /**
   * Cancelado sem caixa aberto.
   *
   * Todo o resto desta tela sai por `cashier_session_id`, e pedido cancelado
   * fora do expediente — ou antes de alguém abrir o caixa — não tem sessão
   * nenhuma. No Kōten Garibaldi eram 15 de 48 cancelamentos invisíveis, e o
   * lojista notou justamente porque a conta não batia com o que ele via na
   * operação. Aqui eles entram pela DATA do cancelamento.
   */
  const { data: canceladosSemSessao } = useQuery({
    queryKey: ["day-orphan-cancelled", date],
    queryFn: async () => {
      const { startISO, endISO } = brtRange(d, d);
      const [{ data: pdv }, { data: del }, { data: comanda }] = await Promise.all([
        supabase
          .from("pdv_orders")
          .select("id,order_number,subtotal,total,discount,status,cancellation_reason,cancelled_at,closed_at,created_at,opened_at,source,pdv_payments(payment_method,amount)")
          .is("cashier_session_id", null)
          .eq("status", "cancelled")
          .gte("cancelled_at", startISO)
          .lte("cancelled_at", endISO),
        supabase
          .from("delivery_orders")
          .select("id,order_number,total,subtotal,discount,payment_method,status,cancellation_reason,cancelled_at,customer_name,created_at,delivery_fee")
          .is("cashier_session_id", null)
          .eq("status", "cancelled")
          .gte("cancelled_at", startISO)
          .lte("cancelled_at", endISO),
        // Comanda de salão cancelada nunca vira pdv_orders — some do
        // fechamento se não buscarmos direto em pdv_comandas.
        supabase
          .from("pdv_comandas")
          .select("id,comanda_number,subtotal,status,cancellation_reason,cancelled_at")
          .is("cashier_session_id", null)
          .eq("status", "cancelada")
          .gte("cancelled_at", startISO)
          .lte("cancelled_at", endISO),
      ]);
      return { pdv: pdv ?? [], del: del ?? [], comanda: comanda ?? [] };
    },
  });

  const { data: comandasCanceladas } = useQuery({
    queryKey: ["day-comandas-cancelled", sessionIds],
    queryFn: async () => {
      if (sessionIds.length === 0) return [];
      const { data: rows } = await supabase
        .from("pdv_comandas")
        .select("id,comanda_number,subtotal,status,cancellation_reason,cancelled_at")
        .in("cashier_session_id", sessionIds)
        .eq("status", "cancelada");
      return rows ?? [];
    },
    enabled: sessionIds.length > 0,
  });

  const cancelledOrders = useMemo(
    () => [
      ...(orders || []).filter((o: any) => o.status === "cancelled"),
      ...(canceladosSemSessao?.pdv ?? []),
    ],
    [orders, canceladosSemSessao]
  );
  const cancelledComandas = useMemo(
    () => [
      ...(comandasCanceladas ?? []),
      ...(canceladosSemSessao?.comanda ?? []),
    ],
    [comandasCanceladas, canceladosSemSessao]
  );
  const discountedOrders = useMemo(() => (orders || []).filter((o: any) => Number(o.discount) > 0 && o.status !== "cancelled"), [orders]);
  const activeOrders = useMemo(() => (orders || []).filter((o: any) => o.status !== "cancelled"), [orders]);

  const { data: deliveryOrders } = useQuery({
    queryKey: ["day-delivery-orders", sessionIds],
    queryFn: async () => {
      if (sessionIds.length === 0) return [];
      const { data: rows } = await supabase
        .from("delivery_orders")
        .select("id,order_number,total,subtotal,discount,payment_method,status,cancellation_reason,cancelled_at,customer_name,created_at,delivery_fee")
        .in("cashier_session_id", sessionIds)
        .order("created_at", { ascending: true });
      return rows ?? [];
    },
    enabled: sessionIds.length > 0,
  });

  const deliveryActive     = useMemo(() => (deliveryOrders || []).filter((o: any) => o.status !== "cancelled"), [deliveryOrders]);
  const deliveryCancelled  = useMemo(
    () => [
      ...(deliveryOrders || []).filter((o: any) => o.status === "cancelled"),
      ...(canceladosSemSessao?.del ?? []),
    ],
    [deliveryOrders, canceladosSemSessao]
  );
  const deliveryDiscounted = useMemo(() => (deliveryOrders || []).filter((o: any) => Number(o.discount) > 0 && o.status !== "cancelled"), [deliveryOrders]);

  const pmMap: Record<string, string> = {
    dinheiro: "Dinheiro", credito: "Crédito", debito: "Débito", pix: "PIX",
    vale_refeicao: "VR", fiado: "À Prazo", cartao: "Cartão",
    cash: "Dinheiro", credit: "Crédito", debit: "Débito", card: "Cartão",
    online: "Online", online_delivery: "Online",
  };

  const allActiveRows = useMemo(() => {
    const pdv = activeOrders.map((o: any) => {
      const pmts: any[] = o.pdv_payments || [];
      return { id: o.id, num: o.order_number, time: o.closed_at || o.created_at, pm: pmts[0]?.payment_method, amount: pmts.reduce((s: number, p: any) => s + Number(p.amount || 0), 0) || Number(o.subtotal || 0), status: o.status, tipo: "PDV" as const };
    });
    const del = deliveryActive.map((o: any) => ({
      id: o.id, num: o.order_number, time: o.created_at, pm: o.payment_method, amount: Number(o.total || 0), status: o.status, tipo: "Delivery" as const,
    }));
    return [...pdv, ...del].sort((a, b) => new Date(a.time || "").getTime() - new Date(b.time || "").getTime());
  }, [activeOrders, deliveryActive]);

  const allCancelledRows = useMemo(() => {
    const pdv = cancelledOrders.map((o: any) => ({ id: o.id, num: o.order_number, time: o.cancelled_at, amount: Number(o.subtotal || 0), reason: o.cancellation_reason, tipo: "PDV" as const }));
    const del = deliveryCancelled.map((o: any) => ({ id: o.id, num: o.order_number, time: o.cancelled_at, amount: Number(o.subtotal || o.total || 0), reason: o.cancellation_reason, tipo: "Delivery" as const }));
    const comanda = cancelledComandas.map((o: any) => ({ id: o.id, num: o.comanda_number, time: o.cancelled_at, amount: Number(o.subtotal || 0), reason: o.cancellation_reason, tipo: "Salão" as const }));
    return [...pdv, ...del, ...comanda].sort((a, b) => new Date(a.time || "").getTime() - new Date(b.time || "").getTime());
  }, [cancelledOrders, deliveryCancelled, cancelledComandas]);

  const allDiscountedRows = useMemo(() => {
    const pdv = discountedOrders.map((o: any) => {
      const pmts: any[] = o.pdv_payments || [];
      return { id: o.id, num: o.order_number, gross: Number(o.subtotal || 0), discount: Number(o.discount || 0), paid: pmts.reduce((s: number, p: any) => s + Number(p.amount || 0), 0), tipo: "PDV" as const };
    });
    const del = deliveryDiscounted.map((o: any) => ({
      id: o.id, num: o.order_number, gross: Number(o.subtotal || 0) || (Number(o.total || 0) + Number(o.discount || 0)), discount: Number(o.discount || 0), paid: Number(o.total || 0), tipo: "Delivery" as const,
    }));
    return [...pdv, ...del];
  }, [discountedOrders, deliveryDiscounted]);

  const salesCount = useMemo(
    () => allMovements.filter((m: any) => m.type === "venda").length,
    [allMovements]
  );

  const totalSales = data?.kpis.totalSales || 0;
  const avgTicket = salesCount > 0 ? totalSales / salesCount : 0;

  const sessionsOpen = (data?.sessions || []).filter((s) => !s.closed_at).length;
  const sessionsClosed = (data?.sessions || []).filter((s) => !!s.closed_at).length;

  const totalDifference = useMemo(
    () =>
      (data?.sessions || []).reduce(
        (acc, s) => acc + (s.balance_difference != null ? Number(s.balance_difference) : 0),
        0
      ),
    [data]
  );

  // Vendas por hora
  const salesByHour = useMemo(() => {
    const buckets: Record<number, number> = {};
    for (let h = 0; h < 24; h++) buckets[h] = 0;
    for (const m of allMovements) {
      if (m.type !== "venda") continue;
      const h = new Date(m.created_at).getHours();
      buckets[h] += Number(m.amount || 0);
    }
    return Object.entries(buckets).map(([h, v]) => ({
      hora: `${String(h).padStart(2, "0")}h`,
      total: Number(v),
    }));
  }, [allMovements]);

  // Composição por método
  const methodBreakdown = useMemo(() => {
    const cash = (data?.sessions || []).reduce((a, s) => a + Number(s.total_cash || 0), 0);
    const credit = (data?.sessions || []).reduce((a, s) => a + Number(s.total_credit || 0), 0);
    const debit = (data?.sessions || []).reduce((a, s) => a + Number(s.total_debit || 0), 0);
    const pix = (data?.sessions || []).reduce((a, s) => a + Number(s.total_pix || 0), 0);
    const voucher = (data?.sessions || []).reduce((a, s) => a + Number(s.total_voucher || 0), 0);
    const delivery = (data?.sessions || []).reduce((a, s) => a + Number(s.total_online_delivery || 0), 0);
    const fiado = (data?.sessions || []).reduce((a, s) => a + Number((s as any).total_fiado || 0), 0);
    const fallbackCard = (data?.sessions || []).reduce((a, s) => a + Number(s.total_card || 0), 0);
    const total = cash + credit + debit + pix + voucher + delivery + fiado || fallbackCard + cash + pix;
    const rows = [
      { metodo: "Dinheiro", valor: cash },
      { metodo: "Crédito", valor: credit },
      { metodo: "Débito", valor: debit },
      { metodo: "PIX", valor: pix },
      { metodo: "Voucher", valor: voucher },
      { metodo: "Delivery Online", valor: delivery },
      { metodo: "À Prazo", valor: fiado },
    ];
    // se crédito/débito vazios mas card preenchido, mostra card
    if (credit === 0 && debit === 0 && fallbackCard > 0) {
      rows.splice(1, 2, { metodo: "Cartão", valor: fallbackCard });
    }
    return { rows: rows.filter((r) => r.valor > 0), total };
  }, [data]);

  // Sangrias / Reforços
  const cashMovements = useMemo(
    () =>
      allMovements
        .filter((m: any) => m.type === "sangria" || m.type === "reforco")
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [allMovements]
  );

  // Diferenças de fechamento
  const diffSessions = useMemo(
    () =>
      (data?.sessions || []).filter(
        (s) => s.balance_difference != null && Math.abs(Number(s.balance_difference)) > 0
      ),
    [data]
  );

  const cancTotal = useMemo(() => allCancelledRows.reduce((a, o) => a + o.amount, 0), [allCancelledRows]);
  const discTotal = useMemo(() => allDiscountedRows.reduce((a, o) => a + o.discount, 0), [allDiscountedRows]);

  const trackedByOrders = useMemo(() => allActiveRows.reduce((a, o) => a + o.amount, 0), [allActiveRows]);
  const untrackedAmount = useMemo(
    () => Math.round(Math.max(0, totalSales - trackedByOrders) * 100) / 100,
    [totalSales, trackedByOrders]
  );

  const handleExport = () => {
    if (!data) return;
    const lines = [
      `Demonstrativo do dia ${format(parsedDate, "dd/MM/yyyy")}`,
      "",
      "KPI;Valor",
      `Total Vendido;${formatBRL(totalSales)}`,
      `Nº de pedidos;${salesCount}`,
      `Ticket médio;${formatBRL(avgTicket)}`,
      `Dinheiro;${formatBRL(data.kpis.totalCash)}`,
      `Cartão;${formatBRL(data.kpis.totalCard)}`,
      `PIX;${formatBRL(data.kpis.totalPix)}`,
      `Sangrias;${formatBRL(data.kpis.totalWithdrawals)}`,
      `Diferença total;${formatBRL(totalDifference)}`,
      `Sessões;${data.kpis.sessionsCount} (${sessionsClosed} fechadas / ${sessionsOpen} abertas)`,
      `Cancelamentos;${allCancelledRows.length} pedidos / ${formatBRL(cancTotal)}`,
      `Descontos concedidos;${formatBRL(discTotal)}`,
    ];
    downloadCsv(`demonstrativo_dia_${format(parsedDate, "yyyy-MM-dd")}.csv`, lines);
  };

  if (!validDate) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
        <p className="mt-4 text-muted-foreground">Data inválida.</p>
      </div>
    );
  }

  const pct = (v: number) => (totalSales > 0 ? ((v / totalSales) * 100).toFixed(1) : "0.0");

  const kpiCards = [
    { label: "Total Vendido", value: formatBRL(totalSales), icon: DollarSign, color: "text-success" },
    { label: "Dinheiro", value: formatBRL(data?.kpis.totalCash || 0), hint: `${pct(data?.kpis.totalCash || 0)}%`, icon: Banknote },
    { label: "Cartão", value: formatBRL(data?.kpis.totalCard || 0), hint: `${pct(data?.kpis.totalCard || 0)}%`, icon: CreditCard },
    { label: "PIX", value: formatBRL(data?.kpis.totalPix || 0), hint: `${pct(data?.kpis.totalPix || 0)}%`, icon: Smartphone },
    { label: "Sangrias", value: formatBRL(data?.kpis.totalWithdrawals || 0), icon: ArrowDownFromLine, color: "text-warning" },
    { label: "Diferença", value: formatBRL(totalDifference), icon: AlertTriangle, color: Math.abs(totalDifference) > 5 ? (totalDifference > 0 ? "text-success" : "text-destructive") : "" },
  ];

  const secondaryCards = [
    { label: "Nº de pedidos", value: String(salesCount), icon: ShoppingBag },
    { label: "Ticket médio", value: formatBRL(avgTicket), icon: TrendingUp },
    { label: "Sessões", value: `${data?.kpis.sessionsCount || 0}`, hint: `${sessionsClosed} fechadas · ${sessionsOpen} abertas`, icon: Receipt },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              Demonstrativo do dia {format(parsedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {format(parsedDate, "EEEE", { locale: ptBR })} · análise completa do caixa
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={!data}>
          <Download className="mr-2 h-4 w-4" /> Exportar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {kpiCards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium">{c.label}</CardTitle>
              <c.icon className={`h-4 w-4 ${c.color || "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-7 w-20" /> : (
                <>
                  <div className={`text-xl font-bold ${c.color || ""}`}>{c.value}</div>
                  {c.hint && <p className="text-xs text-muted-foreground mt-1">{c.hint}</p>}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {secondaryCards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
              {c.hint && <p className="text-xs text-muted-foreground mt-1">{c.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vendas por hora</CardTitle>
            <CardDescription>Distribuição do faturamento ao longo do dia</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={salesByHour}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => formatBRL(v).replace("R$", "")} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number) => formatBRL(v)}
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Composição por método</CardTitle>
            <CardDescription>Participação de cada meio de pagamento</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : methodBreakdown.rows.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Sem vendas no dia.</p>
            ) : (
              <div className="space-y-3">
                {methodBreakdown.rows.map((r) => {
                  const p = methodBreakdown.total > 0 ? (r.valor / methodBreakdown.total) * 100 : 0;
                  return (
                    <div key={r.metodo}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium">{r.metodo}</span>
                        <span className="text-muted-foreground">
                          {formatBRL(r.valor)} · {p.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${p}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sessões do dia</CardTitle>
          <CardDescription>Detalhe por sessão de caixa</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-32 w-full" /> :
            (data?.sessions?.length || 0) > 0 ? <SessionsTable sessions={data!.sessions} /> :
            <p className="text-center py-8 text-muted-foreground">Nenhuma sessão neste dia.</p>}
        </CardContent>
      </Card>

      {allActiveRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4" />
              Movimentação de Pedidos
              <span className="ml-auto text-sm font-normal text-muted-foreground">{allActiveRows.length} pedido{allActiveRows.length !== 1 ? "s" : ""}</span>
            </CardTitle>
            <CardDescription>Todos os pedidos do dia (PDV e Delivery)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Forma de Pgto</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allActiveRows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">#{o.num ?? "—"}</TableCell>
                    <TableCell>{o.time ? format(new Date(o.time), "HH:mm") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={o.tipo === "Delivery" ? "secondary" : "outline"}>{o.tipo}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{o.pm ? (pmMap[o.pm] || o.pm) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(o.amount)}</TableCell>
                  </TableRow>
                ))}
                {untrackedAmount > 0.01 && (
                  <TableRow className="text-muted-foreground italic">
                    <TableCell colSpan={4}>Outros pagamentos</TableCell>
                    <TableCell className="text-right">{formatBRL(untrackedAmount)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="mt-3 flex justify-end border-t pt-3">
              <span className="text-sm font-bold">Total: {formatBRL(totalSales)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {allCancelledRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              Cancelamentos
              <Badge variant="destructive" className="ml-auto">{allCancelledRows.length}</Badge>
            </CardTitle>
            <CardDescription>Pedidos cancelados durante o dia</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allCancelledRows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">#{o.num ?? "—"}</TableCell>
                    <TableCell>{o.time ? format(new Date(o.time), "HH:mm") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={o.tipo === "Delivery" ? "secondary" : "outline"}>{o.tipo}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-destructive">{formatBRL(o.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{o.reason || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex justify-end border-t pt-3">
              <span className="text-sm font-bold text-destructive">Total cancelado: {formatBRL(cancTotal)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {allDiscountedRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-warning" />
              Descontos Concedidos
              <span className="ml-auto text-sm font-normal text-muted-foreground">{allDiscountedRows.length} pedido{allDiscountedRows.length !== 1 ? "s" : ""}</span>
            </CardTitle>
            <CardDescription>Pedidos com desconto aplicado</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Total Bruto</TableHead>
                  <TableHead className="text-right">Desconto</TableHead>
                  <TableHead className="text-right">Total Final</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allDiscountedRows.map((o) => {
                  const pct = o.gross > 0 ? ((o.discount / o.gross) * 100).toFixed(1) : "0.0";
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">#{o.num ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={o.tipo === "Delivery" ? "secondary" : "outline"}>{o.tipo}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatBRL(o.gross)}</TableCell>
                      <TableCell className="text-right text-warning font-medium">-{formatBRL(o.discount)}</TableCell>
                      <TableCell className="text-right font-medium">{formatBRL(o.paid)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{pct}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="mt-3 flex justify-end border-t pt-3">
              <span className="text-sm font-bold text-warning">Total em descontos: -{formatBRL(discTotal)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sangrias e reforços</CardTitle>
          <CardDescription>Movimentações de caixa fora de vendas</CardDescription>
        </CardHeader>
        <CardContent>
          {cashMovements.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground text-sm">Nenhuma sangria ou reforço no dia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Autorizado por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashMovements.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>{format(new Date(m.created_at), "HH:mm")}</TableCell>
                    <TableCell>
                      <Badge variant={m.type === "sangria" ? "destructive" : "outline"}>
                        {movementLabel[m.type] || m.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(m.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{m.description || m.discount_reason || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.discount_authorized_by || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {diffSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Diferenças de fechamento</CardTitle>
            <CardDescription>Sessões com divergências e justificativas</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sessão</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risco</TableHead>
                  <TableHead>Justificativa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diffSessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      {format(new Date(s.opened_at), "HH:mm")}
                      {s.closed_at ? ` → ${format(new Date(s.closed_at), "HH:mm")}` : " (aberto)"}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${Math.abs(Number(s.balance_difference)) > 5 ? (Number(s.balance_difference) > 0 ? "text-success" : "text-destructive") : ""}`}>
                      {formatBRL(Number(s.balance_difference))}
                    </TableCell>
                    <TableCell>
                      {s.closing_status === "surplus" && <Badge variant="outline">Sobra</Badge>}
                      {s.closing_status === "shortage" && <Badge variant="destructive">Falta</Badge>}
                      {s.closing_status === "no_difference" && <Badge variant="outline">Sem diferença</Badge>}
                      {!s.closing_status && "—"}
                    </TableCell>
                    <TableCell>{riskBadge(s.fraud_risk_level)}</TableCell>
                    <TableCell className="text-muted-foreground max-w-md">
                      {s.closing_justification || s.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
