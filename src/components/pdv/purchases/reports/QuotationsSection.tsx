import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import type { QuotationBlock } from "@/lib/purchase-reports/types";
import { PurchaseKpi } from "./PurchaseKpi";

const pct = (v: number | null) =>
  v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const hours = (v: number | null) =>
  v == null ? "—" : v < 48
    ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`
    : `${(v / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;

const REASON_LABEL: Record<string, string> = {
  sem_estoque: "Sem estoque no momento",
  nao_trabalha: "Não trabalha com o item",
  em_falta: "Em falta no fornecedor",
};

export function QuotationsSection({
  block,
  loading,
}: {
  block: QuotationBlock | null;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-[420px] w-full" />;
  if (!block || block.requests === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma cotação criada no período.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <PurchaseKpi
          label="Cotações"
          value={String(block.requests)}
          hint={`${block.itemsQuoted} itens cotados`}
        />
        <PurchaseKpi
          label="Taxa de resposta"
          value={pct(block.responseRate)}
          hint={`${block.linksSubmitted} de ${block.linksSent} convites`}
        />
        <PurchaseKpi
          label="Tempo de resposta"
          value={hours(block.medianResponseHours)}
          hint={`mediana · média ${hours(block.avgResponseHours)}`}
        />
        <PurchaseKpi
          label="Itens sem nenhuma oferta"
          value={String(block.itemsWithoutOffer)}
          hint={`${block.itemsWithSingleOffer} com oferta única`}
          tone={block.itemsWithoutOffer > 0 ? "warn" : "default"}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Economia nas cotações</CardTitle>
          <p className="text-xs text-muted-foreground">
            Calculado só sobre os {block.itemsComparable} itens que receberam duas ou mais ofertas ·
            item com oferta única não tem com o que comparar.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Economia na decisão</p>
            <p className="text-xl font-semibold text-emerald-600">
              {formatBRL(block.savingsVsAvg)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              escolhido vs média das ofertas
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Economia potencial</p>
            <p className="text-xl font-semibold">{formatBRL(block.savingsVsMax)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              teto teórico, vs a oferta mais cara · não somar com a de cima
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Deixou de economizar</p>
            <p className="text-xl font-semibold text-destructive">
              {formatBRL(block.overpayVsMin)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              escolheu quem não era o mais barato
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fornecedores nas cotações</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Convites</TableHead>
                  <TableHead className="text-right">Respostas</TableHead>
                  <TableHead className="text-right">Vitórias</TableHead>
                  <TableHead className="text-right">Recusas</TableHead>
                  <TableHead className="text-right">Tempo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {block.bySupplier.map((s) => (
                  <TableRow key={s.supplier_id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">{s.invited}</TableCell>
                    <TableCell className="text-right">
                      {s.responded}
                      {s.response_rate != null && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({pct(s.response_rate)})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{s.wins}</TableCell>
                    <TableCell className="text-right">{s.refusals}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {hours(s.avg_response_hours)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recusas e correções</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {block.refusals.length === 0 ? (
              <p className="text-muted-foreground">
                Nenhum fornecedor marcou item como indisponível no período.
              </p>
            ) : (
              <ul className="space-y-1">
                {block.refusals.map((r) => (
                  <li key={r.reason} className="flex justify-between">
                    <span>{REASON_LABEL[r.reason] ?? r.reason}</span>
                    <strong>{r.count}</strong>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t pt-3">
              <p className="flex justify-between">
                <span>Preços corrigidos pelo comprador</span>
                <strong>{block.corrections}</strong>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Ofertas em que o preço enviado foi ajustado, normalmente erro de unidade.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
