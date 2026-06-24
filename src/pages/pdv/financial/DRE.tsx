import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, CalendarIcon, FileBarChart2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/pdv/shared/EmptyState";
import { usePDVDre } from "@/hooks/use-pdv-dre";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/lib/csv-export";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pctFmt = (v: number) => `${v.toFixed(1)}%`;

export default function DRE() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const { data, isLoading } = usePDVDre(selectedMonth);

  const handleExport = () => {
    if (!data) return;
    const lines = [
      "DRE - Demonstração do Resultado",
      `Período: ${format(selectedMonth, "MMMM yyyy", { locale: ptBR })}`,
      "",
      `RECEITA BRUTA;${fmt(data.grossRevenue)}`,
      `  Vendas no PDV;${fmt(data.pdvSales)}`,
      `  Vendas Delivery;${fmt(data.deliverySales)}`,
      `(-) DEDUÇÕES;${fmt(data.deductions)}`,
      `  Descontos;${fmt(data.totalDiscounts)}`,
      `  Cancelamentos;${fmt(data.totalCancellations)}`,
      `  Taxas de meios de pagamento;${fmt(data.paymentFees || 0)}`,
      `= RECEITA LÍQUIDA;${fmt(data.netRevenue)}`,
      `(-) CMV;${fmt(data.cmv)}`,
      `= LUCRO BRUTO;${fmt(data.grossProfit)}`,
      `(-) DESPESAS OPERACIONAIS;${fmt(data.totalExpenses)}`,
      ...Object.entries(data.expensesByCategory).map(([k, v]) => `  ${k};${fmt(v as number)}`),
      `= LUCRO OPERACIONAL;${fmt(data.operatingProfit)}`,
      `= LUCRO LÍQUIDO;${fmt(data.netProfit)}`,
    ];
    downloadCsv(`DRE_${format(selectedMonth, "yyyy-MM")}.csv`, lines);
  };

  const DRELine = ({ label, value, indent, bold, bg, color, tooltip }: {
    label: string; value: number; indent?: boolean; bold?: boolean; bg?: string; color?: string; tooltip?: string;
  }) => (
    <div className={`flex justify-between items-center ${indent ? "pl-4 text-sm" : ""} ${bold ? "font-bold text-lg" : ""} ${bg || ""} ${bg ? "p-3 rounded" : "py-1"}`}>
      <span className={`flex items-center gap-1 ${indent ? "text-muted-foreground" : ""}`}>
        {label}
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
      <span className={color || ""}>{fmt(value)}</span>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">DRE - Demonstração do Resultado</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-sm">Análise detalhada do resultado do exercício</p>
            <Badge variant="outline" className="text-xs gap-1">
              <FileBarChart2 className="h-3 w-3" />
              Despesas por competência
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={selectedMonth} onSelect={(d) => d && setSelectedMonth(d)} locale={ptBR} />
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={handleExport} disabled={!data}>
            <Download className="mr-2 h-4 w-4" />
            Exportar DRE
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Demonstrativo de Resultado</CardTitle>
          <CardDescription>Período: {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : data ? (
            <div className="space-y-3">
              <div className="border-b pb-2">
                <DRELine label="RECEITA BRUTA" value={data.grossRevenue} bold color="text-success" />
              </div>
              <DRELine label="Vendas no PDV" value={data.pdvSales} indent />
              <DRELine label="Vendas Delivery" value={data.deliverySales} indent />

              <div className="border-b pb-2 pt-2">
                <DRELine label="(-) DEDUÇÕES" value={data.deductions} bold={false} color="text-destructive" />
              </div>
              <DRELine label="Descontos concedidos" value={data.totalDiscounts} indent />
              <DRELine label="Cancelamentos" value={data.totalCancellations} indent />
              <DRELine label="Taxas de meios de pagamento" value={data.paymentFees || 0} indent />

              <DRELine label="= RECEITA LÍQUIDA" value={data.netRevenue} bold bg="bg-muted/50" />

              <div className="border-b pb-2 pt-2">
                <DRELine
                  label="(-) CMV (Custo das Mercadorias Vendidas)"
                  value={data.cmv}
                  color="text-destructive"
                  tooltip="Calculado com base no custo das receitas de produção (ingredientes × quantidade vendida). Produtos sem receita ou custo cadastrado são excluídos."
                />
              </div>

              <DRELine label="= LUCRO BRUTO" value={data.grossProfit} bold bg="bg-success/10" color="text-success" />

              <div className="border-b pb-2 pt-2">
                <DRELine
                  label="(-) DESPESAS OPERACIONAIS"
                  value={data.totalExpenses}
                  color="text-destructive"
                  tooltip="Despesas reconhecidas pela data de competência — inclui lançamentos pendentes e pagos do período, excluindo cancelados."
                />
              </div>
              {Object.entries(data.expensesByCategory).map(([cat, val]) => (
                <DRELine key={cat} label={cat} value={val as number} indent />
              ))}
              {Object.keys(data.expensesByCategory).length === 0 && (
                <p className="text-sm text-muted-foreground pl-4">Nenhuma despesa registrada no período</p>
              )}

              <DRELine label="= LUCRO OPERACIONAL" value={data.operatingProfit} bold bg="bg-muted/50" />
              <DRELine label="= LUCRO LÍQUIDO" value={data.netProfit} bold bg="bg-primary/10" color="text-primary" />
            </div>
          ) : (
            <EmptyState
              icon={FileBarChart2}
              title="Nenhum dado disponível"
              description="Não há movimento financeiro para o período selecionado."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Análise de Margens</CardTitle>
          <CardDescription>Indicadores de rentabilidade</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Margem Bruta</p>
                <p className="text-2xl font-bold">{pctFmt(data?.marginGross || 0)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Margem Operacional</p>
                <p className="text-2xl font-bold">{pctFmt(data?.marginOperating || 0)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Margem Líquida</p>
                <p className="text-2xl font-bold">{pctFmt(data?.marginNet || 0)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
