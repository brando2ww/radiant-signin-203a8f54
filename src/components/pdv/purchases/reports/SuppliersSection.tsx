import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import type { SupplierBlock } from "@/lib/purchase-reports/types";
import { PurchaseKpi } from "./PurchaseKpi";

const pct = (v: number | null) =>
  v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const days = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}d`;

export function SuppliersSection({
  block,
  loading,
}: {
  block: SupplierBlock | null;
  loading: boolean;
}) {
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
      <div className="grid gap-3 md:grid-cols-4">
        <PurchaseKpi label="Fornecedores no período" value={String(block.activeSuppliers)} />
        <PurchaseKpi
          label="Concentração no top 3"
          value={pct(block.top3Share)}
          hint="quanto do gasto depende de 3 fornecedores"
          tone={block.top3Share > 0.7 ? "warn" : "default"}
        />
        <PurchaseKpi
          label="Índice de concentração"
          value={block.hhi.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
          hint="0 = pulverizado · 1 = fornecedor único"
        />
        <PurchaseKpi
          label="Insumos com fonte única"
          value={String(block.singleSourceIngredients)}
          hint="comprados de um só fornecedor no período"
          tone={block.singleSourceIngredients > 0 ? "warn" : "default"}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fornecedores</CardTitle>
          <p className="text-xs text-muted-foreground">
            O % no prazo só considera pedidos com previsão de entrega e entrega registrada · a
            coluna "medidos" mostra sobre quantos pedidos a taxa foi calculada.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Part.</TableHead>
                <TableHead className="text-right">Prazo real</TableHead>
                <TableHead className="text-right">No prazo</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead className="text-right">Pedido mínimo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((r) => (
                <TableRow key={r.supplier_id ?? "sem"}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    {r.category && (
                      <div className="text-xs text-muted-foreground">{r.category}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{r.orders}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{formatBRL(r.spend)}</TableCell>
                  <TableCell className="text-right">{pct(r.share)}</TableCell>
                  <TableCell className="text-right">
                    {days(r.avg_lead_days)}
                    {r.promised_lead_days != null && (
                      <div className="text-xs text-muted-foreground">
                        prometido {days(r.promised_lead_days)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {pct(r.on_time_pct)}
                    <div className="text-xs text-muted-foreground">
                      {r.measurable > 0 ? `${r.measurable} medidos` : "sem base"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{pct(r.fill_rate)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {r.minimum_order == null ? (
                      <span className="text-muted-foreground">não informado</span>
                    ) : r.minimum_order === 0 ? (
                      <span className="text-muted-foreground">não tem</span>
                    ) : (
                      <>
                        {formatBRL(r.minimum_order)}
                        {r.below_minimum_orders > 0 && (
                          <Badge variant="outline" className="ml-1 border-amber-400 text-amber-700">
                            {r.below_minimum_orders} abaixo
                          </Badge>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
