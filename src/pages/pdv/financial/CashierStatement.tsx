import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, DollarSign, Banknote, CreditCard, Smartphone, ArrowDownFromLine, AlertTriangle, ChevronRight, TrendingUp, CalendarDays } from "lucide-react";
import { usePDVCashierStatement } from "@/hooks/use-pdv-cashier-statement";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv } from "@/lib/csv-export";
import { SessionsTable } from "@/components/pdv/financial/SessionsTable";
import { SessionDetailSheet } from "@/components/pdv/financial/SessionDetailSheet";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { CashierStatementSession } from "@/hooks/use-pdv-cashier-statement";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function localDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

export default function CashierStatement() {
  const navigate = useNavigate();
  const today = new Date();
  const [dateRange, setDateRange] = useState<DateRange>({ from: today, to: today });
  const [selectedSession, setSelectedSession] = useState<CashierStatementSession | null>(null);

  const from = dateRange.from ?? today;
  const to = dateRange.to ?? from;
  const { data, isLoading } = usePDVCashierStatement({ from, to });

  const isSingleDay = data?.isSingleDay ?? (format(from, "yyyy-MM-dd") === format(to, "yyyy-MM-dd"));

  const handleExport = () => {
    if (!data) return;
    const label = isSingleDay
      ? format(from, "dd/MM/yyyy")
      : `${format(from, "dd/MM/yyyy")}_${format(to, "dd/MM/yyyy")}`;

    const lines = isSingleDay
      ? [
          `Demonstrativo de Caixa - ${format(from, "dd/MM/yyyy")}`,
          "",
          "Sessão;Abertura;Fechamento;Vendas;Dinheiro;Cartão;PIX;Sangrias/Desp.;Diferença;Risco",
          ...data.sessions.map((s) =>
            [
              s.id.slice(0, 8),
              format(new Date(s.opened_at), "dd/MM HH:mm"),
              s.closed_at ? format(new Date(s.closed_at), "dd/MM HH:mm") : "Aberto",
              fmt(s.total_sales),
              fmt(s.total_cash),
              fmt(s.total_card),
              fmt(s.total_pix),
              fmt(s.total_withdrawals),
              s.balance_difference != null ? fmt(s.balance_difference) : "—",
              s.fraud_risk_level || "—",
            ].join(";")
          ),
        ]
      : [
          `Demonstrativo de Caixa - ${format(from, "dd/MM/yyyy")} a ${format(to, "dd/MM/yyyy")}`,
          "",
          "Data;Vendas;Dinheiro;Cartão;PIX;Voucher;Delivery;Sangrias/Desp.;Cancelamentos;Diferença",
          ...data.dailySummaries.map((d) =>
            [
              format(localDate(d.date), "dd/MM/yyyy"),
              fmt(d.totalSales),
              fmt(d.totalCash),
              fmt(d.totalCard),
              fmt(d.totalPix),
              fmt(d.totalVoucher),
              fmt(d.totalOnlineDelivery),
              fmt(d.totalWithdrawals),
              d.cancelledCount,
              d.hasDifference ? "Sim" : "Não",
            ].join(";")
          ),
          "",
          `Total Vendas;${fmt(data.kpis.totalSales)}`,
        ];

    downloadCsv(`demonstrativo_caixa_${label}.csv`, lines);
  };

  const downloadDaySummary = (day: import("@/hooks/use-pdv-cashier-statement").DailySummary) => {
    const d = localDate(day.date);
    const lines = [
      `Demonstrativo do dia ${format(d, "dd/MM/yyyy")}`,
      "",
      "KPI;Valor",
      `Total Vendido;${fmt(day.totalSales)}`,
      `Dinheiro;${fmt(day.totalCash)}`,
      `Cartão;${fmt(day.totalCard)}`,
      `PIX;${fmt(day.totalPix)}`,
      `Voucher;${fmt(day.totalVoucher)}`,
      `Delivery Online;${fmt(day.totalOnlineDelivery)}`,
      `Sangrias / Despesas;${fmt(day.totalWithdrawals)}`,
      `Cancelamentos;${day.cancelledCount}`,
      `Diferença;${day.hasDifference ? `Sim (${day.differenceCount} sessão(ões))` : "Não"}`,
    ];
    downloadCsv(`demonstrativo_dia_${format(d, "yyyy-MM-dd")}.csv`, lines);
  };

  const kpiCards = [
    {
      label: "Total Vendido",
      value: fmt(data?.kpis.totalSales || 0),
      icon: DollarSign,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
    },
    {
      label: "Dinheiro",
      value: fmt(data?.kpis.totalCash || 0),
      icon: Banknote,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/30",
    },
    {
      label: "Cartão",
      value: fmt(data?.kpis.totalCard || 0),
      icon: CreditCard,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-950/30",
    },
    {
      label: "PIX",
      value: fmt(data?.kpis.totalPix || 0),
      icon: Smartphone,
      color: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-50 dark:bg-cyan-950/30",
    },
    {
      label: "Sangrias",
      value: fmt(data?.kpis.totalWithdrawals || 0),
      icon: ArrowDownFromLine,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/30",
    },
    {
      label: "Com Diferença",
      value: String(data?.kpis.sessionsWithDifference || 0),
      icon: AlertTriangle,
      color: (data?.kpis.sessionsWithDifference || 0) > 0
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground",
      bg: (data?.kpis.sessionsWithDifference || 0) > 0
        ? "bg-red-50 dark:bg-red-950/30"
        : "bg-muted/40",
    },
  ];

  const totalRow = data?.dailySummaries.reduce(
    (acc, d) => ({
      sales: acc.sales + d.totalSales,
      cash: acc.cash + d.totalCash,
      card: acc.card + d.totalCard,
      pix: acc.pix + d.totalPix,
      voucher: acc.voucher + d.totalVoucher,
      onlineDelivery: acc.onlineDelivery + d.totalOnlineDelivery,
      withdrawals: acc.withdrawals + d.totalWithdrawals,
    }),
    { sales: 0, cash: 0, card: 0, pix: 0, voucher: 0, onlineDelivery: 0, withdrawals: 0 }
  );

  return (
    <>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Demonstrativo de Caixa</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Resumo de sessões de caixa para conferência</p>
        </div>
        <div className="flex items-center gap-2">
          <DatePickerWithRange date={dateRange} setDate={(d) => d && setDateRange(d)} />
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!data || data.sessions.length === 0 && data.dailySummaries.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpiCards.map((c) => (
          <Card key={c.label} className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
                <div className={`p-1.5 rounded-md ${c.bg}`}>
                  <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                </div>
              </div>
              {isLoading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <div className={`text-lg font-bold leading-tight ${c.color}`}>{c.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats extras para range */}
      {!isSingleDay && data?.kpis && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <Card className="border shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Média por Dia</p>
                <p className="text-base font-bold">{fmt(data.kpis.avgPerDay)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-blue-50 dark:bg-blue-950/30">
                <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dias com Vendas</p>
                <p className="text-base font-bold">{data.kpis.daysWithSales}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-violet-50 dark:bg-violet-950/30">
                <DollarSign className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sessões no Período</p>
                <p className="text-base font-bold">{data.kpis.sessionsCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main content */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold">
            {isSingleDay
              ? `Sessões de ${format(from, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`
              : `Resumo Diário — ${format(from, "dd/MM/yyyy")} a ${format(to, "dd/MM/yyyy")}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isSingleDay ? (
            (data?.sessions?.length || 0) > 0 ? (
              <div className="p-4">
                <SessionsTable sessions={data!.sessions} onSelect={setSelectedSession} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <CalendarDays className="h-8 w-8 opacity-30" />
                <p className="text-sm">Nenhuma sessão de caixa nesta data</p>
              </div>
            )
          ) : (
            (data?.dailySummaries?.length || 0) > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Data</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Dinheiro</TableHead>
                    <TableHead className="text-right">Cartão</TableHead>
                    <TableHead className="text-right">PIX</TableHead>
                    <TableHead className="text-right">Voucher</TableHead>
                    <TableHead className="text-right">Delivery</TableHead>
                    <TableHead className="text-right">Sangrias/Desp.</TableHead>
                    <TableHead className="text-center">Cancelam.</TableHead>
                    <TableHead className="text-center">Diferença</TableHead>
                    <TableHead className="text-right pr-4 w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.dailySummaries.map((day) => (
                    <TableRow
                      key={day.date}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => navigate(`/pdv/financeiro/demonstrativo-caixa/dia/${day.date}`)}
                    >
                      <TableCell className="pl-4 font-medium">
                        {format(localDate(day.date), "dd/MM", { locale: ptBR })}
                        <span className="text-xs text-muted-foreground ml-1.5">
                          {format(localDate(day.date), "EEE", { locale: ptBR })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                        {fmt(day.totalSales)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmt(day.totalCash)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmt(day.totalCard)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmt(day.totalPix)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {day.totalVoucher > 0 ? fmt(day.totalVoucher) : <span className="opacity-30">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {day.totalOnlineDelivery > 0 ? fmt(day.totalOnlineDelivery) : <span className="opacity-30">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmt(day.totalWithdrawals)}</TableCell>
                      <TableCell className="text-center">
                        {day.cancelledCount > 0 ? (
                          <Badge variant="destructive" className="text-xs">{day.cancelledCount}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground opacity-40">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {day.hasDifference ? (
                          <Badge variant="destructive" className="text-xs">
                            {day.differenceCount > 1 ? `${day.differenceCount}` : "Sim"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Não</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Baixar demonstrativo do dia"
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadDaySummary(day);
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Ver detalhes"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/pdv/financeiro/demonstrativo-caixa/dia/${day.date}`);
                            }}
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {totalRow && data!.dailySummaries.length > 1 && (
                  <TableFooter>
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell className="pl-4">Total</TableCell>
                      <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                        {fmt(totalRow.sales)}
                      </TableCell>
                      <TableCell className="text-right">{fmt(totalRow.cash)}</TableCell>
                      <TableCell className="text-right">{fmt(totalRow.card)}</TableCell>
                      <TableCell className="text-right">{fmt(totalRow.pix)}</TableCell>
                      <TableCell className="text-right">{fmt(totalRow.voucher)}</TableCell>
                      <TableCell className="text-right">{fmt(totalRow.onlineDelivery)}</TableCell>
                      <TableCell className="text-right">{fmt(totalRow.withdrawals)}</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <CalendarDays className="h-8 w-8 opacity-30" />
                <p className="text-sm">Nenhuma sessão de caixa no período selecionado</p>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>

    <SessionDetailSheet session={selectedSession} onClose={() => setSelectedSession(null)} />
    </>
  );
}
