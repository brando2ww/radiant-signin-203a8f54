import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCouponUsageHistory } from "@/hooks/use-coupon-usage-history";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function CouponUsageHistory({ code }: { code: string }) {
  const { data: rows = [], isLoading } = useCouponUsageHistory(code);

  const totalSavings = rows.reduce((a, r) => a + Number(r.discount || 0), 0);

  return (
    <div className="bg-muted/40 border-t">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">Histórico de uso — {code}</h4>
          <div className="text-xs text-muted-foreground">
            Economia gerada por este cupom:{" "}
            <span className="font-semibold text-foreground">
              {formatBRL(totalSavings)}
            </span>
          </div>
        </div>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Carregando...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Este cupom ainda não foi usado.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    {format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">#{r.order_number}</TableCell>
                  <TableCell className="text-sm">{r.customer_name || "—"}</TableCell>
                  <TableCell className="text-right">{formatBRL(r.total)}</TableCell>
                  <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                    -{formatBRL(r.discount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
