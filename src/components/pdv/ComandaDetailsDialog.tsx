import { useState } from "react";
import {
  Dialog,
  DialogContent,
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
import { Separator } from "@/components/ui/separator";
import {
  User,
  Plus,
  Minus,
  Trash2,
  ArrowRightLeft,
  ChefHat,
  Send,
  X,
  CheckSquare,
} from "lucide-react";
import { Comanda, ComandaItem, KitchenStatus } from "@/hooks/use-pdv-comandas";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIA_LABEL } from "@/lib/reports/cancellations";
import { CancelItemDialog, type ItemParaCancelar } from "@/components/pdv/cashier/CancelItemDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ComandaDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comanda: Comanda | null;
  items: ComandaItem[];
  onAddItem: () => void;
  onUpdateItem: (id: string, updates: Partial<ComandaItem>) => void;
  onRemoveItem: (arg: { id: string; reason?: string; category?: string }) => void;
  onTransferItem?: (itemId: string) => void;
  onTransferMultiple?: (itemIds: string[]) => void;
  onSendToKitchen: (itemIds: string[]) => void;
  onClose: () => void;
  onCancel: () => void;
}

const KITCHEN_STATUS_CONFIG: Record<
  KitchenStatus,
  { label: string; className: string }
> = {
  pendente: {
    label: "Pendente",
    className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  },
  preparando: {
    label: "Preparando",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  },
  pronto: {
    label: "Pronto",
    className: "bg-green-500/10 text-green-600 border-green-500/20",
  },
  entregue: {
    label: "Entregue",
    className: "bg-muted text-muted-foreground",
  },
};

export function ComandaDetailsDialog({
  open,
  onOpenChange,
  comanda,
  items,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onTransferItem,
  onTransferMultiple,
  onSendToKitchen,
  onClose,
  onCancel,
}: ComandaDetailsDialogProps) {
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (!comanda) return null;

  const isOpen = comanda.status === "aberta";
  // Itens cancelados desta comanda. O cliente pediu que o cancelamento ficasse
  // visível na própria comanda, com autor, horário e motivo.
  const { data: itensCancelados = [] } = useQuery({
    queryKey: ["comanda-itens-cancelados", comanda?.id],
    enabled: open && !!comanda?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pdv_cancelled_comanda_items")
        .select("id, product_name, quantity, subtotal, cancelled_at, cancelled_by_user_id, cancellation_reason, cancellation_category")
        .eq("comanda_id", comanda!.id)
        .order("cancelled_at", { ascending: false });
      const linhas = data || [];
      const ids = Array.from(new Set(linhas.map((l: any) => l.cancelled_by_user_id).filter(Boolean))) as string[];
      const nomes = new Map<string, string>();
      if (ids.length) {
        const { data: perfis } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        (perfis || []).forEach((p: any) => nomes.set(p.id, p.full_name || "—"));
      }
      return linhas.map((l: any) => ({
        ...l,
        userName: nomes.get(l.cancelled_by_user_id) || "—",
      }));
    },
  });

  const [itemParaCancelar, setItemParaCancelar] = useState<ItemParaCancelar | null>(null);

  const pendingItems = items.filter(
    (item) => !item.sent_to_kitchen_at && item.kitchen_status === "pendente"
  );
  const hasPendingItems = pendingItems.length > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleTransferSelected = () => {
    if (!onTransferMultiple || selectedIds.size === 0) return;
    onTransferMultiple(Array.from(selectedIds));
    exitSelectMode();
  };

  const handleQuantityChange = (item: ComandaItem, delta: number) => {
    const newQuantity = item.quantity + delta;
    if (newQuantity < 1) return;
    onUpdateItem(item.id, {
      quantity: newQuantity,
      subtotal: newQuantity * item.unit_price,
    });
  };

  const handleSendAllToKitchen = () => {
    const ids = pendingItems.map((item) => item.id);
    onSendToKitchen(ids);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => {
          if (!o) {
            setConfirmClose(false);
            setConfirmCancel(false);
          }
          onOpenChange(o);
        }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>Comanda #{comanda.comanda_number}</span>
                <Badge
                  className={
                    comanda.status === "aberta"
                      ? "bg-green-500/10 text-green-600"
                      : comanda.status === "fechada"
                        ? "bg-muted text-muted-foreground"
                        : "bg-destructive/10 text-destructive"
                  }
                >
                  {comanda.status === "aberta"
                    ? "Aberta"
                    : comanda.status === "fechada"
                      ? "Fechada"
                      : "Cancelada"}
                </Badge>
              </div>
            </DialogTitle>
            {comanda.customer_name && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>{comanda.customer_name}</span>
                {comanda.person_number && (
                  <span>(Pessoa {comanda.person_number})</span>
                )}
              </div>
            )}
            {isOpen && onTransferMultiple && items.length > 0 && (
              <div className="flex items-center justify-end pt-1">
                {!selectMode ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setSelectMode(true)}
                  >
                    <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                    Selecionar para mover
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={exitSelectMode}
                  >
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Cancelar seleção
                  </Button>
                )}
              </div>
            )}
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
            {items.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p>Nenhum item na comanda</p>
                {isOpen && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={onAddItem}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar item
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const kitchenConfig = KITCHEN_STATUS_CONFIG[item.kitchen_status];
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-start gap-3 p-3 bg-muted/50 rounded-lg transition-colors",
                        selectMode && "cursor-pointer hover:bg-muted",
                        selectMode && isSelected && "bg-primary/10 ring-1 ring-primary/40",
                      )}
                      onClick={selectMode ? () => toggleSelect(item.id) : undefined}
                    >
                      {selectMode && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium truncate">
                              {item.product_name}
                            </p>
                            {item.notes && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.notes}
                              </p>
                            )}
                          </div>
                          <Badge className={cn("shrink-0", kitchenConfig.className)}>
                            {kitchenConfig.label}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            {isOpen && (
                              <>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleQuantityChange(item, -1)}
                                  disabled={item.quantity <= 1}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="w-8 text-center font-medium">
                                  {item.quantity}
                                </span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleQuantityChange(item, 1)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                            {!isOpen && (
                              <span className="text-sm">
                                Qtd: {item.quantity}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {formatBRL(item.subtotal)}
                            </span>
                            {isOpen && (
                              <div className="flex gap-1">
                                {onTransferItem && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => onTransferItem(item.id)}
                                    title="Transferir item"
                                  >
                                    <ArrowRightLeft className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setItemParaCancelar(item)}
                                  title="Remover item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {itensCancelados.length > 0 && (
              <div className="mt-4 space-y-2">
                <Separator />
                <p className="text-xs font-medium text-muted-foreground pt-1">
                  Itens cancelados ({itensCancelados.length})
                </p>
                {itensCancelados.map((c: any) => (
                  <div key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm line-through text-muted-foreground truncate">
                        {c.quantity}x {c.product_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(c.cancelled_at), "dd/MM HH:mm", { locale: ptBR })} · {c.userName}
                        {c.cancellation_category ? ` · ${CATEGORIA_LABEL[c.cancellation_category] || c.cancellation_category}` : ""}
                      </p>
                      {c.cancellation_reason && (
                        <p className="text-[11px] text-muted-foreground italic truncate">{c.cancellation_reason}</p>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground line-through shrink-0">
                      {formatBRL(Number(c.subtotal || 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="shrink-0 space-y-2">
            {selectMode && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <span className="text-sm font-medium">
                  {selectedIds.size} {selectedIds.size === 1 ? "item selecionado" : "itens selecionados"}
                </span>
                <Button
                  size="sm"
                  onClick={handleTransferSelected}
                  disabled={selectedIds.size === 0}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                  Mover {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                </Button>
              </div>
            )}

            <Separator className="my-2" />

            {/* Totals */}
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatBRL(comanda.subtotal)}</span>
            </div>

            {/* Actions */}
            {isOpen && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={onAddItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Item
                </Button>
                {hasPendingItems && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleSendAllToKitchen}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Enviar Cozinha ({pendingItems.length})
                  </Button>
                )}
                <div className="w-full flex gap-2">
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => setConfirmCancel(true)}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                  <Button className="flex-1" onClick={() => setConfirmClose(true)}>
                    <ChefHat className="h-4 w-4 mr-2" />
                    Fechar Comanda
                  </Button>
                </div>
              </div>
            )}
          </div>

        </DialogContent>
      </Dialog>

      {/* Close Confirmation */}
      <CancelItemDialog
        item={itemParaCancelar}
        onOpenChange={(aberto) => { if (!aberto) setItemParaCancelar(null); }}
        onConfirm={(payload) => {
          onRemoveItem(payload);
          setItemParaCancelar(null);
        }}
      />

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar Comanda?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao fechar a comanda, ela será finalizada e não poderá mais receber
              itens. O valor total é {formatBRL(comanda.subtotal)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmClose(false);
                onClose();
                onOpenChange(false);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation */}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Comanda?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os itens serão cancelados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmCancel(false);
                onCancel();
                onOpenChange(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar Comanda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
