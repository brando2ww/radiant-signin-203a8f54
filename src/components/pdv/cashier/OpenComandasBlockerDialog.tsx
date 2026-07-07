import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Ghost, Receipt, Trash2, CheckCircle2, Lock } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { formatTableLabel } from "@/utils/formatTableNumber";
import { Comanda, ComandaItem } from "@/hooks/use-pdv-comandas";
import { PDVTable } from "@/hooks/use-pdv-tables";

interface OpenComandasBlockerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lista viva de comandas (o diálogo re-deriva as que bloqueiam a cada render). */
  comandas: Comanda[];
  tables: PDVTable[];
  getItemsByComanda: (comandaId: string) => ComandaItem[];
  /** Cancela a comanda gravando motivo/categoria. */
  onCancel: (id: string, isGhost: boolean) => void;
  /** Chamado quando não há mais comandas bloqueando → segue para o fechamento. */
  onProceedClose: () => void;
}

interface Row {
  comanda: Comanda;
  itemsCount: number;
  tableLabel: string | null;
  isGhost: boolean;
  reason: string;
}

/**
 * Diálogo que substitui o antigo toast "beco sem saída" ao tentar fechar o caixa
 * com comandas abertas. Lista exatamente as comandas que travam o fechamento,
 * explica por que cada uma trava (inclusive as "fantasma": vazias ou com a mesa
 * já liberada, que não aparecem na fila do Salão) e permite resolver cada uma
 * ali mesmo (cancelar a vazia/órfã em 1 clique; cobrar as reais pela fila).
 */
export function OpenComandasBlockerDialog({
  open,
  onOpenChange,
  comandas,
  tables,
  getItemsByComanda,
  onCancel,
  onProceedClose,
}: OpenComandasBlockerDialogProps) {
  const [confirmCancel, setConfirmCancel] = useState<Row | null>(null);

  const tablesByOrderId = useMemo(() => {
    const m = new Map<string, PDVTable>();
    tables.forEach((t) => {
      if (t.current_order_id) m.set(t.current_order_id, t);
    });
    return m;
  }, [tables]);

  const rows = useMemo<Row[]>(() => {
    return comandas
      .filter((c) => c.status === "aberta")
      .map((c) => {
        const itemsCount = getItemsByComanda(c.id).length;
        const table = c.order_id ? tablesByOrderId.get(c.order_id) ?? null : null;
        const orphan = !!c.order_id && !table;
        const empty = itemsCount === 0;
        // "Fantasma" = não aparece na fila do Salão: vazia (sem item) ou órfã
        // (com pedido, mas nenhuma mesa aponta mais para ela).
        const isGhost = empty || orphan;
        let reason = "";
        if (empty && orphan) reason = "Vazia e sem mesa (pedido liberado)";
        else if (empty) reason = "Sem itens lançados";
        else if (orphan) reason = "A mesa desta comanda já foi liberada";
        return {
          comanda: c,
          itemsCount,
          tableLabel: table ? formatTableLabel(table.table_number) : null,
          isGhost,
          reason,
        };
      })
      .sort((a, b) => Number(b.isGhost) - Number(a.isGhost));
  }, [comandas, tablesByOrderId, getItemsByComanda]);

  const allResolved = rows.length === 0;

  const handleCancelClick = (row: Row) => {
    // Vazia/órfã: cancela direto. Com valor/itens: pede confirmação.
    if (row.isGhost && row.itemsCount === 0 && row.comanda.subtotal <= 0) {
      onCancel(row.comanda.id, true);
    } else {
      setConfirmCancel(row);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {allResolved ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              {allResolved
                ? "Tudo certo para fechar"
                : `${rows.length} comanda${rows.length > 1 ? "s" : ""} em aberto`}
            </DialogTitle>
            <DialogDescription>
              {allResolved
                ? "Não há mais comandas em aberto. Você já pode fechar o caixa."
                : "O caixa só fecha quando todas as comandas estiverem cobradas ou canceladas. Resolva as comandas abaixo:"}
            </DialogDescription>
          </DialogHeader>

          {!allResolved && (
            <ScrollArea className="max-h-[52vh] pr-2">
              <div className="space-y-2">
                {rows.map((row) => (
                  <div
                    key={row.comanda.id}
                    className="rounded-lg border p-3 flex items-start gap-3"
                  >
                    <div className="mt-0.5">
                      {row.isGhost ? (
                        <Ghost className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Receipt className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {row.tableLabel
                            ? `${row.tableLabel} · `
                            : "Avulsa · "}
                          {row.comanda.customer_name || `#${row.comanda.comanda_number}`}
                        </span>
                        {row.isGhost ? (
                          <Badge variant="secondary" className="text-[10px]">
                            fantasma
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-primary text-primary-foreground">
                            {formatBRL(row.comanda.subtotal)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {row.isGhost ? (
                          <>Não aparece na fila do Salão · {row.reason}.</>
                        ) : (
                          <>
                            {row.itemsCount} item{row.itemsCount > 1 ? "s" : ""} ·
                            aparece na fila do Salão para cobrança.
                          </>
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={row.isGhost ? "default" : "outline"}
                      className={
                        row.isGhost
                          ? ""
                          : "text-destructive border-destructive/40 hover:bg-destructive/10"
                      }
                      onClick={() => handleCancelClick(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      {row.isGhost ? "Remover" : "Cancelar"}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {!allResolved && rows.some((r) => !r.isGhost) && (
            <p className="text-xs text-muted-foreground">
              Dica: as comandas com valor você cobra normalmente na fila do Salão
              (aba Salão, ao lado). Só cancele se realmente não houve consumo.
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Voltar
            </Button>
            <Button
              disabled={!allResolved}
              onClick={() => {
                onOpenChange(false);
                onProceedClose();
              }}
            >
              <Lock className="h-4 w-4 mr-2" />
              Fechar caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmCancel}
        onOpenChange={(o) => !o && setConfirmCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta comanda?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCancel && (
                <>
                  {confirmCancel.tableLabel
                    ? `${confirmCancel.tableLabel} · `
                    : "Avulsa · "}
                  {confirmCancel.comanda.customer_name ||
                    `#${confirmCancel.comanda.comanda_number}`}{" "}
                  tem {confirmCancel.itemsCount} item
                  {confirmCancel.itemsCount > 1 ? "s" : ""} e valor de{" "}
                  {formatBRL(confirmCancel.comanda.subtotal)}. O cancelamento é
                  registrado e não pode ser desfeito. Só faça isso se não houve
                  consumo.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmCancel) onCancel(confirmCancel.comanda.id, confirmCancel.isGhost);
                setConfirmCancel(null);
              }}
            >
              Cancelar comanda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
