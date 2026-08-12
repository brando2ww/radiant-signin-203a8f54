import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { differenceInMinutes } from "date-fns";
import { useCancelNFCe } from "@/hooks/use-fiscal-coupon-actions";
import type { FiscalCoupon } from "@/hooks/use-fiscal-coupons";

interface Props {
  coupon: FiscalCoupon | null;
  open: boolean;
  onClose: () => void;
}

export function CancelNFCeDialog({ coupon, open, onClose }: Props) {
  const [reason, setReason] = useState("");
  const cancel = useCancelNFCe();

  if (!coupon) return null;

  const elapsed = coupon.data_autorizacao
    ? differenceInMinutes(new Date(), new Date(coupon.data_autorizacao))
    : null;
  const expired = elapsed !== null && elapsed > 30;

  const submit = async () => {
    if (reason.length < 15) return;
    await cancel.mutateAsync({ ref: coupon.referencia_focusnfe, justificativa: reason });
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar cupom NFC-e</DialogTitle>
          <DialogDescription>
            O cancelamento só é aceito pela SEFAZ em até 30 minutos após a autorização.
            {elapsed !== null && (
              <span className="block mt-1">
                Tempo decorrido: <strong>{elapsed} min</strong>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {expired ? (
          <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Prazo de 30 minutos expirado. Não é mais possível cancelar este cupom.
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Justificativa <span className="text-muted-foreground">(mín. 15, máx. 255 caracteres)</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 255))}
              rows={4}
              placeholder="Descreva o motivo do cancelamento..."
            />
            <div className="text-xs text-muted-foreground text-right">
              {reason.length} / 255
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Voltar</Button>
          <Button
            variant="destructive"
            disabled={expired || reason.length < 15 || cancel.isPending}
            onClick={submit}
          >
            {cancel.isPending ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
