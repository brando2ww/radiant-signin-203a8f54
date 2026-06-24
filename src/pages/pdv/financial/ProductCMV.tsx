import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageSearch, CalendarIcon, AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePDVCmv } from "@/hooks/use-pdv-cmv";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function getMarginBadge(margin: number) {
  if (margin >= 70) return <Badge className="bg-success text-success-foreground">Ótima</Badge>;
  if (margin >= 50) return <Badge className="bg-primary text-primary-foreground">Boa</Badge>;
  if (margin >= 30) return <Badge className="bg-warning text-warning-foreground">Regular</Badge>;
  return <Badge variant="destructive">Baixa</Badge>;
}

export default function ProductCMV() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const { data, isLoading } = usePDVCmv(selectedMonth);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">CMV por Produto</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-sm">Análise detalhada de custos e margens por produto</p>
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
          { label: "Produtos Analisados", value: String(data?.analyzedCount || 0), sub: "custo calculado por receitas de produção" },
          { label: "Margem Média", value: `${(data?.avgMargin || 0).toFixed(1)}%`, sub: "dos produtos" },
          { label: "Melhor Margem", value: `${(data?.bestMargin || 0).toFixed(1)}%`, sub: "produto mais lucrativo", color: "text-success" },
          { label: "Pior Margem", value: `${(data?.worstMargin || 0).toFixed(1)}%`, sub: "requer atenção", color: "text-destructive" },
        ].map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <div className={`text-2xl font-bold ${c.color || ""}`}>{c.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Análise de Produtos</CardTitle>
          <CardDescription>Custos, preços e margens por produto</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (data?.productCmvList?.length || 0) > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.productCmvList.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.category || "—"}</TableCell>
                    <TableCell className="text-right">{fmt(p.cost)}</TableCell>
                    <TableCell className="text-right">{fmt(p.price)}</TableCell>
                    <TableCell className="text-right font-medium">{p.margin.toFixed(1)}%</TableCell>
                    <TableCell className="text-center">{getMarginBadge(p.margin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <PackageSearch className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum produto com receita cadastrada</p>
              <p className="text-sm mt-2">Configure receitas em Produtos → Editar Produto → Aba Receita</p>
              <p className="text-sm">para visualizar análise de CMV</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Classificação de Produtos</CardTitle>
          <CardDescription>Por margem de contribuição</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { badge: <Badge className="bg-success text-success-foreground">Ótima</Badge>, desc: "Margem acima de 70%", count: data?.classification?.otima || 0 },
              { badge: <Badge className="bg-primary text-primary-foreground">Boa</Badge>, desc: "Margem entre 50% e 70%", count: data?.classification?.boa || 0 },
              { badge: <Badge className="bg-warning text-warning-foreground">Regular</Badge>, desc: "Margem entre 30% e 50%", count: data?.classification?.regular || 0 },
              { badge: <Badge variant="destructive">Baixa</Badge>, desc: "Margem abaixo de 30%", count: data?.classification?.baixa || 0 },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {item.badge}
                  <span className="text-sm">{item.desc}</span>
                </div>
                <span className="font-bold">{isLoading ? "..." : `${item.count} produtos`}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
