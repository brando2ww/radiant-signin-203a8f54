import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Send, CreditCard, Utensils, ArrowRightLeft, CheckSquare, X, Pencil, ChefHat, Trash2 } from "lucide-react";
import { usePDVComandas } from "@/hooks/use-pdv-comandas";
import { usePDVTables } from "@/hooks/use-pdv-tables";
import { useDraftCart } from "@/contexts/DraftCartContext";
import { ComandaItemCard } from "@/components/garcom/ComandaItemCard";
import { TransferItemsDialog } from "@/components/pdv/transfer/TransferItemsDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTableLabel } from "@/utils/formatTableNumber";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function GarcomComandaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    comandas,
    comandaItems,
    isLoading,
    sendToKitchenAsync,
    addItem: persistItem,
  } = usePDVComandas();
  const { tables } = usePDVTables();
  const draft = useDraftCart();

  const comanda = comandas.find((c) => c.id === id);
  // Itens persistidos = todos os do banco para esta comanda. São considerados
  // "enviados/em produção" do ponto de vista do garçom — o rascunho ao vivo
  // (não enviado) vive somente em memória local via useDraftCart.
  const sentItems = (id
    ? comandaItems.filter(
        (i) => i.comanda_id === id && !(i as any).is_composite_child,
      )
    : []
  );
  const draftItems = id ? draft.getItems(id) : [];
  const draftCount = id ? draft.count(id) : 0;
  const draftSubtotal = id ? draft.total(id) : 0;
  const sentSubtotal = sentItems.reduce((s, i) => s + i.subtotal, 0);
  const total = sentSubtotal + draftSubtotal;

  const tableOfComanda = comanda?.order_id
    ? tables.find((t) => t.current_order_id === comanda.order_id)
    : null;

  const [sending, setSending] = useState(false);

  const handleFlushDraft = async () => {
    if (!id || draftItems.length === 0 || sending) return;
    setSending(true);
    try {
      const created = await Promise.all(
        draftItems.map((it) =>
          persistItem({
            comandaId: id,
            productId: it.productId,
            productName: it.productName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            notes: it.notes,
          }),
        ),
      );
      await sendToKitchenAsync(created.map((c) => c.id));
      draft.clear(id);
      toast.success("Pedido enviado para a cozinha");
      navigate("/garcom");
    } catch (err: any) {
      toast.error("Erro ao enviar para a cozinha: " + (err?.message ?? "desconhecido"));
    } finally {
      setSending(false);
    }
  };

  const handleDiscardDraft = () => {
    if (!id) return;
    draft.clear(id);
    toast.success("Rascunho descartado");
  };

  // Comanda em cobrança no caixa: garçom não pode mais editar.
  const isLocked = comanda?.status === "em_cobranca";
  const isClosed = comanda?.status === "fechada" || comanda?.status === "cancelada";
  const canEdit = comanda?.status === "aberta";

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Quando aberto, contém ids de itens enviados E/OU draftIds.
  const [transferIds, setTransferIds] = useState<string[] | null>(null);

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
    if (selectedIds.size === 0) return;
    setTransferIds(Array.from(selectedIds));
  };

  const handleTransferWholeComanda = () => {
    const allIds = [
      ...sentItems.map((i) => i.id),
      ...draftItems.map((d) => d.draftId),
    ];
    if (allIds.length === 0) return;
    setTransferIds(allIds);
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-60 rounded-2xl" />
      </div>
    );
  }

  if (!comanda) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">Comanda não encontrada</p>
      </div>
    );
  }

  const statusBadge = (() => {
    if (comanda.status === "em_cobranca") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
          <CreditCard className="h-3 w-3" />
          Em cobrança no caixa
        </span>
      );
    }
    if (comanda.status === "fechada") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
          Paga
        </span>
      );
    }
    return null;
  })();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4 safe-area-top">
        <button onClick={() => navigate(-1)} className="active:scale-95 transition-transform">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold truncate">
            {comanda.customer_name || comanda.comanda_number}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">{comanda.comanda_number}</p>
            {tableOfComanda ? (
              <button
                type="button"
                onClick={() => navigate(`/garcom/mesa/${tableOfComanda.id}`)}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary active:scale-95 transition-transform"
              >
                <Utensils className="h-3 w-3" />
                {formatTableLabel(tableOfComanda.table_number)}
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground">· Avulsa</span>
            )}
            {statusBadge}
          </div>
        </div>
        {canEdit && (sentItems.length + draftItems.length) > 0 && !selectMode && (
          <button
            type="button"
            onClick={handleTransferWholeComanda}
            className="ml-auto h-9 px-2.5 rounded-md text-xs font-medium hover:bg-accent active:scale-95 transition-all inline-flex items-center gap-1.5"
            aria-label="Mover comanda inteira"
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Mover comanda</span>
          </button>
        )}
        {canEdit && (sentItems.length + draftItems.length) > 0 && (
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            className={cn(
              "h-9 px-3 rounded-md text-xs font-medium hover:bg-accent active:scale-95 transition-all inline-flex items-center gap-1.5",
              selectMode && "ml-auto",
            )}
          >
            {selectMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
            {selectMode ? "Cancelar" : "Selecionar"}
          </button>
        )}
      </header>

      {/* Items */}
      <div className="flex-1 p-4 pb-56 space-y-2">
        {isLocked && (
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-700 dark:text-blue-300">
            Esta comanda está sendo cobrada no caixa. Não é possível adicionar ou remover itens enquanto isso.
          </div>
        )}
        {sentItems.length + draftItems.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="text-muted-foreground mb-4">Sem itens na comanda</p>
            {canEdit && (
              <Button
                onClick={() => navigate(`/garcom/comanda/${id}/adicionar`)}
                size="lg"
                className="active:scale-95"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Item
              </Button>
            )}
          </div>
        ) : selectMode ? (
          // Em modo seleção, listamos apenas os itens persistidos. O rascunho
          // local é editável diretamente nos cards "draft" e não faz sentido
          // ser transferido (ainda não foi enviado).
          sentItems.map((item) => (
            <ComandaItemCard
              key={item.id}
              productName={item.product_name}
              quantity={item.quantity}
              unitPrice={item.unit_price}
              notes={item.notes}
              kitchenStatus={item.kitchen_status}
              sentToKitchenAt={item.sent_to_kitchen_at}
              selectMode
              selected={selectedIds.has(item.id)}
              onToggleSelect={() => toggleSelect(item.id)}
            />
          ))
        ) : (
          <>
            {/* Grupo: Novos itens — não enviados ainda (rascunho local) */}
            {draftItems.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-1 pt-1">
                  <div className="flex items-center gap-2">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Novos itens — não enviados ainda
                      <span className="ml-1 normal-case text-muted-foreground/70">
                        ({draftItems.length})
                      </span>
                    </h2>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleDiscardDraft}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                      Descartar
                    </button>
                  )}
                </div>
                {draftItems.map((item) => (
                  <ComandaItemCard
                    key={item.draftId}
                    variant="draft"
                    productName={item.productName}
                    quantity={item.quantity}
                    unitPrice={item.unitPrice}
                    notes={item.notes}
                    kitchenStatus="pendente"
                    sentToKitchenAt={null}
                    onRemove={canEdit ? () => id && draft.removeItem(id, item.draftId) : undefined}
                    onIncrement={canEdit ? () => id && draft.updateQuantity(id, item.draftId, item.quantity + 1) : undefined}
                    onDecrement={canEdit ? () => id && draft.updateQuantity(id, item.draftId, item.quantity - 1) : undefined}
                  />
                ))}
              </section>
            )}

            {/* Grupo: Já enviados para a cozinha */}
            {sentItems.length > 0 && (
              <section className="space-y-2 pt-2">
                <div className="flex items-center gap-2 px-1 pt-1">
                  <ChefHat className="h-3.5 w-3.5 text-muted-foreground" />
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Já enviados para a cozinha
                    <span className="ml-1 normal-case text-muted-foreground/70">
                      ({sentItems.length})
                    </span>
                  </h2>
                </div>
                {sentItems.map((item) => (
                  <ComandaItemCard
                    key={item.id}
                    variant="sent"
                    productName={item.product_name}
                    quantity={item.quantity}
                    unitPrice={item.unit_price}
                    notes={item.notes}
                    kitchenStatus={item.kitchen_status}
                    sentToKitchenAt={item.sent_to_kitchen_at}
                    /* Itens enviados: somente leitura — sem remover/mover fora do selectMode */
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>

      {/* Bottom Action Bar */}
      {!isClosed && !selectMode && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background">
          <div className="p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] space-y-2">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatBRL(total)}</span>
            </div>
            {canEdit ? (
              draftCount > 0 ? (
                <div className="space-y-2">
                  <Button
                    className="w-full h-12 active:scale-95 text-base"
                    onClick={handleFlushDraft}
                    disabled={sending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {sending ? "Enviando..." : `Enviar para cozinha (${draftCount})`}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-11 active:scale-95"
                    onClick={() => navigate(`/garcom/comanda/${id}/adicionar`)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Continuar adicionando
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full h-12 active:scale-95 text-base"
                  onClick={() => navigate(`/garcom/comanda/${id}/adicionar`)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar item
                </Button>
              )
            ) : (
              <p className="text-xs text-center text-muted-foreground py-2">
                {comanda.status === "em_cobranca"
                  ? "O caixa está cobrando esta comanda."
                  : "Esta comanda foi finalizada."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Selection Action Bar */}
      {selectMode && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background">
          <div className="p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] flex items-center gap-2">
            <span className="text-sm font-medium flex-1">
              {selectedIds.size} {selectedIds.size === 1 ? "selecionado" : "selecionados"}
            </span>
            <Button variant="outline" className="h-11" onClick={exitSelectMode}>
              Cancelar
            </Button>
            <Button
              className="h-11 active:scale-95"
              onClick={handleTransferSelected}
              disabled={selectedIds.size === 0}
            >
              <ArrowRightLeft className="h-4 w-4 mr-1.5" />
              Mover ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      {/* Transfer Items Dialog */}
      <TransferItemsDialog
        open={!!transferIds}
        onOpenChange={(o) => !o && setTransferIds(null)}
        sourceComanda={comanda ?? null}
        items={transferIds ? sentItems.filter((it) => transferIds.includes(it.id)) : []}
        onTransferred={() => {
          setTransferIds(null);
          exitSelectMode();
        }}
      />
    </div>
  );
}
