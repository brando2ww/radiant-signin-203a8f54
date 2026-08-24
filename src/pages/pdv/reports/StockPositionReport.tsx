import { useMemo, useState } from "react";
import { subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { ReportShell, periodLabel } from "@/components/pdv/reports/ReportShell";
import type { ExportKind } from "@/components/pdv/reports/ReportPageHeader";
import { exportReport, brandedFromSheets } from "@/lib/reports/branded-export";
import { useReportBrand } from "@/hooks/use-report-brand";
import { useStockReports } from "@/hooks/reports/use-stock-reports";
import { cn } from "@/lib/utils";

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "alerta" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold", tone === "alerta" && "text-destructive")}>
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Posição de estoque.
 *
 * Responde a pergunta que antes exigia abrir a tela de estoque e somar na
 * cabeça: quanto dinheiro está parado na prateleira, e o que está prestes a
 * faltar. O valor usa custo médio, não o último preço digitado — senão uma
 * compra cara recente infla o estoque inteiro.
 */
export default function StockPositionReport() {
  // A posição é de hoje; o período serve ao "último movimento" e à exportação.
  const [startDate, setStartDate] = useState(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState(new Date());
  const [busca, setBusca] = useState("");

  const { data, isLoading } = useStockReports(startDate, endDate);
  const { businessName } = useReportBrand();
  const rotuloPeriodo = periodLabel(startDate, endDate);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = data?.posicao ?? [];
    const filtradas = q
      ? base.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.category ?? "").toLowerCase().includes(q) ||
            (p.sector ?? "").toLowerCase().includes(q),
        )
      : base;
    // Maior valor primeiro: é onde a conversa sobre estoque parado começa.
    return [...filtradas].sort((a, b) => b.value - a.value);
  }, [data, busca]);

  const onExport = async (kind: ExportKind) => {
    if (!data) return;
    await exportReport(
      kind,
      brandedFromSheets(
        {
          title: "Posição de Estoque",
          businessName,
          periodLabel: rotuloPeriodo,
          filtersLabel: busca ? `Busca: ${busca}` : undefined,
          kpis: [
            { label: "Valor em estoque", value: formatBRL(data.totalEmEstoque) },
            { label: "Abaixo do mínimo", value: String(data.abaixoDoMinimo) },
            { label: "Zerados", value: String(data.zerados) },
            { label: "Sem movimento", value: String(data.semMovimento.length) },
          ],
          filename: "posicao-de-estoque",
        },
        [
          {
            name: "Posição",
            rows: linhas.map((p) => ({
              insumo: p.name,
              categoria: p.category ?? "",
              setor: p.sector ?? "",
              estoque: p.currentStock,
              unidade: p.unit,
              minimo: p.minStock,
              custo: p.unitCost,
              valor: p.value,
              situacao: p.status === "zerado" ? "Zerado" : p.status === "abaixo" ? "Abaixo do mínimo" : "Normal",
            })),
            columns: [
              { key: "insumo", label: "Insumo", width: 32 },
              { key: "categoria", label: "Categoria", width: 18 },
              { key: "setor", label: "Setor", width: 14 },
              { key: "estoque", label: "Estoque", width: 12, type: "number" },
              { key: "unidade", label: "Un.", width: 8 },
              { key: "minimo", label: "Mínimo", width: 12, type: "number" },
              { key: "custo", label: "Custo médio", width: 14, type: "currency" },
              { key: "valor", label: "Valor em estoque", width: 16, type: "currency" },
              { key: "situacao", label: "Situação", width: 18 },
            ],
          },
          {
            name: "Sem movimento",
            rows: data.semMovimento.map((p) => ({
              insumo: p.name,
              categoria: p.category ?? "",
              estoque: p.currentStock,
              unidade: p.unit,
              valor: p.value,
              ultima_entrada: p.lastEntry ?? "",
            })),
            columns: [
              { key: "insumo", label: "Insumo", width: 32 },
              { key: "categoria", label: "Categoria", width: 18 },
              { key: "estoque", label: "Estoque", width: 12, type: "number" },
              { key: "unidade", label: "Un.", width: 8 },
              { key: "valor", label: "Parado (R$)", width: 14, type: "currency" },
              { key: "ultima_entrada", label: "Última entrada", width: 16, type: "date" },
            ],
          },
        ],
      ),
    );
  };

  return (
    <ReportShell
      title="Posição de Estoque"
      description="O que tem na prateleira, quanto vale e o que está prestes a faltar"
      onExport={onExport}
      exportDisabled={isLoading || !data}
      period={{ startDate, endDate, onChange: (s, e) => { setStartDate(s); setEndDate(e); } }}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi
          label="Valor em estoque"
          value={data ? formatBRL(data.totalEmEstoque) : "—"}
          hint="a custo médio"
        />
        <Kpi
          label="Abaixo do mínimo"
          value={data ? String(data.abaixoDoMinimo) : "—"}
          hint="repor antes de faltar"
          tone={data && data.abaixoDoMinimo > 0 ? "alerta" : undefined}
        />
        <Kpi label="Zerados" value={data ? String(data.zerados) : "—"} />
        <Kpi
          label="Parado no período"
          value={data ? formatBRL(data.semMovimento.reduce((s, p) => s + p.value, 0)) : "—"}
          hint={data ? `${data.semMovimento.length} insumo(s) sem movimento` : undefined}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Insumos</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar insumo, categoria ou setor"
              className="h-9 pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : linhas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum insumo encontrado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-left font-medium">Insumo</th>
                    <th className="px-2 py-2 text-left font-medium">Categoria</th>
                    <th className="px-2 py-2 text-right font-medium">Estoque</th>
                    <th className="px-2 py-2 text-right font-medium">Mínimo</th>
                    <th className="px-2 py-2 text-right font-medium">Custo médio</th>
                    <th className="px-2 py-2 text-right font-medium">Valor</th>
                    <th className="px-2 py-2 text-right font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {linhas.map((p) => (
                    <tr key={p.id}>
                      <td className="px-2 py-2">{p.name}</td>
                      <td className="px-2 py-2 text-muted-foreground">{p.category ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {p.currentStock.toLocaleString("pt-BR")} {p.unit}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                        {p.minStock > 0 ? p.minStock.toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{formatBRL(p.unitCost)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
                        {formatBRL(p.value)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {p.status === "zerado" ? (
                          <Badge variant="destructive">Zerado</Badge>
                        ) : p.status === "abaixo" ? (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                            Abaixo
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Normal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}
