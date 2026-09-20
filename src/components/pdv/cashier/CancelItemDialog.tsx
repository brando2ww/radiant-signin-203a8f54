// Pede o motivo antes de cancelar um item da comanda.
//
// Antes o botão da lixeira apagava a linha na hora, sem confirmação e sem
// registro. Agora todo cancelamento passa pela RPC pdv_cancel_comanda_item,
// que exige a permissão e guarda autor, horário e motivo.
import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2 } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { CATEGORIES, type CancelCategory } from "@/components/pdv/cashier/CancelComandaDialog";

export interface ItemParaCancelar {
  id: string;
  product_name: string;
  quantity: number;
  subtotal: number;
}

interface Props {
  item: ItemParaCancelar | null;
  onOpenChange: (aberto: boolean) => void;
  onConfirm: (payload: { id: string; reason?: string; category: CancelCategory }) => void;
  isLoading?: boolean;
}

export function CancelItemDialog({ item, onOpenChange, onConfirm, isLoading = false }: Props) {
  const [category, setCategory] = useState<CancelCategory | "">("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!item) {
      setCategory("");
      setReason("");
    }
  }, [item]);

  return (
    <AlertDialog open={!!item} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar item?</AlertDialogTitle>
          <AlertDialogDescription>
            {item && (
              <>
                <span className="font-medium text-foreground">
                  {item.quantity}x {item.product_name}
                </span>{" "}
                · {formatBRL(Number(item.subtotal || 0))} sai da conta.
                <br />
                O cancelamento fica registrado com seu nome, o horário e o motivo.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as CancelCategory)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Escolha o motivo" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Alguma informação que ajude a entender depois"
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isLoading || !category || !item}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              if (!item || !category) return;
              onConfirm({ id: item.id, reason: reason.trim() || undefined, category });
            }}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cancelando...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Cancelar item
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
