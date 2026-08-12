/**
 * Relatórios de Compras.
 *
 * Diferente da aba "Compras" do hub de relatórios (/pdv/relatorios?tab=purchases),
 * que continua existindo: esta página trata colunas DATE como string (a outra usa
 * toISOString e por isso inclui um dia a mais na virada de mês) e compara preço
 * por "última compra vs anterior" em vez de média de período — com ~1,5 compras
 * por insumo, média de período produziria quase só ruído.
 */
import { useMemo, useState } from "react";
import { subDays } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertCircle, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { PurchaseKpi } from "@/components/pdv/purchases/reports/PurchaseKpi";
import { FilterCombobox } from "@/components/pdv/purchases/reports/FilterCombobox";
import { PriceVariationSection } from "@/components/pdv/purchases/reports/PriceVariationSection";
import { SuppliersSection } from "@/components/pdv/purchases/reports/SuppliersSection";
import { QuotationsSection } from "@/components/pdv/purchases/reports/QuotationsSection";
import { ReceivingSection } from "@/components/pdv/purchases/reports/ReceivingSection";
import { AbcSection } from "@/components/pdv/purchases/reports/AbcSection";
import { usePurchaseReports, useQuotationAnalytics } from "@/hooks/reports/use-purchase-reports";
import { useBusinessSettings } from "@/hooks/use-business-settings";
import { formatBRL } from "@/lib/format";
import { dateOnly, formatDateOnly } from "@/lib/purchase-reports/dates";
import {
  exportPurchaseReportsPdf, exportPurchaseReportsXlsx,
} from "@/lib/purchase-reports/export";

/** Vazio = sem filtro. É o que o FilterCombobox devolve ao escolher "Todos". */
const ALL = "";

export default function PurchaseReports() {
  const [start, setStart] = useState(() => subDays(new Date(), 89));
  const [end, setEnd] = useState(() => new Date());
  const [supplierId, setSupplierId] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [ingredientCategory, setIngredientCategory] = useState<string>(ALL);
  const [tab, setTab] = useState("price");
  const [exporting, setExporting] = useState(false);

  const { settings } = useBusinessSettings();

  const filters = useMemo(
    () => ({
      start,
      end,
      supplierIds: supplierId === ALL ? undefined : [supplierId],
      supplierCategories: category === ALL ? undefined : [category],
      ingredientCategories: ingredientCategory === ALL ? undefined : [ingredientCategory],
    }),
    [start, end, supplierId, category, ingredientCategory],
  );

  const { data, suppliers, ingredients, isLoading, error, priceSeries } =
    usePurchaseReports(filters);
  // Cotações só carregam quando a aba abre (ou quando exporta) — são 4 queries.
  const [quotationsWanted, setQuotationsWanted] = useState(false);
  const quotations = useQuotationAnalytics(filters, quotationsWanted || tab === "quotations");

  const categories = useMemo(
    () => ([...new Set(suppliers.map((s) => s.category).filter(Boolean))] as string[]).sort(),
    [suppliers],
  );

  const ingredientCategories = useMemo(
    () => ([...new Set(ingredients.map((i) => i.category).filter(Boolean))] as string[]).sort(),
    [ingredients],
  );

  const periodLabel = `${dateOnly(start)}_a_${dateOnly(end)}`;
  const dq = data?.dataQuality;

  const runExport = async (kind: "xlsx" | "pdf") => {
    if (!data) return;
    setQuotationsWanted(true);
    const ctx = {
      businessName: settings?.business_name || "Estabelecimento",
      periodLabel,
      data,
      quotations: quotations.block,
    };
    try {
      setExporting(true);
      if (kind === "xlsx") exportPurchaseReportsXlsx(ctx);
      else await exportPurchaseReportsPdf(ctx);
    } catch {
      toast.error("Não foi possível gerar o arquivo.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios de Compras</h1>
          <p className="text-sm text-muted-foreground">
            Período de {formatDateOnly(dateOnly(start))} a {formatDateOnly(dateOnly(end))}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={!data || exporting}>
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => runExport("xlsx")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel (todas as abas)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runExport("pdf")}>
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ReportDateFilter
        startDate={start}
        endDate={end}
        onChange={(s, e) => {
          setStart(s);
          setEnd(e);
        }}
        extra={
          <div className="ml-auto flex flex-wrap items-end gap-3">
            <FilterCombobox
              label="Fornecedor"
              value={supplierId}
              allLabel="Todos os fornecedores"
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              onChange={setSupplierId}
              width="w-[200px]"
            />
            {/* Duas categorias diferentes e fáceis de confundir: a do fornecedor
                (de quem eu compro) e a do insumo (o que eu comprei). */}
            {ingredientCategories.length > 0 && (
              <FilterCombobox
                label="Categoria do insumo"
                value={ingredientCategory}
                allLabel="Todas"
                options={ingredientCategories.map((c) => ({ value: c, label: c }))}
                onChange={setIngredientCategory}
              />
            )}
            {categories.length > 0 && (
              <FilterCombobox
                label="Categoria do fornecedor"
                value={category}
                allLabel="Todas"
                options={categories.map((c) => ({ value: c, label: c }))}
                onChange={setCategory}
              />
            )}
          </div>
        }
      />

      {error ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Não foi possível carregar os dados de compras.
          </CardContent>
        </Card>
      ) : dq?.likelyPermissionIssue ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum dado visível para este usuário. Isso costuma ser permissão de acesso, não
            ausência de compras · fale com o proprietário do estabelecimento.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <PurchaseKpi
              label="Total comprado"
              value={formatBRL(data?.kpis.spend ?? 0)}
              hint={
                data?.kpis.spendDeltaPct != null
                  ? `${data.kpis.spendDeltaPct > 0 ? "+" : ""}${(data.kpis.spendDeltaPct * 100).toFixed(1)}% vs período anterior`
                  : "sem base no período anterior"
              }
              loading={isLoading}
            />
            <PurchaseKpi
              label="Pedidos"
              value={String(data?.kpis.orders ?? 0)}
              hint={`ticket médio ${formatBRL(data?.kpis.avgOrder ?? 0)}`}
              loading={isLoading}
            />
            <PurchaseKpi
              label="Custo a mais no período"
              value={formatBRL(data?.price.totals.impactUp ?? 0)}
              hint={`${data?.price.topIncreases.length ?? 0} insumo(s) subiram de preço`}
              tone="up"
              loading={isLoading}
            />
            <PurchaseKpi
              label="Economia no período"
              value={formatBRL(Math.abs(data?.price.totals.impactDown ?? 0))}
              hint={`${data?.price.topDecreases.length ?? 0} insumo(s) baixaram de preço`}
              tone="down"
              loading={isLoading}
            />
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="price">Preços</TabsTrigger>
              <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
              <TabsTrigger value="quotations">Cotações</TabsTrigger>
              <TabsTrigger value="receiving">Recebimentos</TabsTrigger>
              <TabsTrigger value="abc">Curva ABC</TabsTrigger>
              <TabsTrigger value="quality">Qualidade dos dados</TabsTrigger>
            </TabsList>

            <TabsContent value="price" className="mt-4">
              <PriceVariationSection
                block={data?.price ?? null}
                loading={isLoading}
                getSeries={priceSeries}
              />
            </TabsContent>

            <TabsContent value="suppliers" className="mt-4">
              <SuppliersSection block={data?.suppliers ?? null} loading={isLoading} />
            </TabsContent>

            <TabsContent value="quotations" className="mt-4">
              <QuotationsSection block={quotations.block} loading={quotations.isLoading} />
            </TabsContent>

            <TabsContent value="receiving" className="mt-4">
              <ReceivingSection
                block={data?.receiving ?? null}
                loading={isLoading}
                periodStart={dateOnly(start)}
              />
            </TabsContent>

            <TabsContent value="abc" className="mt-4">
              <AbcSection block={data?.abc ?? null} loading={isLoading} />
            </TabsContent>

            <TabsContent value="quality" className="mt-4">
              <Card>
                <CardContent className="space-y-2 py-4 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Serve para auditar um número que pareceu estranho, em vez de desconfiar do
                    relatório inteiro.
                  </p>
                  <ul className="space-y-1">
                    <li>Itens sem preço informado: <strong>{dq?.itemsWithoutPrice ?? 0}</strong></li>
                    <li>
                      Itens com preço unitário divergente do total:{" "}
                      <strong>{dq?.priceInconsistencies ?? 0}</strong>
                    </li>
                    <li>
                      Insumos comprados em mais de uma unidade:{" "}
                      <strong>{dq?.multiUnitIngredients ?? 0}</strong>{" "}
                      <span className="text-muted-foreground">
                        (a comparação de preço é feita dentro de cada unidade)
                      </span>
                    </li>
                    <li>
                      Pedidos sem previsão de entrega:{" "}
                      <strong>{dq?.ordersWithoutExpectedDelivery ?? 0}</strong>{" "}
                      <span className="text-muted-foreground">(ficam fora do % no prazo)</span>
                    </li>
                    <li>Pedidos sem fornecedor: <strong>{dq?.ordersWithoutSupplier ?? 0}</strong></li>
                  </ul>
                  <p className="pt-2 text-xs text-muted-foreground">
                    O gasto considera apenas pedidos de compra. Entradas feitas pela importação de
                    NF-e não entram aqui · somar as duas fontes duplicaria a mercadoria.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
