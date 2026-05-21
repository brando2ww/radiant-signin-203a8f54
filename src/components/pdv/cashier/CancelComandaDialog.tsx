import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import { formatBRL } from "@/lib/format";
import type { Comanda, ComandaItem } from "@/hooks/use-pdv-comandas";

export type CancelCategory =
  | "cliente_desistiu"
  | "pedido_errado"
  | "problema_cozinha"
  | "demora_excessiva"
  | "item_indisponivel"
  | "outro";

const CATEGORIES: { value: CancelCategory; label: string }[] = [
  { value: "cliente_desistiu", label: "Cliente desistiu" },
  { value: "pedido_errado", label: "Pedido errado" },
  { value: "problema_cozinha", label: "Problema na cozinha" },
  { value: "demora_excessiva", label: "Demora excessiva" },
  { value: "item_indisponivel", label: "Item indisponível" },
  { value: "outro", label: "Outro" },
];

const MIN_REASON_LENGTH = 20;

interface CancelComandaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comanda: Comanda | null;
  items: ComandaItem[];
  title: string;
  isLoading?: boolean;
  onConfirm: (payload: {
    reason: string;
    category: CancelCategory;
    customerNotified: boolean;
  }) => Promise<void> | void;
}

export function CancelComandaDialog({
  open,
  onOpenChange,
  comanda,
  items,
  title,
  isLoading = false,
  onConfirm,
}: CancelComandaDialogProps) {
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<CancelCategory | "">("");
  const [customerNotified, setCustomerNotified] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setCategory("");
      setCustomerNotified(false);
    }
  }, [open, comanda?.id]);

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const reasonTrimmedLength = reason.trim().length;
  const reasonValid = reasonTrimmedLength >= MIN_REASON_LENGTH;
  const canConfirm =
    !!comanda && reasonValid && !!category && customerNotified && !isLoading;

  const handleConfirm = async () => {
    if (!canConfirm || !category) return;
    await onConfirm({
      reason: reason.trim(),
      category: category as CancelCategory,
      customerNotified,
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (isLoading && !next) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md"
        onEscapeKeyDown={(e) => {
          if (isLoading) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isLoading) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (isLoading) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancelar comanda
          </DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. A comanda será marcada como cancelada
            e registrada no relatório operacional.
          </DialogDescription>
        </DialogHeader>

        {comanda && (
          <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
            <div className="font-semibold truncate">{title}</div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Comanda #{comanda.comanda_number}</span>
              <span>
                {totalQty} {totalQty === 1 ? "item" : "itens"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Valor</span>
              <span className="font-bold tabular-nums">
                {formatBRL(comanda.subtotal)}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="cancel-category">Categoria</Label>
          <Select
            value={category || undefined}
            onValueChange={(v) => setCategory(v as CancelCategory)}
            disabled={isLoading}
          >
            <SelectTrigger id="cancel-category">
              <SelectValue placeholder="Selecione um motivo..." />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="cancel-reason">
              Justificativa <span className="text-destructive">*</span>
            </Label>
            <span
              className={
                reasonValid
                  ? "text-xs text-muted-foreground tabular-nums"
                  : "text-xs text-destructive tabular-nums"
              }
            >
              {reasonTrimmedLength}/{MIN_REASON_LENGTH}
            </span>
          </div>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Descreva o motivo do cancelamento (mínimo 20 caracteres)..."
            rows={4}
            disabled={isLoading}
            maxLength={500}
          />
          {!reasonValid && reasonTrimmedLength > 0 && (
            <p className="text-xs text-muted-foreground">
              Faltam {MIN_REASON_LENGTH - reasonTrimmedLength} caractere(s).
            </p>
          )}
        </div>

        <label className="flex items-start gap-2 cursor-pointer rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
          <Checkbox
            checked={customerNotified}
            onCheckedChange={(v) => setCustomerNotified(v === true)}
            disabled={isLoading}
            className="mt-0.5"
          />
          <span className="text-sm leading-tight">
            Cliente foi informado sobre o cancelamento
            <span className="text-destructive"> *</span>
          </span>
        </label>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cancelando...
              </>
            ) : (
              "Confirmar cancelamento"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
