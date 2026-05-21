import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import {
  ChevronDown,
  ChevronUp,
  CreditCard,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  usePDVComandas,
  type Comanda,
  type ComandaItem,
} from "@/hooks/use-pdv-comandas";
import {
  CancelComandaDialog,
  type CancelCategory,
} from "./CancelComandaDialog";

interface SalonQueueCardProps {
  comanda: Comanda;
  items: ComandaItem[];
  /** Rótulo principal (ex: "Mesa 5 — Eduardo" ou "Avulsa — TESTE") */
  title: string;
  /** Cor da borda esquerda do card (hash do order_id) */
  borderColor: string;
  /** Quantas outras comandas da mesma mesa ainda existem (abertas/em_cobranca) */
  siblingCount?: number;
  onCharge: () => void;
}

export function SalonQueueCard({
  comanda,
  items,
  title,
  borderColor,
  siblingCount = 0,
  onCharge,
}: SalonQueueCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { cancelComandaAsync, isCancellingComanda } = usePDVComandas();

  const isCharging = comanda.status === "em_cobranca";
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const preview =
    items.slice(0, 3).map((i) => `${i.quantity}x ${i.product_name}`).join(", ") +
    (items.length > 3 ? ", …" : "");

  const handleConfirmCancel = async (_payload: {
    reason: string;
    category: CancelCategory;
    customerNotified: boolean;
  }) => {
    try {
      await cancelComandaAsync(comanda.id);
      setCancelOpen(false);
    } catch {
      // toast tratado na mutation
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card border-l-4 p-3 transition-colors",
        borderColor,
        isCharging && "opacity-80",
      )}
      aria-busy={isCharging}
    >
      <div className="mb-1">
        <div className="font-semibold text-sm leading-tight truncate">{title}</div>
      </div>

      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-xs text-muted-foreground">
          {totalQty} {totalQty === 1 ? "item" : "itens"}
        </span>
        <span className="text-xl font-bold text-foreground tabular-nums">
          {formatBRL(comanda.subtotal)}
        </span>
      </div>

      {items.length > 0 && (
        <div className="text-[11px] text-muted-foreground line-clamp-1 mb-2">
          {preview}
        </div>
      )}

      {siblingCount > 0 && (
        <div className="text-[11px] text-muted-foreground mb-2 italic">
          Mesa tem mais {siblingCount} comanda{siblingCount > 1 ? "s" : ""}
        </div>
      )}

      {expanded && (
        <div className="mt-2 mb-2 rounded-md bg-muted/40 p-2 space-y-1 max-h-48 overflow-auto">
          {items.length === 0 ? (
            <div className="text-xs text-muted-foreground">Sem itens</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex justify-between text-xs">
                <span className="truncate pr-2">
                  <span className="font-medium">{item.quantity}x</span>{" "}
                  {item.product_name}
                  {item.notes && (
                    <span className="text-muted-foreground"> · {item.notes}</span>
                  )}
                </span>
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {formatBRL(item.subtotal)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-2">
        <Button
          size="sm"
          className="flex-1 h-10 gap-1.5 font-semibold"
          onClick={onCharge}
        >
          <CreditCard className="h-4 w-4" />
          Cobrar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-10 px-2"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Recolher" : "Ver itens"}
          aria-label={expanded ? "Recolher itens" : "Ver itens"}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-10 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setCancelOpen(true)}
              aria-label="Cancelar comanda"
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cancelar comanda</TooltipContent>
        </Tooltip>
      </div>

      <CancelComandaDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        comanda={comanda}
        items={items}
        title={title}
        isLoading={isCancellingComanda}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
}
