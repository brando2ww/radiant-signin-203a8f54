import { useMemo, useState } from "react";
import { subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { ReportShell, periodLabel } from "@/components/pdv/reports/ReportShell";
import type { ExportKind } from "@/components/pdv/reports/ReportPageHeader";
import { exportReport, brandedFromSheets } from "@/lib/reports/branded-export";
import { useReportBrand } from "@/hooks/use-report-brand";
import { useStockReports } from "@/hooks/reports/use-stock-reports";

type Classe = "A" | "B" | "C" | "todas";

const EXPLICACAO: Record<"A" | "B" | "C", string> = {
  A: "Concentram 80% do que você gasta em insumo. Negociar preço aqui move o resultado.",
  B: "Os 15% seguintes. Importam, mas não decidem o mês.",
  C: "A cauda longa: muitos itens, pouco dinheiro. Controlar item a item custa mais do que economiza.",
};

/**
 * Giro e curva ABC.
 *
 * A pergunta não é "o que sai mais", é "onde o dinheiro sai". Um insumo barato
 * que gira muito costuma pesar menos do que um caro que gira pouco — e a curva
 * ABC ordena por valor consumido justamente para não confundir os dois.
 *
 * Cobertura é o outro lado: quantos períodos o estoque atual aguenta no ritmo
 * observado. Cobertura alta em item de classe A é dinheiro dormindo.
 */
export default function StockTurnoverReport() {
  const [startDate, setStartDate] = useState(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState(new Date());
  const [classe, setClasse] = useState<Classe>("todas");

  const { data, isLoading } = useStockReports(startDate, endDate);
  const { businessName } = useReportBrand();
  const rotuloPeriodo = periodLabel(startDate, endDate);

  const linhas = useMemo(() => {
    const base = (data?.giro ?? []).filter((g) => g.consumoValor > 0 || g.entradas > 0);
    return classe === "todas" ? base : base.filter((g) => g.classe === classe);
  }, [data, classe]);

  const porClasse = (c: "A" | "B" | "C") =>
    (data?.giro ?? []).filter((g) => g.classe === c && g.consumoValor > 0);

  const onExport = async (kind: ExportKind) => {
    if (!data) return;
    await exportReport(
      kind,
      brandedFromSheets(
        {
          title: "Giro e Curva ABC",
          businessName,
          periodLabel: rotuloPeriodo,
          filtersLabel: classe === "todas" ? undefined : `Classe: ${classe}`,
          kpis: [
            { label: "Consumo no período", value: formatBRL(data.consumoTotal) },
            { label: "Itens classe A", value: String(porClasse("A").length) },
            { label: "Sem movimento", value: String(data.semMovimento.length) },
          ],
          filename: "giro-e-curva-abc",
        },
        [
          {
            name: "Giro",
            rows: linhas.map((g) => ({
              insumo: g.name,
              categoria: g.category ?? "",
              classe: g.classe,
              entradas: g.entradas,
              saidas: g.saidas,
              unidade: g.unit,
              consumo: g.consumoValor,
              estoque: g.currentStock,
              cobertura: g.cobertura ?? "",
            })),
            columns: [
              { key: "insumo", label: "Insumo", width: 32 },
              { key: "categoria", label: "Categoria", width: 18 },
              { key: "classe", label: "Classe", width: 8 },
              { key: "entradas", label: "Entradas", width: 12, type: "number" },
              { key: "saidas", label: "Saídas", width: 12, type: "number" },
              { key: "unidade", label: "Un.", width: 8 },
              { key: "consumo", label: "Consumo (R$)", width: 16, type: "currency" },
              { key: "estoque", label: "Estoque atual", width: 14, type: "number" },
              { key: "cobertura", label: "Cobertura (períodos)", width: 18, type: "number" },
            ],
          },
        ],
      ),
    );
  };

  return (
    <ReportShell
      title="Giro e Curva ABC"
      description="Quais insumos consomem o seu dinheiro e quais estão parados"
      onExport={onExport}
      exportDisabled={isLoading || !data}
      period={{ startDate, endDate, onChange: (s, e) => { setStartDate(s); setEndDate(e); } }}
    >
      <div className="grid gap-3 md:grid-cols-4">
        {(["A", "B", "C"] as const).map((c) => {
          const itens = porClasse(c);
          const valor = itens.reduce((s, g) => s + g.consumoValor, 0);
          return (
            <Card key={c}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Badge variant={c === "A" ? "default" : "secondary"}>Classe {c}</Badge>
                  <span className="text-xs text-muted-foreground">{itens.length} itens</span>
                </div>
                <p className="mt-2 text-2xl font-semibold">{formatBRL(valor)}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{EXPLICACAO[c]}</p>
              </CardContent>
            </Card>
          );
        })}
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Consumo total</p>
            <p className="mt-1 text-2xl font-semibold">
              {data ? formatBRL(data.consumoTotal) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              saída de insumo a custo, no período
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Insumos por consumo</CardTitle>
          <div className="flex gap-1">
            {(["todas", "A", "B", "C"] as const).map((c) => (
              <Button
                key={c}
                size="sm"
                variant={classe === c ? "secondary" : "ghost"}
                onClick={() => setClasse(c)}
              >
                {c === "todas" ? "Todas" : `Classe ${c}`}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : linhas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum movimento de estoque no período. Entradas por nota e saídas por venda
              alimentam este relatório.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-left font-medium">Insumo</th>
                    <th className="px-2 py-2 text-left font-medium">Classe</th>
                    <th className="px-2 py-2 text-right font-medium">Entradas</th>
                    <th className="px-2 py-2 text-right font-medium">Saídas</th>
                    <th className="px-2 py-2 text-right font-medium">Consumo</th>
                    <th className="px-2 py-2 text-right font-medium">Estoque</th>
                    <th className="px-2 py-2 text-right font-medium">Cobertura</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {linhas.map((g) => (
                    <tr key={g.id}>
                      <td className="px-2 py-2">
                        {g.name}
                        {g.category && (
                          <span className="text-muted-foreground"> · {g.category}</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant={g.classe === "A" ? "default" : "secondary"} className="text-[10px]">
                          {g.classe}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                        {g.entradas.toLocaleString("pt-BR")} {g.unit}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {g.saidas.toLocaleString("pt-BR")} {g.unit}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-medium">
                        {formatBRL(g.consumoValor)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                        {g.currentStock.toLocaleString("pt-BR")}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {g.cobertura == null
                          ? "—"
                          : `${g.cobertura.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×`}
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
