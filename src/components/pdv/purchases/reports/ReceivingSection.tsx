import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import { formatDateOnly } from "@/lib/purchase-reports/dates";
import type { ReceivingBlock } from "@/lib/purchase-reports/types";
import { PurchaseKpi } from "./PurchaseKpi";

const pct = (v: number | null) =>
  v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Antes disso não havia registro de evento de recebimento no banco. */
const EVENT_DATA_START = "2026-07-16";

export function ReceivingSection({
  block,
  loading,
  periodStart,
}: {
  block: ReceivingBlock | null;
  loading: boolean;
  periodStart: string;
}) {
  if (loading) return <Skeleton className="h-[420px] w-full" />;
  if (!block || block.ordersInPeriod === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhum pedido no período.
        </CardContent>
      </Card>
    );
  }

  const beforeEventData = periodStart < EVENT_DATA_START;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <PurchaseKpi
          label="Pedidos no período"
          value={String(block.ordersInPeriod)}
          hint={`${block.received} recebidos · ${block.partial} parciais · ${block.pending} em aberto`}
        />
        <PurchaseKpi
          label="Entrega no prazo"
          value={pct(block.onTimePct)}
          hint={
            block.measurable > 0
              ? `${block.onTime} de ${block.measurable} medidos`
              : "sem pedido com previsão e entrega registradas"
          }
          tone={block.onTimePct != null && block.onTimePct < 0.7 ? "warn" : "default"}
        />
        <PurchaseKpi
          label="Atraso médio"
          value={
            block.avgDelayDays == null
              ? "—"
              : `${block.avgDelayDays.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`
          }
          hint={`${block.late} entrega(s) atrasada(s)`}
        />
        <PurchaseKpi
          label="Recebido do pedido"
          value={pct(block.fillRate)}
          hint="quantidade recebida sobre a pedida"
          tone={block.fillRate != null && block.fillRate < 0.95 ? "warn" : "default"}
        />
      </div>

      {beforeEventData && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          O período selecionado começa antes de 16/07/2026, quando o sistema passou a registrar
          cada evento de recebimento. Para datas anteriores, o canal de recebimento não é
          conhecido e aparece todo como painel.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Divergências entre pedido e recebido
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              O sistema registra divergência de quantidade, não de preço · o recebimento não pede
              o valor faturado.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {block.divergences.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma divergência no período.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Pedido</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {block.divergences.slice(0, 30).map((d, i) => (
                    <TableRow key={`${d.order_number}-${d.ingredient}-${i}`}>
                      <TableCell>
                        <div className="font-medium">{d.ingredient}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.order_number} · {d.supplier}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {d.ordered.toLocaleString("pt-BR")} {d.unit}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {d.received.toLocaleString("pt-BR")} {d.unit}
                        <Badge
                          variant="outline"
                          className={`ml-1 ${
                            d.kind === "falta"
                              ? "border-destructive/40 text-destructive"
                              : "border-amber-400 text-amber-700"
                          }`}
                        >
                          {d.kind}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {formatBRL(Math.abs(d.value_diff))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pedidos encerrados incompletos</CardTitle>
              <p className="text-xs text-muted-foreground">
                Ficam com status "recebido" mesmo tendo faltado mercadoria · por isso são
                separados das taxas acima.
              </p>
            </CardHeader>
            <CardContent>
              {block.closedIncomplete.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum no período.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {block.closedIncomplete.map((c) => (
                    <li key={c.order_number} className="border-b pb-2 last:border-0">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{c.order_number}</span>
                        <span className="text-destructive">
                          {formatBRL(c.missing_value)} não recebidos
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.supplier} · {formatDateOnly(c.date)} · {c.reason}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Canal de recebimento</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="flex justify-between">
                <span>Pelo QR do entregador</span>
                <strong>{block.channels.qr}</strong>
              </p>
              <p className="flex justify-between">
                <span>Pelo painel</span>
                <strong>{Math.max(0, block.channels.painel)}</strong>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
