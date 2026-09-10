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
import {
  CANCEL_CATEGORIES,
  MIN_CANCEL_REASON_LENGTH,
  type CancelCategory,
} from "@/lib/cancel-reasons";

export type { CancelCategory };

export interface CancelOrderSummary {
  /** Identificador exibido (ex: "#0042" ou "CMD-...") */
  reference?: string;
  /** Linha principal (ex: nome do cliente / mesa) */
  title: string;
  /** Total de itens (opcional) */
  itemsCount?: number;
  /** Valor (R$) */
  total: number;
}

interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Comanda" ou "Pedido" — usado nos textos */
  resourceLabel?: string;
  summary: CancelOrderSummary | null;
  isLoading?: boolean;
  /**
   * Motivos exigidos pela plataforma de origem (iFood, DeliveryMuch). Quando
   * vem preenchido, escolher um é OBRIGATÓRIO: o iFood recusa cancelamento
   * sem `cancellationCode`, e a lista muda conforme o estágio do pedido.
   */
  platformReasons?: { code: string; description: string }[];
  platformLabel?: string;
  loadingPlatformReasons?: boolean;
  onConfirm: (payload: {
    reason: string;
    category: CancelCategory;
    customerNotified: boolean;
    cancellationCode?: string;
  }) => Promise<void> | void;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  resourceLabel = "pedido",
  summary,
  isLoading = false,
  platformReasons,
  platformLabel,
  loadingPlatformReasons = false,
  onConfirm,
}: CancelOrderDialogProps) {
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<CancelCategory | "">("");
  const [customerNotified, setCustomerNotified] = useState(false);
  const [platformCode, setPlatformCode] = useState("");

  const requiresPlatformReason = !!platformLabel;

  useEffect(() => {
    if (open) {
      setReason("");
      setCategory("");
      setCustomerNotified(false);
      setPlatformCode("");
    }
  }, [open, summary?.reference]);

  const reasonTrimmedLength = reason.trim().length;
  const reasonValid = reasonTrimmedLength >= MIN_CANCEL_REASON_LENGTH;
  const canConfirm =
    !!summary && reasonValid && !!category && customerNotified && !isLoading &&
    (!requiresPlatformReason || !!platformCode);

  const handleConfirm = async () => {
    if (!canConfirm || !category) return;
    await onConfirm({
      reason: reason.trim(),
      category: category as CancelCategory,
      customerNotified,
      cancellationCode: platformCode || undefined,
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (isLoading && !next) return;
    onOpenChange(next);
  };

  const label = resourceLabel.toLowerCase();
  const itemsCount = summary?.itemsCount;

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
            Cancelar {label}
          </DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. O {label} será marcado como cancelado
            e registrado no relatório operacional.
          </DialogDescription>
        </DialogHeader>

        {summary && (
          <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
            <div className="font-semibold truncate">{summary.title}</div>
            {(summary.reference || itemsCount != null) && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {summary.reference && <span>{summary.reference}</span>}
                {itemsCount != null && (
                  <span>
                    {itemsCount} {itemsCount === 1 ? "item" : "itens"}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Valor</span>
              <span className="font-bold tabular-nums">
                {formatBRL(summary.total)}
              </span>
            </div>
          </div>
        )}

        {requiresPlatformReason && (
          <div className="space-y-2">
            <Label htmlFor="cancel-platform-reason">
              Motivo aceito pelo {platformLabel}
            </Label>
            <Select
              value={platformCode || undefined}
              onValueChange={setPlatformCode}
              disabled={isLoading || loadingPlatformReasons || !platformReasons?.length}
            >
              <SelectTrigger id="cancel-platform-reason">
                <SelectValue
                  placeholder={
                    loadingPlatformReasons
                      ? "Buscando motivos na plataforma..."
                      : platformReasons?.length
                        ? "Selecione o motivo..."
                        : "A plataforma não ofereceu motivos para este pedido"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(platformReasons ?? []).map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O {platformLabel} só aceita cancelamento com um motivo da lista dele.
              A lista muda conforme o estágio do pedido.
            </p>
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
              {CANCEL_CATEGORIES.map((c) => (
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
              {reasonTrimmedLength}/{MIN_CANCEL_REASON_LENGTH}
            </span>
          </div>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Descreva o motivo do cancelamento (mínimo 10 caracteres)..."
            rows={4}
            disabled={isLoading}
            maxLength={500}
          />
          {!reasonValid && reasonTrimmedLength > 0 && (
            <p className="text-xs text-muted-foreground">
              Faltam {MIN_CANCEL_REASON_LENGTH - reasonTrimmedLength} caractere(s).
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
