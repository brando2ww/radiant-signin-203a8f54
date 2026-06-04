import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight, TrendingUp, CalendarIcon } from "lucide-react";
import { usePDVCashFlow } from "@/hooks/use-pdv-cash-flow";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/pdv/shared/ErrorState";
import { EmptyState } from "@/components/pdv/shared/EmptyState";
import { BarChart3 } from "lucide-react";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CashFlow() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const { data, isLoading, isError, refetch } = usePDVCashFlow(selectedMonth);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Fluxo de Caixa</h1>
          <p className="text-muted-foreground mt-1">
            Visualize entradas e saídas financeiras
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedMonth}
              onSelect={(d) => d && setSelectedMonth(d)}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
      </div>

      {isError && (
        <ErrorState
          title="Não foi possível carregar o fluxo de caixa"
          message="Verifique sua conexão e tente novamente."
          onRetry={() => refetch()}
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Entradas</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-28" /> : isError ? (
              <div className="text-2xl font-bold text-muted-foreground">—</div>
            ) : (
              <>
                <div className="text-2xl font-bold text-success">{fmt(data?.totalIn || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Neste mês</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saídas</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-28" /> : isError ? (
              <div className="text-2xl font-bold text-muted-foreground">—</div>
            ) : (
              <>
                <div className="text-2xl font-bold text-destructive">{fmt(data?.totalOut || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Neste mês</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saldo</CardTitle>
            <TrendingUp className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-28" /> : isError ? (
              <div className="text-2xl font-bold text-muted-foreground">—</div>
            ) : (
              <>
                <div className={`text-2xl font-bold ${(data?.balance || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {fmt(data?.balance || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Resultado do mês</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolução Mensal</CardTitle>
          <CardDescription>Entradas vs saídas — últimos 6 meses</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (data?.monthlyChart?.length || 0) > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data!.monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={(v) => `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`} className="text-xs" />
                <Tooltip
                  formatter={(value: number) => fmt(value)}
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                />
                <Legend />
                <Bar dataKey="entradas" fill="hsl(var(--success))" name="Entradas" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" fill="hsl(var(--destructive))" name="Saídas" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={BarChart3} title="Sem movimentações no período" className="h-[300px] py-0" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projeção de Saldo</CardTitle>
          <CardDescription>Baseado em contas a pagar e receber pendentes</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm">Saldo Atual</span>
                <span className="font-bold">{fmt(data?.balance || 0)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-success">+ A Receber</span>
                <span className="font-medium text-success">{fmt(data?.pendingReceivable || 0)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-destructive">- A Pagar</span>
                <span className="font-medium text-destructive">{fmt(data?.pendingPayable || 0)}</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-muted/50 rounded-md px-3">
                <span className="font-semibold">Saldo Projetado</span>
                <span className={`font-bold text-lg ${(data?.projectedBalance || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {fmt(data?.projectedBalance || 0)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
