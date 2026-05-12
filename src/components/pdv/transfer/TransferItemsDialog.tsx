import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRightLeft,
  Search,
  Utensils,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  Pencil,
} from "lucide-react";
import { usePDVComandas, type Comanda, type ComandaItem } from "@/hooks/use-pdv-comandas";
import { usePDVTables } from "@/hooks/use-pdv-tables";
import { useDraftCart, type DraftItem } from "@/contexts/DraftCartContext";
import { formatTableLabel } from "@/utils/formatTableNumber";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TransferItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ComandaItem[];
  /** Itens em rascunho local (não enviados ao banco). */
  draftItems?: DraftItem[];
  sourceComanda: Comanda | null;
  onTransferred?: () => void;
}

type Step = "destination" | "confirm";
type Destination =
  | { kind: "comanda"; comandaId: string }
  | { kind: "table"; tableId: string };

export function TransferItemsDialog({
  open,
  onOpenChange,
  items,
  draftItems = [],
  sourceComanda,
  onTransferred,
}: TransferItemsDialogProps) {
  const { comandas, transferItems, isTransferringItems } = usePDVComandas();
  const { tables } = usePDVTables();
  const draft = useDraftCart();

  const [step, setStep] = useState<Step>("destination");
  const [search, setSearch] = useState("");
  const [destination, setDestination] = useState<Destination | null>(null);
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null);
  // qtyMap unifica IDs de sent items (uuid do banco) e drafts (draftId).
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [targetComandaName, setTargetComandaName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hasDrafts = draftItems.length > 0;
  const hasSent = items.length > 0;

  // Reset qtyMap quando o conjunto de itens muda
  useEffect(() => {
    const next: Record<string, number> = {};
    items.forEach((it) => (next[it.id] = it.quantity));
    draftItems.forEach((it) => (next[it.draftId] = it.quantity));
    setQtyMap(next);
  }, [items, draftItems]);

  const totalAmount = useMemo(() => {
    const sentTotal = items.reduce(
      (s, it) => s + (qtyMap[it.id] ?? it.quantity) * Number(it.unit_price || 0),
      0,
    );
    const draftTotal = draftItems.reduce(
      (s, it) => s + (qtyMap[it.draftId] ?? it.quantity) * it.unitPrice,
      0,
    );
    return sentTotal + draftTotal;
  }, [items, draftItems, qtyMap]);

  const totalCount = items.length + draftItems.length;
  const hasPreparedItems = items.some(
    (it) => it.kitchen_status === "pronto" || it.kitchen_status === "entregue",
  );

  // Reset state ao fechar
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setStep("destination");
      setSearch("");
      setDestination(null);
      setExpandedTableId(null);
      setTargetComandaName("");
    }
    onOpenChange(next);
  };

  // Comandas abertas (potenciais destinos)
  const openComandas = useMemo(
    () => comandas.filter((c) => c.status === "aberta" && c.id !== sourceComanda?.id),
    [comandas, sourceComanda?.id],
  );

  // Mesas com comandas abertas (excluindo a mesa de origem)
  const sourceOrderId = sourceComanda?.order_id ?? null;
  const tablesWithComandas = useMemo(() => {
    return tables
      .filter((t) => t.current_order_id && t.current_order_id !== sourceOrderId)
      .map((t) => {
        const tComandas = openComandas.filter((c) => c.order_id === t.current_order_id);
        return { table: t, comandas: tComandas };
      })
      .filter((entry) => entry.comandas.length > 0);
  }, [tables, openComandas, sourceOrderId]);

  // Mesas livres — podem receber transferência (RPC abre comanda automaticamente).
  // Drafts NÃO podem ir para mesa livre (precisam de comanda destino existente).
  const freeTables = useMemo(
    () => tables.filter((t) => t.status === "livre" && !t.current_order_id),
    [tables],
  );

  // Comandas avulsas (sem mesa)
  const standaloneComandas = useMemo(
    () => openComandas.filter((c) => !c.order_id),
    [openComandas],
  );

  const filteredFreeTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return freeTables;
    return freeTables.filter((t) =>
      formatTableLabel(t.table_number).toLowerCase().includes(q),
    );
  }, [freeTables, search]);

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tablesWithComandas;
    return tablesWithComandas.filter(({ table, comandas: cs }) => {
      const tableMatch = formatTableLabel(table.table_number).toLowerCase().includes(q);
      const comandaMatch = cs.some(
        (c) =>
          (c.customer_name || "").toLowerCase().includes(q) ||
          (c.comanda_number || "").toLowerCase().includes(q),
      );
      return tableMatch || comandaMatch;
    });
  }, [tablesWithComandas, search]);

  const filteredStandalone = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return standaloneComandas;
    return standaloneComandas.filter(
      (c) =>
        (c.customer_name || "").toLowerCase().includes(q) ||
        (c.comanda_number || "").toLowerCase().includes(q),
    );
  }, [standaloneComandas, search]);

  const targetComanda = useMemo(() => {
    if (destination?.kind !== "comanda") return null;
    return comandas.find((c) => c.id === destination.comandaId) || null;
  }, [comandas, destination]);

  const targetTable = useMemo(() => {
    if (destination?.kind === "table") {
      return tables.find((t) => t.id === destination.tableId) || null;
    }
    if (targetComanda?.order_id) {
      return tables.find((t) => t.current_order_id === targetComanda.order_id) || null;
    }
    return null;
  }, [tables, targetComanda, destination]);

  const sourceTable = useMemo(() => {
    if (!sourceComanda?.order_id) return null;
    return tables.find((t) => t.current_order_id === sourceComanda.order_id) || null;
  }, [tables, sourceComanda]);

  const handleSelectComanda = (comandaId: string) => {
    setDestination({ kind: "comanda", comandaId });
    setStep("confirm");
  };

  const handleSelectFreeTable = (tableId: string) => {
    if (hasDrafts) {
      toast.error(
        "Itens em rascunho não podem ir para mesa livre. Selecione uma comanda existente ou envie o rascunho antes.",
      );
      return;
    }
    setDestination({ kind: "table", tableId });
    setStep("confirm");
  };

  const adjustQty = (id: string, delta: number, max: number) => {
    setQtyMap((prev) => {
      const cur = prev[id] ?? max;
      const next = Math.max(1, Math.min(max, cur + delta));
      return { ...prev, [id]: next };
    });
  };

  const handleConfirm = async () => {
    if (!sourceComanda || !destination) return;
    setSubmitting(true);
    try {
      // 1) Itens enviados — RPC backend
      if (hasSent) {
        const sentQtyMap: Record<string, number> = {};
        items.forEach((it) => {
          const q = qtyMap[it.id] ?? it.quantity;
          if (q !== it.quantity) sentQtyMap[it.id] = q;
        });
        await transferItems({
          itemIds: items.map((i) => i.id),
          targetKind: destination.kind,
          targetId:
            destination.kind === "comanda" ? destination.comandaId : destination.tableId,
          qtyMap: Object.keys(sentQtyMap).length ? sentQtyMap : undefined,
          targetComandaName: targetComandaName.trim() || null,
        });
      }

      // 2) Drafts — manipulação client-side (apenas para destino "comanda")
      if (hasDrafts && destination.kind === "comanda") {
        const draftIds = draftItems.map((d) => d.draftId);
        const draftQtyMap: Record<string, number> = {};
        draftItems.forEach((d) => {
          const q = qtyMap[d.draftId] ?? d.quantity;
          if (q !== d.quantity) draftQtyMap[d.draftId] = q;
        });
        draft.transferDraftItems(
          sourceComanda.id,
          destination.comandaId,
          draftIds,
          Object.keys(draftQtyMap).length ? draftQtyMap : undefined,
        );
      }

      const fromLabel = sourceTable
        ? formatTableLabel(sourceTable.table_number)
        : sourceComanda.customer_name || sourceComanda.comanda_number;
      const toLabel = targetTable
        ? formatTableLabel(targetTable.table_number)
        : targetComanda?.customer_name || targetComanda?.comanda_number || "destino";
      toast.success(
        totalCount === 1
          ? `Item movido de ${fromLabel} para ${toLabel}`
          : `${totalCount} itens movidos de ${fromLabel} para ${toLabel}`,
      );
      onTransferred?.();
      handleOpenChange(false);
    } catch {
      // toast já tratado no hook (sent items). Drafts não lançam.
    } finally {
      setSubmitting(false);
    }
  };

  if (!sourceComanda) return null;
  if (totalCount === 0) return null;

  const isBusy = isTransferringItems || submitting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            {step === "destination" ? "Mover itens" : "Confirmar transferência"}
          </DialogTitle>
          <DialogDescription>
            {step === "destination"
              ? `Selecione o destino para ${totalCount === 1 ? "o item" : `os ${totalCount} itens`}.`
              : "Revise quantidades e detalhes antes de confirmar."}
          </DialogDescription>
        </DialogHeader>

        {/* Itens em destaque */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{totalCount === 1 ? "Item selecionado" : `${totalCount} itens selecionados`}</span>
            <span className="font-semibold tabular-nums text-foreground">{formatBRL(totalAmount)}</span>
          </div>
          <ScrollArea className="max-h-32">
            <div className="space-y-1">
              {items.map((it) => {
                const q = qtyMap[it.id] ?? it.quantity;
                return (
                  <div key={it.id} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">
                      {q}
                      {q !== it.quantity ? `/${it.quantity}` : ""}×
                    </span>
                    <span className="flex-1 truncate">{it.product_name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatBRL(q * Number(it.unit_price || 0))}
                    </span>
                  </div>
                );
              })}
              {draftItems.map((it) => {
                const q = qtyMap[it.draftId] ?? it.quantity;
                return (
                  <div key={it.draftId} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">
                      {q}
                      {q !== it.quantity ? `/${it.quantity}` : ""}×
                    </span>
                    <span className="flex-1 truncate">{it.productName}</span>
                    <Badge variant="secondary" className="text-[10px] h-4">
                      <Pencil className="h-2.5 w-2.5 mr-1" />
                      Rascunho
                    </Badge>
                    <span className="tabular-nums text-muted-foreground">
                      {formatBRL(q * it.unitPrice)}
                    </span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {hasPreparedItems && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 flex gap-2 text-xs text-yellow-700 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Algum item já foi preparado pela cozinha. Mover não desfaz o preparo —
              apenas reatribui o item à comanda destino.
            </span>
          </div>
        )}

        {hasDrafts && (
          <div className="rounded-lg border bg-muted/20 p-3 flex gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Itens em rascunho só podem ser movidos para uma comanda existente
              (mesa ocupada ou avulsa).
            </span>
          </div>
        )}

        {step === "destination" && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar mesa ou comanda…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4">
                {!hasDrafts && filteredFreeTables.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Mesas livres
                    </p>
                    {filteredFreeTables.map((table) => (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => handleSelectFreeTable(table.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 active:scale-[0.99] transition-all text-left"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Utensils className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">
                            {formatTableLabel(table.table_number)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Mesa livre — uma nova comanda será aberta automaticamente
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          Livre
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}

                {filteredTables.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Mesas ocupadas
                    </p>
                    {filteredTables.map(({ table, comandas: tComandas }) => {
                      const isExpanded = expandedTableId === table.id;
                      const singleComanda = tComandas.length === 1;
                      const handleClick = () => {
                        if (singleComanda) {
                          handleSelectComanda(tComandas[0].id);
                        } else {
                          setExpandedTableId(isExpanded ? null : table.id);
                        }
                      };
                      return (
                        <div
                          key={table.id}
                          className="rounded-lg border bg-card overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={handleClick}
                            className="w-full flex items-center gap-3 p-3 hover:bg-accent/50 active:scale-[0.99] transition-all text-left"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Utensils className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">
                                {formatTableLabel(table.table_number)}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {tComandas.length} comanda{tComandas.length > 1 ? "s" : ""} —{" "}
                                {tComandas
                                  .map((c) => c.customer_name || c.comanda_number)
                                  .join(", ")}
                              </p>
                            </div>
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 text-muted-foreground transition-transform",
                                isExpanded && !singleComanda && "rotate-90",
                              )}
                            />
                          </button>
                          {isExpanded && !singleComanda && (
                            <div className="border-t bg-muted/30 p-2 space-y-1">
                              {tComandas.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => handleSelectComanda(c.id)}
                                  className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-accent active:scale-[0.99] transition-all text-left text-sm"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">
                                      {c.customer_name || c.comanda_number}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatBRL(c.subtotal)}
                                    </p>
                                  </div>
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredStandalone.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Comandas avulsas
                    </p>
                    {filteredStandalone.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectComanda(c.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 active:scale-[0.99] transition-all text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {c.customer_name || c.comanda_number}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.comanda_number} · {formatBRL(c.subtotal)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          Avulsa
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}

                {filteredTables.length === 0 &&
                  filteredStandalone.length === 0 &&
                  (hasDrafts || filteredFreeTables.length === 0) && (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      Nenhum destino disponível para os itens.
                    </div>
                  )}
              </div>
            </ScrollArea>

            <Separator />
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
            </div>
          </>
        )}

        {step === "confirm" && destination && (
          <>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 bg-destructive/5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    De
                  </p>
                  <p className="font-semibold text-sm">
                    {sourceTable
                      ? formatTableLabel(sourceTable.table_number)
                      : "Avulsa"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {sourceComanda.customer_name || sourceComanda.comanda_number}
                  </p>
                  <p className="mt-2 text-xs text-destructive font-medium tabular-nums">
                    − {formatBRL(totalAmount)}
                  </p>
                </div>
                <div className="rounded-lg border p-3 bg-emerald-500/5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Para
                  </p>
                  <p className="font-semibold text-sm">
                    {targetTable
                      ? formatTableLabel(targetTable.table_number)
                      : "Avulsa"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {destination.kind === "table"
                      ? "Nova comanda será aberta"
                      : targetComanda?.customer_name || targetComanda?.comanda_number}
                  </p>
                  <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
                    + {formatBRL(totalAmount)}
                  </p>
                </div>
              </div>

              {/* Stepper de quantidade parcial — só para itens com qty > 1 */}
              {[...items, ...draftItems].some(
                (it) => ("quantity" in it ? it.quantity : 0) > 1,
              ) && (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Quantidade a transferir
                  </p>
                  <div className="space-y-2">
                    {items.map((it) => {
                      if (it.quantity <= 1) return null;
                      const q = qtyMap[it.id] ?? it.quantity;
                      return (
                        <div key={it.id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 truncate">{it.product_name}</span>
                          <button
                            type="button"
                            onClick={() => adjustQty(it.id, -1, it.quantity)}
                            disabled={isBusy || q <= 1}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-background hover:bg-accent active:scale-95 transition-all disabled:opacity-40"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-[3rem] text-center font-semibold tabular-nums">
                            {q}/{it.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustQty(it.id, +1, it.quantity)}
                            disabled={isBusy || q >= it.quantity}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-background hover:bg-accent active:scale-95 transition-all disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    {draftItems.map((it) => {
                      if (it.quantity <= 1) return null;
                      const q = qtyMap[it.draftId] ?? it.quantity;
                      return (
                        <div key={it.draftId} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 truncate">
                            {it.productName}
                            <Badge variant="secondary" className="ml-2 text-[10px] h-4">
                              Rascunho
                            </Badge>
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustQty(it.draftId, -1, it.quantity)}
                            disabled={isBusy || q <= 1}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-background hover:bg-accent active:scale-95 transition-all disabled:opacity-40"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-[3rem] text-center font-semibold tabular-nums">
                            {q}/{it.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustQty(it.draftId, +1, it.quantity)}
                            disabled={isBusy || q >= it.quantity}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md border bg-background hover:bg-accent active:scale-95 transition-all disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {destination.kind === "table" && targetTable && !targetTable.current_order_id && (
                <div className="rounded-lg border p-3 space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Nome da comanda (opcional)
                  </label>
                  <Input
                    value={targetComandaName}
                    onChange={(e) => setTargetComandaName(e.target.value)}
                    placeholder="Ex.: João, Mesa do fundo…"
                    disabled={isBusy}
                  />
                </div>
              )}

              <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                Esta ação é registrada no log de auditoria e atualiza os subtotais imediatamente.
                Se a mesa de origem ficar vazia, ela será liberada automaticamente.
              </div>
            </div>

            <Separator />
            <div className="flex justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => setStep("destination")}
                disabled={isBusy}
              >
                Voltar
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isBusy}
                >
                  Cancelar
                </Button>
                <Button onClick={handleConfirm} disabled={isBusy}>
                  {isBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Transferindo…
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Confirmar transferência
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
