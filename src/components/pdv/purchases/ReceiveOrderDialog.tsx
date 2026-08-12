import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, PackageCheck, AlertCircle } from "lucide-react";
import { PurchaseOrder, usePDVPurchaseOrders } from "@/hooks/use-pdv-purchase-orders";
import { formatBRL } from "@/lib/format";

interface ReceiveOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: PurchaseOrder;
}

// 50.05 - 50 dá 0.04999999999999716 em ponto flutuante: arredonda antes de
// comparar e de exibir, senão a divergência aparece com 16 casas decimais.
const round3 = (n: number) => Math.round(n * 1000) / 1000;

const formatQty = (n: number) =>
  round3(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export function ReceiveOrderDialog({
  open,
  onOpenChange,
  order,
}: ReceiveOrderDialogProps) {
  const { receiveOrder } = usePDVPurchaseOrders();
  // Quantidade que está chegando agora, por item (default: o que falta)
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const items = useMemo(() => order.items ?? [], [order.items]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, number> = {};
    items.forEach((item) => {
      next[item.id] = Number(item.quantity_received ?? 0) || Number(item.quantity);
    });
    setQuantities(next);
  }, [open, items]);

  const totalReceived = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (quantities[item.id] ?? 0) * Number(item.unit_price),
        0
      ),
    [items, quantities]
  );

  const divergent = useMemo(
    () =>
      items.filter(
        (item) => round3((quantities[item.id] ?? 0) - Number(item.quantity)) !== 0
      ),
    [items, quantities]
  );

  // Só o que veio A MENOS permite encerrar o pedido. Item recebido a mais também
  // é divergência, mas não deixa pendência para o fornecedor entregar.
  const missing = useMemo(
    () =>
      items.filter(
        (item) => round3((quantities[item.id] ?? 0) - Number(item.quantity)) < 0
      ),
    [items, quantities]
  );

  // Encerrar o pedido faltando mercadoria: o fornecedor avisou que não entrega o
  // resto, então manter o pedido pendente para sempre só suja a fila.
  const [closeIncomplete, setCloseIncomplete] = useState(false);
  const [closeReason, setCloseReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setCloseIncomplete(false);
    setCloseReason("");
  }, [open]);

  // Se o usuário corrigir as quantidades e não faltar mais nada, a opção some.
  useEffect(() => {
    if (missing.length === 0 && closeIncomplete) setCloseIncomplete(false);
  }, [missing.length, closeIncomplete]);

  const reasonMissing = closeIncomplete && closeReason.trim().length === 0;

  const handleConfirm = () => {
    receiveOrder.mutate(
      {
        orderId: order.id,
        items: items.map((item) => ({
          item_id: item.id,
          quantity: round3(quantities[item.id] ?? 0),
        })),
        closeIncomplete,
        closeReason: closeIncomplete ? closeReason.trim() : undefined,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            Receber pedido {order.order_number}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Confira o que chegou de fato. A quantidade recebida entra no estoque do
            insumo e atualiza o custo médio · registre aqui só o que você conferiu
            fisicamente.
          </p>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Este pedido não tem itens.
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-2 pr-2">
              {items.map((item) => {
                const ordered = Number(item.quantity);
                const received = quantities[item.id] ?? 0;
                const diff = round3(received - ordered);

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.ingredient?.name ?? "Insumo"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pedido: {formatQty(ordered)} {item.unit} ·{" "}
                        {formatBRL(Number(item.unit_price))}/{item.unit}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-28 text-right"
                        value={received}
                        onChange={(e) =>
                          setQuantities((q) => ({
                            ...q,
                            [item.id]: Math.max(0, parseFloat(e.target.value) || 0),
                          }))
                        }
                      />
                      <span className="w-8 text-xs text-muted-foreground">
                        {item.unit}
                      </span>
                    </div>

                    <div className="flex w-28 shrink-0 justify-end">
                      {diff === 0 ? (
                        <Badge variant="secondary" className="text-xs">
                          Completo
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="whitespace-nowrap border-amber-400 text-xs text-amber-700"
                        >
                          {diff > 0 ? "+" : "−"}
                          {formatQty(Math.abs(diff))} {item.unit}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {divergent.length > 0 && (
          <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {divergent.length} item(ns) com quantidade diferente da pedida.
                {missing.length > 0 ? (
                  <>
                    {" "}O pedido ficará marcado como <strong>parcial</strong> enquanto
                    faltar mercadoria.
                  </>
                ) : null}
              </p>
            </div>

            {missing.length > 0 && (
              <div className="space-y-2 border-t border-amber-300/70 pt-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={closeIncomplete}
                    onCheckedChange={(v) => setCloseIncomplete(v === true)}
                    className="mt-0.5 border-amber-500 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                  />
                  <span>
                    O fornecedor não vai entregar o restante.{" "}
                    <strong>Encerrar o pedido assim mesmo.</strong>
                  </span>
                </label>

                {closeIncomplete && (
                  <div className="space-y-1 pl-6">
                    <Textarea
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.target.value)}
                      placeholder="Por que o pedido está sendo encerrado incompleto? Ex.: fornecedor sem estoque, item descontinuado, compra concluída em outro fornecedor."
                      maxLength={500}
                      className="min-h-[72px] bg-white text-foreground"
                    />
                    <p className="text-[11px] text-amber-700">
                      A justificativa é obrigatória e fica registrada no pedido. As
                      quantidades acima continuam sendo as que entram no estoque.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-3 py-2">
          <span className="text-sm font-medium">Valor recebido</span>
          <span className="text-lg font-semibold">{formatBRL(totalReceived)}</span>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={receiveOrder.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={receiveOrder.isPending || items.length === 0 || reasonMissing}
            title={reasonMissing ? "Descreva o motivo do encerramento" : undefined}
          >
            {receiveOrder.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PackageCheck className="mr-2 h-4 w-4" />
            )}
            {closeIncomplete ? "Receber e encerrar pedido" : "Confirmar recebimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
