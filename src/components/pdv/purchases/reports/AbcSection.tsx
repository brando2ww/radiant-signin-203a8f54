import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import type { AbcBlock } from "@/lib/purchase-reports/types";
import { PurchaseKpi } from "./PurchaseKpi";

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const CLASS_COLOR: Record<string, string> = {
  A: "border-emerald-400 text-emerald-700",
  B: "border-amber-400 text-amber-700",
  C: "border-muted-foreground/30 text-muted-foreground",
};

export function AbcSection({ block, loading }: { block: AbcBlock | null; loading: boolean }) {
  if (loading) return <Skeleton className="h-[420px] w-full" />;
  if (!block || block.rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma compra no período.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {(["A", "B", "C"] as const).map((k) => (
          <PurchaseKpi
            key={k}
            label={`Classe ${k}`}
            value={formatBRL(block.summary[k].spend)}
            hint={`${block.summary[k].count} insumo(s) · ${pct(block.summary[k].share)} do gasto`}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Curva ABC de gasto</CardTitle>
          <p className="text-xs text-muted-foreground">
            Classe A concentra os primeiros 80% do gasto · é onde negociar primeiro rende mais.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Classe</TableHead>
                <TableHead>Insumo</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Part.</TableHead>
                <TableHead className="text-right">Acum.</TableHead>
                <TableHead className="text-right">Compras</TableHead>
                <TableHead className="text-right">Preço médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.slice(0, 60).map((r) => (
                <TableRow key={r.ingredient_id}>
                  <TableCell>
                    <Badge variant="outline" className={CLASS_COLOR[r.abc]}>
                      {r.abc}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.qty.toLocaleString("pt-BR")} {r.unit} · {r.suppliers} fornecedor(es)
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">{formatBRL(r.spend)}</TableCell>
                  <TableCell className="text-right">{pct(r.share)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {pct(r.cum_share)}
                  </TableCell>
                  <TableCell className="text-right">{r.purchases}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {formatBRL(r.avg_price)}/{r.unit}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {block.rows.length > 60 && (
            <p className="pt-2 text-xs text-muted-foreground">
              Mostrando os 60 maiores de {block.rows.length} insumos · a exportação traz todos.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
