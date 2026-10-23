import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PDVTable } from "@/hooks/use-pdv-tables";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Users, Clock, DollarSign, Plus, Edit, Trash2, Unlink, XCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { formatTableLabel } from "@/utils/formatTableNumber";
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
import { TableComandasSection } from "./TableComandasSection";
import { formatBRL } from "@/lib/format";
import { ActionMenu } from "./operations/ActionMenu";
import { ChangeTableDialog } from "./operations/ChangeTableDialog";
import { OperationHistoryDialog } from "./operations/OperationHistoryDialog";
import { usePDVPermissions } from "@/hooks/use-pdv-permissions";

interface Comanda {
  id: string;
  comanda_number: string;
  customer_name?: string | null;
  person_number?: number | null;
  subtotal: number;
  created_at: string;
  status: string;
}

interface TableDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: PDVTable | null;
  orderTotal?: number;
  orderTime?: string;
  onCreateOrder: (tableId: string) => void;
  /** Cancela o atendimento da mesa (pdv_cancel_order), com motivo. */
  onCancelOrder?: (orderId: string, reason: string) => void;
  onCloseTable: (tableId: string) => void;
  onEditTable: (table: PDVTable) => void;
  onDeleteTable: (tableId: string) => void;
  onUnmergeTables?: (tableId: string) => void;
  tableComandas?: Comanda[];
  onCreateComanda?: () => void;
  onViewComanda?: (comanda: Comanda) => void;
  isCreatingComanda?: boolean;
}

const STATUS_CONFIG = {
  livre: { label: "Livre", variant: "secondary" as const },
  ocupada: { label: "Ocupada", variant: "destructive" as const },
  aguardando_pedido: { label: "Aguardando Pedido", variant: "default" as const },
  aguardando_cozinha: { label: "Aguardando Cozinha", variant: "secondary" as const },
  pediu_conta: { label: "Pediu Conta", variant: "default" as const },
  pendente_pagamento: { label: "Pendente Pagamento", variant: "secondary" as const },
};

export function TableDetailsDialog({
  open,
  onOpenChange,
  table,
  orderTotal,
  orderTime,
  onCreateOrder,
  onCancelOrder,
  onCloseTable,
  onEditTable,
  onDeleteTable,
  onUnmergeTables,
  tableComandas = [],
  onCreateComanda,
  onViewComanda,
  isCreatingComanda,
}: TableDetailsDialogProps) {
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [changeTableOpen, setChangeTableOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { can } = usePDVPermissions();

  if (!table) return null;

  const statusConfig = STATUS_CONFIG[table.status] || STATUS_CONFIG.livre;
  const isOccupied = table.status !== "livre";
  const isAwaitingPayment = table.status === "pendente_pagamento" || table.status === "pediu_conta";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>{formatTableLabel(table.table_number)}</DialogTitle>
              <div className="flex items-center gap-2">
                <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                {isOccupied && (
                  <ActionMenu
                    contextLabel={formatTableLabel(table.table_number)}
                    onChangeTable={can("change_table") ? () => setChangeTableOpen(true) : undefined}
                    onHistory={() => setHistoryOpen(true)}
                  />
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{table.capacity} lugares</span>
            </div>

            {isOccupied && (
              <>
                <Separator />
                <div className="space-y-3">
                  {orderTime && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Desde {orderTime}
                      </span>
                    </div>
                  )}
                  {orderTotal !== undefined && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        <span className="text-sm">Total</span>
                      </div>
                      <span className="text-lg font-bold">
                        {formatBRL(orderTotal)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Comandas section for occupied tables */}
                {onCreateComanda && onViewComanda && (
                  <>
                    <Separator />
                    <TableComandasSection
                      comandas={tableComandas}
                      onCreateComanda={onCreateComanda}
                      onViewComanda={onViewComanda}
                      isCreating={isCreatingComanda}
                    />
                  </>
                )}
              </>
            )}

            <Separator />

            <div className="space-y-2">
              {!isOccupied ? (
                <Button
                  className="w-full"
                  onClick={() => {
                    onCreateOrder(table.id);
                    onOpenChange(false);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Abrir Mesa
                </Button>
              ) : (
                <>
                  {/* Lançar itens é pela comanda (seção acima). O antigo "Ver
                      Pedido" abria a tela de antes das comandas: o item ia
                      para pdv_order_items, não aparecia na mesa e não chegava
                      ao caixa, e o "Fechar Pedido" de lá soltava a mesa sem
                      cobrar. */}
                  <Button
                    className="w-full"
                    onClick={() => {
                      onCloseTable(table.id);
                      onOpenChange(false);
                    }}
                  >
                    Fechar Mesa
                  </Button>
                  {table.current_order_id && onCancelOrder && (
                    <Button
                      variant="outline"
                      className="w-full text-destructive hover:text-destructive"
                      onClick={() => {
                        setCancelReason("");
                        setCancelDialog(true);
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancelar mesa
                    </Button>
                  )}
                </>
              )}

              {table.merged_with && onUnmergeTables && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onUnmergeTables(table.id);
                    onOpenChange(false);
                  }}
                >
                  <Unlink className="h-4 w-4 mr-2" />
                  Separar Mesas
                </Button>
              )}

              <Separator />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    onEditTable(table);
                    onOpenChange(false);
                  }}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDeleteDialog(true)}
                  disabled={isOccupied}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar {formatTableLabel(table.table_number)}?</AlertDialogTitle>
            <AlertDialogDescription>
              O atendimento e as comandas abertas da mesa são cancelados e a mesa
              fica livre. Mesa com item já pago ou em cobrança não pode ser cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo do cancelamento"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={2}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!cancelReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (table.current_order_id && onCancelOrder) {
                  onCancelOrder(table.current_order_id, cancelReason.trim());
                }
                setCancelDialog(false);
              }}
            >
              Cancelar mesa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover para a lixeira</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a {formatTableLabel(table.table_number)}?
              A mesa será movida para a lixeira e poderá ser restaurada posteriormente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDeleteTable(table.id);
                setDeleteDialog(false);
                onOpenChange(false);
              }}
            >
              Mover para Lixeira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChangeTableDialog
        open={changeTableOpen}
        onOpenChange={setChangeTableOpen}
        sourceTable={table}
        onChanged={() => onOpenChange(false)}
      />

      <OperationHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        sourceId={table.current_order_id ?? table.id}
        targetId={table.id}
        title={`Histórico — ${formatTableLabel(table.table_number)}`}
      />
    </>
  );
}