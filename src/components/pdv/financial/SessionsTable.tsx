import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { CashierStatementSession } from "@/hooks/use-pdv-cashier-statement";
import { formatBRL } from "@/lib/format";

export function riskBadge(level: string | null) {
  switch (level) {
    case "ok": return <Badge className="bg-success text-success-foreground">OK</Badge>;
    case "low": return <Badge variant="outline">Baixo</Badge>;
    case "medium": return <Badge className="bg-warning text-warning-foreground">Médio</Badge>;
    case "high": return <Badge variant="destructive">Alto</Badge>;
    case "critical": return <Badge variant="destructive">Crítico</Badge>;
    default: return <Badge variant="outline">—</Badge>;
  }
}

export function SessionsTable({ sessions }: { sessions: CashierStatementSession[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Abertura</TableHead>
          <TableHead>Fechamento</TableHead>
          <TableHead className="text-right">Vendas</TableHead>
          <TableHead className="text-right">Dinheiro</TableHead>
          <TableHead className="text-right">Cartão</TableHead>
          <TableHead className="text-right">PIX</TableHead>
          <TableHead className="text-right">Sangrias</TableHead>
          <TableHead className="text-right">Diferença</TableHead>
          <TableHead className="text-center">Status</TableHead>
          <TableHead className="text-center">Risco</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((s) => {
          const status = s.closing_status as string | null | undefined;
          const justification = s.closing_justification || s.notes || "";
          return (
            <TableRow key={s.id} title={justification ? `Justificativa: ${justification}` : undefined}>
              <TableCell>{format(new Date(s.opened_at), "HH:mm")}</TableCell>
              <TableCell>{s.closed_at ? format(new Date(s.closed_at), "HH:mm") : <Badge variant="outline">Aberto</Badge>}</TableCell>
              <TableCell className="text-right font-medium">{formatBRL(s.total_sales)}</TableCell>
              <TableCell className="text-right">{formatBRL(s.total_cash)}</TableCell>
              <TableCell className="text-right">{formatBRL(s.total_card)}</TableCell>
              <TableCell className="text-right">{formatBRL(s.total_pix)}</TableCell>
              <TableCell className="text-right">{formatBRL(s.total_withdrawals)}</TableCell>
              <TableCell className="text-right">
                {s.balance_difference != null ? (
                  <span className={Math.abs(s.balance_difference) > 5 ? "text-destructive font-medium" : ""}>
                    {formatBRL(s.balance_difference)}
                  </span>
                ) : "—"}
              </TableCell>
              <TableCell className="text-center">
                {status === "no_difference" && <Badge variant="outline">Sem diferença</Badge>}
                {status === "surplus" && <Badge variant="outline">Sobra</Badge>}
                {status === "shortage" && <Badge variant="destructive">Falta</Badge>}
                {!status && "—"}
              </TableCell>
              <TableCell className="text-center">{riskBadge(s.fraud_risk_level)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
