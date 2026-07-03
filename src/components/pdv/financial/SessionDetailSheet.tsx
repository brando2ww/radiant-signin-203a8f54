import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { format, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CashierStatementSession } from "@/hooks/use-pdv-cashier-statement";
import { formatBRL } from "@/lib/format";
import { riskBadge } from "./SessionsTable";

interface SessionDetailSheetProps {
  session: CashierStatementSession | null;
  onClose: () => void;
}

const METHOD_LABEL: Record<string, string> = {
  pix: "PIX",
  credito: "Crédito",
  debito: "Débito",
  dinheiro: "Dinheiro",
  fiado: "Fiado",
  voucher: "Voucher",
  online_delivery: "Delivery Online",
  other: "Outro",
};

const TYPE_LABEL: Record<string, string> = {
  venda: "Venda",
  sangria: "Sangria",
  reforco: "Reforço",
};

function duration(from: string, to: string) {
  const mins = differenceInMinutes(new Date(to), new Date(from));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export function SessionDetailSheet({ session, onClose }: SessionDetailSheetProps) {
  if (!session) return null;

  const openedFmt = format(new Date(session.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR });
  const closedFmt = session.closed_at
    ? format(new Date(session.closed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
    : null;

  const movements: any[] = session.movements || [];
  const sales = movements.filter((m) => m.type === "venda");
  const sangrias = movements.filter((m) => m.type === "sangria");
  const reforcos = movements.filter((m) => m.type === "reforco");

  const totalReforcos = reforcos.reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
  const expectedCash =
    Number(session.opening_balance || 0) +
    Number(session.total_cash || 0) +
    totalReforcos -
    Number(session.total_withdrawals || 0);

  const declaredRows = [
    { label: "Dinheiro (gaveta)", system: expectedCash, declared: session.declared_cash, diff: session.cash_difference },
    { label: "Crédito", system: session.total_credit, declared: session.declared_credit, diff: session.credit_difference },
    { label: "Débito", system: session.total_debit, declared: session.declared_debit, diff: session.debit_difference },
    { label: "PIX", system: session.total_pix, declared: session.declared_pix, diff: session.pix_difference },
    { label: "Voucher", system: session.total_voucher, declared: session.declared_voucher, diff: session.voucher_difference },
    { label: "Fiado", system: (session as any).total_fiado, declared: session.declared_other, diff: session.other_difference },
  ].filter((r) => (r.system != null && Number(r.system) !== 0) || (r.declared != null && Number(r.declared) !== 0));

  const status = session.closing_status as string | null | undefined;

  return (
    <Sheet open={!!session} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-base font-semibold">
            Sessão {format(new Date(session.opened_at), "dd/MM/yyyy", { locale: ptBR })}
          </SheetTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{openedFmt}</span>
            <span>→</span>
            {closedFmt ? (
              <>
                <span>{closedFmt}</span>
                <span className="text-xs">({duration(session.opened_at, session.closed_at!)})</span>
              </>
            ) : (
              <Badge variant="outline">Em aberto</Badge>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Dinheiro", value: session.total_cash },
              { label: "Crédito", value: session.total_credit },
              { label: "Débito", value: session.total_debit },
              { label: "PIX", value: session.total_pix },
              { label: "Fiado", value: (session as any).total_fiado },
              { label: "Sangrias", value: session.total_withdrawals },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-sm font-semibold tabular-nums">{formatBRL(Number(value || 0))}</p>
              </div>
            ))}
          </div>

          {/* Gaveta */}
          <div className="rounded-md border p-3 space-y-1.5 text-sm">
            <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-2">Composição da Gaveta</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo de abertura</span>
              <span className="tabular-nums">{formatBRL(Number(session.opening_balance || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">+ Vendas dinheiro</span>
              <span className="tabular-nums">{formatBRL(Number(session.total_cash || 0))}</span>
            </div>
            {totalReforcos > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">+ Reforços</span>
                <span className="tabular-nums">{formatBRL(totalReforcos)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">− Sangrias</span>
              <span className="tabular-nums text-amber-600">{formatBRL(Number(session.total_withdrawals || 0))}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Gaveta esperada</span>
              <span className="tabular-nums">{formatBRL(expectedCash)}</span>
            </div>
          </div>

          {/* Movimentações */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Movimentações ({movements.length})
            </p>
            {movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Horário</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Descrição</TableHead>
                    <TableHead className="text-xs">Método</TableHead>
                    <TableHead className="text-xs text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m, i) => {
                    const isSangria = m.type === "sangria";
                    return (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap">
                          {format(new Date(m.created_at), "HH:mm:ss")}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Badge variant={isSangria ? "destructive" : "outline"} className="text-[10px] py-0 h-4">
                            {TYPE_LABEL[m.type] ?? m.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 max-w-[160px] truncate text-muted-foreground">
                          {m.description || "—"}
                        </TableCell>
                        <TableCell className="py-1.5 text-muted-foreground">
                          {m.payment_method ? (METHOD_LABEL[m.payment_method] ?? m.payment_method) : "—"}
                        </TableCell>
                        <TableCell className={`py-1.5 text-right tabular-nums font-medium ${isSangria ? "text-destructive" : ""}`}>
                          {isSangria ? "−" : ""}{formatBRL(Number(m.amount || 0))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Fechamento */}
          {session.closed_at && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fechamento</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  {status === "no_difference" && <Badge variant="outline">Sem diferença</Badge>}
                  {status === "surplus" && <Badge variant="outline">Sobra</Badge>}
                  {status === "shortage" && <Badge variant="destructive">Falta</Badge>}
                  {!status && <span className="text-muted-foreground">—</span>}
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">Risco:</span>
                  {riskBadge(session.fraud_risk_level)}
                </div>
              </div>

              {declaredRows.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Método</TableHead>
                      <TableHead className="text-xs text-right">Sistema</TableHead>
                      <TableHead className="text-xs text-right">Declarado</TableHead>
                      <TableHead className="text-xs text-right">Diferença</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {declaredRows.map((r) => {
                      const diff = Number(r.diff ?? 0);
                      return (
                        <TableRow key={r.label} className="text-xs">
                          <TableCell className="py-1.5">{r.label}</TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums">{formatBRL(Number(r.system || 0))}</TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums">
                            {r.declared != null ? formatBRL(Number(r.declared)) : "—"}
                          </TableCell>
                          <TableCell className={`py-1.5 text-right tabular-nums font-medium ${Math.abs(diff) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                            {r.diff != null ? formatBRL(diff) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {(session.closing_justification || session.notes) && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Observações</p>
                  <p>{session.closing_justification || session.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
