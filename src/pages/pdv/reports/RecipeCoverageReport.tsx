import { useMemo, useState } from "react";
import { subDays } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, ChefHat, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { ReportShell, periodLabel } from "@/components/pdv/reports/ReportShell";
import type { ExportKind } from "@/components/pdv/reports/ReportPageHeader";
import { exportReport, brandedFromSheets } from "@/lib/reports/branded-export";
import { useReportBrand } from "@/hooks/use-report-brand";
import { useRecipeCoverage } from "@/hooks/reports/use-recipe-coverage";
import { usePDVProducts } from "@/hooks/use-pdv-products";
import { ProductDialog } from "@/components/pdv/ProductDialog";

/**
 * Fichas técnicas pendentes.
 *
 * Existe porque o custo de não ter ficha é invisível: o produto vende, não baixa
 * insumo nenhum e ainda aparece com margem de 100% no relatório. Quem olha só a
 * lista de produtos não tem como saber quais faltam nem por onde começar.
 *
 * A ordem é por DINHEIRO, com percentual acumulado ao lado, porque a decisão
 * real é "quantos preciso montar hoje para o número parar de mentir" — e a
 * resposta costuma ser muito menos do que o total de produtos.
 */
export default function RecipeCoverageReport() {
  const [startDate, setStartDate] = useState(subDays(new Date(), 90));
  const [endDate, setEndDate] = useState(new Date());
  const [emEdicao, setEmEdicao] = useState<any>(null);

  const { data, isLoading } = useRecipeCoverage(startDate, endDate);
  const { businessName } = useReportBrand();
  const { products, updateProduct, isUpdating } = usePDVProducts();
  const rotuloPeriodo = periodLabel(startDate, endDate);

  const cobertura = data?.cobertura ?? 0;
  const receitaDescoberta = (data?.receitaTotal ?? 0) - (data?.receitaComFicha ?? 0);

  // Acumulado: quanto da receita descoberta some a cada ficha montada, da mais
  // pesada para a mais leve.
  const linhas = useMemo(() => {
    let acumulado = 0;
    const total = data?.receitaTotal || 0;
    return (data?.produtosSemFicha ?? []).map((p) => {
      acumulado += p.receita;
      return { ...p, acumulado: total > 0 ? acumulado / total : 0 };
    });
  }, [data]);

  /** Quantas fichas resolvem 80% do que hoje está descoberto. */
  const ate80 = useMemo(() => {
    const alvo = receitaDescoberta * 0.8;
    let soma = 0;
    for (let i = 0; i < linhas.length; i++) {
      soma += linhas[i].receita;
      if (soma >= alvo) return i + 1;
    }
    return linhas.length;
  }, [linhas, receitaDescoberta]);

  const abrirFicha = (productId: string) => {
    const p = (products ?? []).find((x: any) => x.id === productId);
    if (p) setEmEdicao(p);
  };

  const onExport = async (kind: ExportKind) => {
    if (!data) return;
    await exportReport(
      kind,
      brandedFromSheets(
        {
          title: "Fichas técnicas pendentes",
          businessName,
          periodLabel: rotuloPeriodo,
          kpis: [
            { label: "Receita com ficha", value: `${Math.round(cobertura * 100)}%` },
            { label: "Receita descoberta", value: formatBRL(receitaDescoberta) },
            { label: "Produtos sem ficha", value: String(linhas.length) },
          ],
          filename: "fichas-tecnicas-pendentes",
        },
        [
          {
            name: "Produtos sem ficha",
            rows: linhas.map((p) => ({
              produto: p.name,
              quantidade: p.quantidade,
              receita: p.receita,
              participacao: `${(p.participacao * 100).toFixed(1)}%`,
            })),
            columns: [
              { key: "produto", label: "Produto", width: 36 },
              { key: "quantidade", label: "Vendidos", width: 12, type: "number" },
              { key: "receita", label: "Receita (R$)", width: 16, type: "currency" },
              { key: "participacao", label: "% da receita", width: 14 },
            ],
          },
          {
            name: "Adicionais sem ficha",
            rows: (data.adicionaisSemFicha ?? []).map((a) => ({
              adicional: a.nome,
              vezes: a.vezes,
              receita: a.receita,
              cadastros: a.cadastros,
            })),
            columns: [
              { key: "adicional", label: "Adicional", width: 36 },
              { key: "vezes", label: "Vezes escolhido", width: 16, type: "number" },
              { key: "receita", label: "Receita extra (R$)", width: 18, type: "currency" },
              { key: "cadastros", label: "Cadastros no cardápio", width: 20, type: "number" },
            ],
          },
        ],
      ),
    );
  };

  return (
    <ReportShell
      title="Fichas técnicas pendentes"
      description="Produto sem ficha não baixa estoque, não tem custo e aparece com margem de 100%"
      onExport={onExport}
      exportDisabled={isLoading || !data}
      period={{ startDate, endDate, onChange: (s, e) => { setStartDate(s); setEndDate(e); } }}
    >
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardContent className="pt-6">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">Receita com ficha técnica</span>
                  <span className="text-2xl font-semibold">{Math.round(cobertura * 100)}%</span>
                </div>
                <Progress value={cobertura * 100} className="mt-2" />
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  De {formatBRL(data.receitaTotal)} vendidos no período,{" "}
                  <strong className="text-foreground">{formatBRL(receitaDescoberta)}</strong> saíram
                  de produtos sem ficha. Esse pedaço não consumiu insumo nenhum no sistema.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <ChefHat className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Por onde começar</span>
                </div>
                <p className="mt-2 text-2xl font-semibold">{ate80}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {linhas.length === 0
                    ? "Nada pendente por aqui."
                    : `ficha(s) resolvem 80% do que está descoberto. São ${linhas.length} produtos no total, mas o peso está nos primeiros.`}
                </p>
              </CardContent>
            </Card>
          </div>

          {linhas.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-3 py-8">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                <div>
                  <p className="font-medium">Tudo o que vendeu no período tem ficha</p>
                  <p className="text-sm text-muted-foreground">
                    O custo e a baixa de estoque estão saindo corretos.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <p className="text-sm font-medium">Produtos sem ficha</p>
                  <span className="text-xs text-muted-foreground">
                    ordenados por receita no período
                  </span>
                </div>
                <div className="divide-y">
                  {linhas.map((p, i) => (
                    <div key={p.productId} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.quantidade.toLocaleString("pt-BR")} vendidos ·{" "}
                          {(p.participacao * 100).toFixed(1)}% da receita
                          {i < ate80 && (
                            <span className="ml-1 text-amber-600">· prioridade</span>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatBRL(p.receita)}
                      </span>
                      <Button size="sm" variant="outline" className="shrink-0" onClick={() => abrirFicha(p.productId)}>
                        Montar ficha
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.adicionaisSemFicha.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-medium">Adicionais sem ficha</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    O adicional sai do estoque igual ao prato. Quando o mesmo nome aparece em
                    vários cadastros, cada grupo do cardápio tem o seu · montar a ficha em um não
                    cobre os outros. É por isso que o código do catálogo importa.
                  </p>
                </div>
                <div className="divide-y">
                  {data.adicionaisSemFicha.slice(0, 30).map((a) => (
                    <div key={a.nome} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{a.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.vezes.toLocaleString("pt-BR")}x escolhido
                          {a.cadastros > 1 && (
                            <span className="ml-1">· {a.cadastros} cadastros no cardápio</span>
                          )}
                        </p>
                      </div>
                      {a.cadastros > 1 && (
                        <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          repetido
                        </Badge>
                      )}
                      <span className="shrink-0 text-sm tabular-nums">{formatBRL(a.receita)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <ProductDialog
        open={!!emEdicao}
        onOpenChange={(o) => !o && setEmEdicao(null)}
        product={emEdicao}
        onSubmit={(d: any) =>
          updateProduct({ id: emEdicao.id, updates: d }, { onSuccess: () => setEmEdicao(null) })
        }
        isSubmitting={isUpdating}
      />
    </ReportShell>
  );
}
