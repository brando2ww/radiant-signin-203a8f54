import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieChart as PieChartIcon, TrendingDown, TrendingUp, RefreshCw, CalendarIcon, BarChart3, AlertTriangle, Info } from "lucide-react";
import { EmptyState } from "@/components/pdv/shared/EmptyState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePDVCmv } from "@/hooks/use-pdv-cmv";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))", "#8b5cf6", "#06b6d4"];

export default function GeneralCMV() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const { data, isLoading } = usePDVCmv(selectedMonth);

  const pieData = data
    ? Object.entries(data.ingredientCategoryTotals).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">CMV Geral</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-sm">Visão consolidada do Custo das Mercadorias Vendidas</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  CMV calculado por custo de produção: ingredientes × quantidade vendida. Não inclui variação de estoque físico.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
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
      </div>

      {!isLoading && (data?.productsWithoutCost ?? 0) > 0 && (
        <Alert className="border-warning/50 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning-foreground">
            {data!.productsWithoutCost} produto{data!.productsWithoutCost !== 1 ? "s" : ""} sem custo
            cadastrado não {data!.productsWithoutCost !== 1 ? "estão incluídos" : "está incluído"} no CMV.
            Cadastre receitas ou defina o custo unitário para obter resultados precisos.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "CMV Total", value: fmt(data?.totalCmv || 0), color: "text-warning", sub: "no mês atual" },
          { label: "Receita Total", value: fmt(data?.totalRevenue || 0), color: "text-success", sub: "no mês atual" },
          { label: "CMV %", value: `${(data?.cmvPercent || 0).toFixed(1)}%`, color: "", sub: "sobre a receita" },
          { label: "Margem Bruta", value: `${(data?.grossMargin || 0).toFixed(1)}%`, color: "text-primary", sub: "lucro bruto" },
        ].map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-24" /> : (
                <>
                  <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolução do CMV</CardTitle>
            <CardDescription>Últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[300px] w-full" /> : (data?.evolution?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data?.evolution || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis tickFormatter={(v) => `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`} className="text-xs" />
                  <RechartsTooltip formatter={(value: number) => fmt(value)} />
                  <Legend />
                  <Bar dataKey="revenue" fill="hsl(var(--success))" name="Receita" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cmv" fill="hsl(var(--warning))" name="CMV" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={BarChart3}
                title="Sem histórico de CMV"
                description="Ainda não há dados suficientes para gerar a evolução nos últimos meses."
                className="h-[300px] py-0"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Composição do CMV</CardTitle>
            <CardDescription>Por categoria de ingredientes</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[300px] w-full" /> : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => fmt(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <PieChartIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Cadastre receitas para ver a composição</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Análise Comparativa</CardTitle>
          <CardDescription>Desempenho vs mês anterior</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "CMV", value: `${(data?.cmvPercent || 0).toFixed(1)}%`, prev: `${(data?.prevCmvPct || 0).toFixed(1)}%`, icon: TrendingDown, bg: "bg-warning/10", iconColor: "text-warning" },
              { label: "Receita", value: fmt(data?.totalRevenue || 0), prev: fmt(data?.prevRevenue || 0), icon: TrendingUp, bg: "bg-success/10", iconColor: "text-success" },
              { label: "Margem", value: `${(data?.grossMargin || 0).toFixed(1)}%`, prev: `${(data?.prevMargin || 0).toFixed(1)}%`, icon: PieChartIcon, bg: "bg-primary/10", iconColor: "text-primary" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 p-4 border rounded-lg">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${item.bg}`}>
                  <item.icon className={`h-5 w-5 ${item.iconColor}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                  <p className="text-lg font-bold">{isLoading ? "..." : item.value}</p>
                  <p className="text-xs text-muted-foreground">anterior: {isLoading ? "..." : item.prev}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recomendações</CardTitle>
          <CardDescription>Insights para melhorar sua margem</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-muted-foreground">
            {data && data.analyzedCount === 0 ? (
              <>
                <p>• Configure receitas para todos os produtos para análise precisa do CMV</p>
                <p>• Mantenha o cadastro de ingredientes atualizado com preços corretos</p>
              </>
            ) : (
              <>
                {data && data.cmvPercent > 35 && <p>• ⚠️ Seu CMV está acima de 35%. Considere renegociar com fornecedores ou ajustar receitas.</p>}
                {data && data.cmvPercent <= 35 && data.cmvPercent > 0 && <p>• ✅ Seu CMV está dentro da faixa ideal (25%-35%).</p>}
                <p>• Monitore produtos com margem abaixo de 30%</p>
                <p>• CMV ideal para restaurantes: 25% a 35% da receita</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
