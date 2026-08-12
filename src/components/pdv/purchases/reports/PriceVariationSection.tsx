import { useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { ArrowDown, ArrowUp, ChevronDown, LineChart as LineChartIcon } from "lucide-react";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { formatDateOnly } from "@/lib/purchase-reports/dates";
import type { PriceSeries, PriceVariationBlock, PriceVariationRow } from "@/lib/purchase-reports/types";

const pct = (v: number | null) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const CONFIDENCE_LABEL: Record<string, string> = {
  alta: "alta", media: "média", baixa: "baixa",
};

function VariationTable({
  rows,
  unitLabel,
  onOpenSeries,
  emptyMessage,
}: {
  rows: PriceVariationRow[];
  unitLabel: string;
  onOpenSeries: (row: PriceVariationRow) => void;
  emptyMessage: string;
}) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Insumo</TableHead>
            <TableHead className="text-right">Antes</TableHead>
            <TableHead className="text-right">Agora</TableHead>
            <TableHead className="text-right">Variação</TableHead>
            <TableHead className="text-right">{unitLabel}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell>
                <div className="font-medium">{r.ingredient_name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.unit} · {r.purchases_lifetime} compras · confiança{" "}
                  {CONFIDENCE_LABEL[r.confidence]}
                  {r.supplier_changed && " · trocou de fornecedor"}
                  {r.multi_unit && " · comprado em mais de uma unidade"}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-right">
                <div>{r.prev_price != null ? formatBRL(r.prev_price) : "—"}</div>
                <div className="text-xs text-muted-foreground">{formatDateOnly(r.prev_date)}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-right">
                <div>{formatBRL(r.last_price)}</div>
                <div className="text-xs text-muted-foreground">{formatDateOnly(r.last_date)}</div>
              </TableCell>
              <TableCell
                className={`whitespace-nowrap text-right font-medium ${
                  (r.delta_pct ?? 0) > 0 ? "text-destructive" : "text-emerald-600"
                }`}
              >
                {pct(r.delta_pct)}
                {r.days_between != null && (
                  <div className="text-xs font-normal text-muted-foreground">
                    em {r.days_between} dia{r.days_between === 1 ? "" : "s"}
                  </div>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium">
                {r.impact_brl != null ? formatBRL(r.impact_brl) : "—"}
                <div className="text-xs font-normal text-muted-foreground">
                  {r.qty_period.toLocaleString("pt-BR")} {r.unit} no período
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" title="Ver histórico de preço"
                  onClick={() => onOpenSeries(r)}>
                  <LineChartIcon className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function PriceVariationSection({
  block,
  loading,
  getSeries,
}: {
  block: PriceVariationBlock | null;
  loading: boolean;
  getSeries: (key: string) => PriceSeries | null;
}) {
  const [series, setSeries] = useState<PriceSeries | null>(null);
  const [showSuspects, setShowSuspects] = useState(false);

  if (loading) return <Skeleton className="h-[420px] w-full" />;
  if (!block) return null;

  const openSeries = (row: PriceVariationRow) => setSeries(getSeries(row.key));

  return (
    <div className="space-y-4">
      {block.sample.warning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Amostra pequena:</strong> só {block.sample.comparable} insumo(s) têm compra
          anterior para comparar neste período
          {block.sample.noBase > 0 && ` · ${block.sample.noBase} sem base de comparação`}. Variação
          de preço fica mais confiável conforme o histórico de compras cresce.
        </div>
      )}

      {series && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">
              Histórico de preço · {series.ingredient_name}{" "}
              <span className="font-normal text-muted-foreground">({series.unit})</span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSeries(null)}>
              Fechar
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series.points}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tickFormatter={formatDateOnly} />
                  <YAxis className="text-xs" tickFormatter={(v) => formatBRLCompact(v)} />
                  <Tooltip
                    formatter={(v: number) => formatBRL(v)}
                    labelFormatter={(l) => formatDateOnly(String(l))}
                  />
                  <Line
                    type="monotone"
                    dataKey="unit_price"
                    name="Preço"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {series.points.map((p, i) => (
                <div key={`${p.order_number}-${i}`}>
                  {formatDateOnly(p.date)} · {formatBRL(p.unit_price)}/{series.unit} ·{" "}
                  {p.supplier_name} · {p.order_number}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUp className="h-4 w-4 text-destructive" />
              Maiores altas
              <Badge variant="outline" className="ml-auto font-normal">
                {formatBRL(block.totals.impactUp)} a mais
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VariationTable
              rows={block.topIncreases}
              unitLabel="Custo a mais"
              onOpenSeries={openSeries}
              emptyMessage="Nenhum aumento acima do corte neste período."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDown className="h-4 w-4 text-emerald-600" />
              Maiores baixas
              <Badge variant="outline" className="ml-auto font-normal">
                {formatBRL(Math.abs(block.totals.impactDown))} a menos
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VariationTable
              rows={block.topDecreases}
              unitLabel="Economia"
              onOpenSeries={openSeries}
              emptyMessage="Nenhuma queda acima do corte neste período."
            />
          </CardContent>
        </Card>
      </div>

      {block.bySupplier.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Variação por fornecedor</CardTitle>
            <p className="text-xs text-muted-foreground">
              Só insumos que o mesmo fornecedor vendeu nas duas pontas · comparar cestas
              diferentes mediria mudança de mix, não negociação.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Insumos</TableHead>
                  <TableHead className="text-right">Variação média</TableHead>
                  <TableHead className="text-right">Impacto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {block.bySupplier.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">{s.basket_size}</TableCell>
                    <TableCell
                      className={`text-right ${
                        (s.weighted_delta_pct ?? 0) > 0 ? "text-destructive" : "text-emerald-600"
                      }`}
                    >
                      {pct(s.weighted_delta_pct)}
                    </TableCell>
                    <TableCell className="text-right">{formatBRL(s.impact_brl)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {block.suspects.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={() => setShowSuspects((v) => !v)}
            >
              <CardTitle className="text-base">
                {block.suspects.length} variação(ões) suspeita(s) de troca de embalagem
              </CardTitle>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${showSuspects ? "rotate-180" : ""}`}
              />
            </button>
            <p className="text-xs text-muted-foreground">
              Variação acima de 60% em unidade de embalagem. O sistema não registra o tamanho da
              embalagem, então caixa de 12 e de 24 do mesmo insumo aparecem como aumento. Ficam
              fora dos rankings.
            </p>
          </CardHeader>
          {showSuspects && (
            <CardContent>
              <VariationTable
                rows={block.suspects}
                unitLabel="Impacto aparente"
                onOpenSeries={openSeries}
                emptyMessage=""
              />
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
