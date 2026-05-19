import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarIcon, Download, DollarSign, Banknote, CreditCard, Smartphone, ArrowDownFromLine, AlertTriangle } from "lucide-react";
import { usePDVCashierStatement, CashierStatementSession } from "@/hooks/use-pdv-cashier-statement";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv } from "@/lib/csv-export";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function riskBadge(level: string | null) {
  switch (level) {
    case "ok": return <Badge className="bg-success text-success-foreground">OK</Badge>;
    case "low": return <Badge variant="outline">Baixo</Badge>;
    case "medium": return <Badge className="bg-warning text-warning-foreground">Médio</Badge>;
    case "high": return <Badge variant="destructive">Alto</Badge>;
    case "critical": return <Badge variant="destructive">Crítico</Badge>;
    default: return <Badge variant="outline">—</Badge>;
  }
}

export default function CashierStatement() {
  const [mode, setMode] = useState<"daily" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { data, isLoading } = usePDVCashierStatement(mode, selectedDate);

  const handleExport = () => {
    if (!data) return;
    const lines = [
      `Demonstrativo de Caixa - ${mode === "daily" ? format(selectedDate, "dd/MM/yyyy") : format(selectedDate, "MMMM yyyy", { locale: ptBR })}`,
      "",
      "Sessão;Abertura;Fechamento;Vendas;Dinheiro;Cartão;PIX;Sangrias;Diferença;Risco",
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
      "",
      `Total Vendas;${fmt(data.kpis.totalSales)}`,
      `Total Dinheiro;${fmt(data.kpis.totalCash)}`,
      `Total Cartão;${fmt(data.kpis.totalCard)}`,
      `Total PIX;${fmt(data.kpis.totalPix)}`,
      `Total Sangrias;${fmt(data.kpis.totalWithdrawals)}`,
    ];
    downloadCsv(`demonstrativo_caixa_${format(selectedDate, "yyyy-MM-dd")}.csv`, lines);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Demonstrativo de Caixa</h1>
          <p className="text-muted-foreground mt-1">Resumo de sessões de caixa para conferência</p>
        </div>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {mode === "daily"
                  ? format(selectedDate, "dd/MM/yyyy")
                  : format(selectedDate, "MMMM yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={handleExport} disabled={!data}>
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "daily" | "monthly")}>
        <TabsList>
          <TabsTrigger value="daily">Diário</TabsTrigger>
          <TabsTrigger value="monthly">Mensal</TabsTrigger>
        </TabsList>

        <div className="mt-4 grid gap-4 md:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "Total Vendido", value: fmt(data?.kpis.totalSales || 0), icon: DollarSign, color: "text-success" },
            { label: "Dinheiro", value: fmt(data?.kpis.totalCash || 0), icon: Banknote, color: "" },
            { label: "Cartão", value: fmt(data?.kpis.totalCard || 0), icon: CreditCard, color: "" },
            { label: "PIX", value: fmt(data?.kpis.totalPix || 0), icon: Smartphone, color: "" },
            { label: "Sangrias", value: fmt(data?.kpis.totalWithdrawals || 0), icon: ArrowDownFromLine, color: "text-warning" },
            { label: "Com Diferença", value: String(data?.kpis.sessionsWithDifference || 0), icon: AlertTriangle, color: "text-destructive" },
          ].map((c) => (
            <Card key={c.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium">{c.label}</CardTitle>
                <c.icon className={`h-4 w-4 ${c.color || "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-7 w-20" /> : (
                  <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {mode === "monthly" && data?.kpis && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Média por Dia</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmt(data.kpis.avgPerDay)}</div>
                <p className="text-xs text-muted-foreground mt-1">{data.kpis.daysWithSales} dias com vendas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Sessões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.kpis.sessionsCount}</div>
                <p className="text-xs text-muted-foreground mt-1">sessões no período</p>
              </CardContent>
            </Card>
          </div>
        )}

        <TabsContent value="daily" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sessões do Dia</CardTitle>
              <CardDescription>{format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : (data?.sessions?.length || 0) > 0 ? (
                <SessionsTable sessions={data!.sessions} />
              ) : (
                <p className="text-center py-8 text-muted-foreground">Nenhuma sessão de caixa nesta data</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Resumo Diário</CardTitle>
              <CardDescription>{format(selectedDate, "MMMM 'de' yyyy", { locale: ptBR })}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (data?.dailySummaries?.length || 0) > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">Dinheiro</TableHead>
                      <TableHead className="text-right">Cartão</TableHead>
                      <TableHead className="text-right">PIX</TableHead>
                      <TableHead className="text-right">Sangrias</TableHead>
                      <TableHead className="text-center">Diferença</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.dailySummaries.map((day) => (
                      <TableRow key={day.date}>
                        <TableCell className="font-medium">{format(new Date(day.date), "dd/MM")}</TableCell>
                        <TableCell className="text-right">{fmt(day.totalSales)}</TableCell>
                        <TableCell className="text-right">{fmt(day.totalCash)}</TableCell>
                        <TableCell className="text-right">{fmt(day.totalCard)}</TableCell>
                        <TableCell className="text-right">{fmt(day.totalPix)}</TableCell>
                        <TableCell className="text-right">{fmt(day.totalWithdrawals)}</TableCell>
                        <TableCell className="text-center">
                          {day.hasDifference ? <Badge variant="destructive">Sim</Badge> : <Badge variant="outline">Não</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-8 text-muted-foreground">Nenhuma sessão de caixa neste mês</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionsTable({ sessions }: { sessions: CashierStatementSession[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Abertura</TableHead>
          <TableHead>Fechamento</TableHead>
          <TableHead className="text-right">Vendas</TableHead>
          <TableHead className="text-right">Dinheiro</TableHead>
          <TableHead className="text-right">Cartão</TableHead>
          <TableHead className="text-right">PIX</TableHead>
          <TableHead className="text-right">Sangrias</TableHead>
          <TableHead className="text-right">Diferença</TableHead>
          <TableHead className="text-center">Status</TableHead>
          <TableHead className="text-center">Risco</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((s) => {
          const status = s.closing_status as string | null | undefined;
          const justification = s.closing_justification || s.notes || "";
          return (
            <TableRow key={s.id} title={justification ? `Justificativa: ${justification}` : undefined}>
              <TableCell>{format(new Date(s.opened_at), "HH:mm")}</TableCell>
              <TableCell>{s.closed_at ? format(new Date(s.closed_at), "HH:mm") : <Badge variant="outline">Aberto</Badge>}</TableCell>
              <TableCell className="text-right font-medium">{fmt(s.total_sales)}</TableCell>
              <TableCell className="text-right">{fmt(s.total_cash)}</TableCell>
              <TableCell className="text-right">{fmt(s.total_card)}</TableCell>
              <TableCell className="text-right">{fmt(s.total_pix)}</TableCell>
              <TableCell className="text-right">{fmt(s.total_withdrawals)}</TableCell>
              <TableCell className="text-right">
                {s.balance_difference != null ? (
                  <span className={Math.abs(s.balance_difference) > 5 ? "text-destructive font-medium" : ""}>
                    {fmt(s.balance_difference)}
                  </span>
                ) : "—"}
              </TableCell>
              <TableCell className="text-center">
                {status === "no_difference" && <Badge variant="outline" className="border-green-500 text-green-700">Sem diferença</Badge>}
                {status === "surplus" && <Badge variant="outline" className="border-orange-500 text-orange-700">Sobra</Badge>}
                {status === "shortage" && <Badge variant="destructive">Falta</Badge>}
                {!status && "—"}
              </TableCell>
              <TableCell className="text-center">{riskBadge(s.fraud_risk_level)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
