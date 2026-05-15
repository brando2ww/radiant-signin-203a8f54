import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { usePDVTables, type PDVTable } from "@/hooks/use-pdv-tables";
import { usePDVTableChange } from "@/hooks/use-pdv-table-change";
import { usePDVPermissions } from "@/hooks/use-pdv-permissions";
import { formatTableLabel } from "@/utils/formatTableNumber";
import { cn } from "@/lib/utils";

interface ChangeTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTable: PDVTable | null;
  onChanged?: () => void;
}

export function ChangeTableDialog({ open, onOpenChange, sourceTable, onChanged }: ChangeTableDialogProps) {
  const { tables } = usePDVTables();
  const { changeTable, isChanging } = usePDVTableChange();
  const { can, requiresReason } = usePDVPermissions();
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const baseReasonRequired = requiresReason("change_table");
  const canChange = can("change_table");

  const matches = (t: PDVTable) =>
    !search.trim() || formatTableLabel(t.table_number).toLowerCase().includes(search.toLowerCase());

  const freeTables = useMemo(
    () =>
      tables
        .filter((t) => t.id !== sourceTable?.id && t.status === "livre" && !t.current_order_id)
        .filter(matches)
        .sort((a, b) => Number(a.table_number) - Number(b.table_number)),
    [tables, sourceTable, search],
  );

  const occupiedTables = useMemo(
    () =>
      tables
        .filter(
          (t) =>
            t.id !== sourceTable?.id &&
            !t.is_virtual &&
            (t.current_order_id || t.status === "ocupada"),
        )
        .filter(matches)
        .sort((a, b) => Number(a.table_number) - Number(b.table_number)),
    [tables, sourceTable, search],
  );

  const target = useMemo(
    () => tables.find((t) => t.id === targetId) || null,
    [tables, targetId],
  );
  const isMerge = !!target && (!!target.current_order_id || target.status === "ocupada");
  const reasonRequired = baseReasonRequired || isMerge;

  const handleConfirm = async () => {
    if (!sourceTable || !targetId) return;
    if (reasonRequired && reason.trim().length < 3) return;
    await changeTable({
      sourceTableId: sourceTable.id,
      targetTableId: targetId,
      reason: reason.trim() || null,
    });
    onChanged?.();
    setTargetId(null);
    setReason("");
    setSearch("");
    onOpenChange(false);
  };

  const renderGrid = (list: PDVTable[]) => (
    <div className="grid grid-cols-3 gap-2">
      {list.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTargetId(t.id)}
          className={cn(
            "p-3 rounded-md border text-sm font-medium hover:bg-muted transition-colors text-left",
            targetId === t.id && "border-primary bg-primary/10",
          )}
        >
          {formatTableLabel(t.table_number)}
          <div className="text-xs text-muted-foreground mt-1">{t.capacity} lug.</div>
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar mesa</DialogTitle>
          <DialogDescription>
            {sourceTable && (
              <>Mover a ocupação da {formatTableLabel(sourceTable.table_number)} para outra mesa.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {!canChange ? (
          <div className="text-sm text-muted-foreground">Você não tem permissão para esta ação.</div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar mesa..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <ScrollArea className="h-[260px] border rounded-md p-2">
              {freeTables.length === 0 && occupiedTables.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma mesa disponível
                </p>
              ) : (
                <div className="space-y-3">
                  {freeTables.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Mesas livres
                      </p>
                      {renderGrid(freeTables)}
                    </div>
                  )}
                  {occupiedTables.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Mesas ocupadas (mesclar)
                      </p>
                      {renderGrid(occupiedTables)}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {isMerge && sourceTable && target && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 flex gap-2 text-xs text-yellow-700 dark:text-yellow-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  As comandas da {formatTableLabel(sourceTable.table_number)} serão mescladas
                  na {formatTableLabel(target.table_number)}. A {formatTableLabel(sourceTable.table_number)} ficará livre.
                </span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium">
                Motivo {reasonRequired && <span className="text-destructive">*</span>}
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={isMerge ? "Ex.: cliente pediu para juntar com outra mesa" : "Ex.: cliente pediu mesa maior"}
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={handleConfirm}
                disabled={!targetId || isChanging || (reasonRequired && reason.trim().length < 3)}
              >
                {isChanging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                {isMerge ? "Mesclar mesa" : "Trocar mesa"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
