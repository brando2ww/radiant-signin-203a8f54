import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { parseISO, format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Download, DollarSign, Banknote, CreditCard, Smartphone, ArrowDownFromLine, AlertTriangle, TrendingUp, ShoppingBag, Receipt } from "lucide-react";
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

const movementLabel: Record<string, string> = {
  venda: "Venda",
  sangria: "Sangria",
  reforco: "Reforço",
};

export default function DayStatement() {
  const navigate = useNavigate();
  const { date } = useParams<{ date: string }>();
  const parsedDate = useMemo(() => (date ? parseISO(date) : new Date()), [date]);
  const validDate = isValid(parsedDate);
  const { data, isLoading } = usePDVCashierStatement("daily", validDate ? parsedDate : new Date());

  const allMovements = useMemo(
    () => (data?.sessions || []).flatMap((s) => s.movements || []),
    [data]
  );

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
    const fallbackCard = (data?.sessions || []).reduce((a, s) => a + Number(s.total_card || 0), 0);
    const total = cash + credit + debit + pix + voucher + delivery || fallbackCard + cash + pix;
    const rows = [
      { metodo: "Dinheiro", valor: cash },
      { metodo: "Crédito", valor: credit },
      { metodo: "Débito", valor: debit },
      { metodo: "PIX", valor: pix },
      { metodo: "Voucher", valor: voucher },
      { metodo: "Delivery Online", valor: delivery },
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
    { label: "Diferença", value: formatBRL(totalDifference), icon: AlertTriangle, color: Math.abs(totalDifference) > 5 ? "text-destructive" : "" },
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
                    <TableCell className={`text-right font-medium ${Math.abs(Number(s.balance_difference)) > 5 ? "text-destructive" : ""}`}>
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
