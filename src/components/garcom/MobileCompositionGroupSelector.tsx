import { useState } from "react";
import { Check, Minus, Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import type { CompositionGroup, CompositionItem } from "@/hooks/use-pdv-composition-groups";
import type { SelectedOption } from "@/components/pdv/ProductOptionSelector";

interface Props {
  groups: CompositionGroup[];
  basePrice: number;
  onConfirm: (selections: SelectedOption[]) => void;
  onBack: () => void;
}

function helperText(group: CompositionGroup): string {
  const min = group.min_selections || (group.is_required ? 1 : 0);
  const max = group.max_selections || 0;
  if (group.type === "single") return "Escolha 1";
  if (max > 0 && min > 0 && min !== max) return `Escolha de ${min} a ${max}`;
  if (max > 0 && min === max) return `Escolha ${max}`;
  if (max > 0) return `Escolha até ${max}`;
  if (min > 0) return `Escolha pelo menos ${min}`;
  return "Escolha quantos quiser";
}

type Selection = Record<string /* groupId */, Record<string /* itemId */, number>>;

function totalSelected(sel: Record<string, number> | undefined): number {
  if (!sel) return 0;
  return Object.values(sel).reduce((a, b) => a + b, 0);
}

export function MobileCompositionGroupSelector({
  groups,
  basePrice,
  onConfirm,
  onBack,
}: Props) {
  const [selection, setSelection] = useState<Selection>({});

  const setItemQty = (group: CompositionGroup, itemId: string, qty: number) => {
    setSelection((prev) => {
      const groupSel = { ...(prev[group.id] || {}) };
      if (qty <= 0) delete groupSel[itemId];
      else groupSel[itemId] = qty;
      return { ...prev, [group.id]: groupSel };
    });
  };

  const toggle = (group: CompositionGroup, itemId: string) => {
    const current = selection[group.id] || {};
    const isSel = (current[itemId] || 0) > 0;

    if (group.type === "single") {
      if (isSel) {
        if (group.is_required) return; // não permite desselecionar único obrigatório
        setSelection((prev) => ({ ...prev, [group.id]: {} }));
        return;
      }
      setSelection((prev) => ({ ...prev, [group.id]: { [itemId]: 1 } }));
      return;
    }

    // multiple sem quantidade — toggle binário
    if (!group.allow_quantity) {
      if (isSel) {
        setItemQty(group, itemId, 0);
      } else {
        if (group.max_selections > 0 && totalSelected(current) >= group.max_selections) return;
        setItemQty(group, itemId, 1);
      }
      return;
    }

    // multiple com quantidade — clicar adiciona +1 se ainda couber
    const total = totalSelected(current);
    if (group.max_selections > 0 && total >= group.max_selections) return;
    setItemQty(group, itemId, (current[itemId] || 0) + 1);
  };

  const isGroupValid = (group: CompositionGroup): boolean => {
    const total = totalSelected(selection[group.id]);
    if (!group.is_required) return true;
    const min = group.min_selections || 1;
    if (total < min) return false;
    if (group.max_selections > 0 && total > group.max_selections) return false;
    return true;
  };

  const isValid = groups.every(isGroupValid);

  const handleConfirm = () => {
    const result: SelectedOption[] = groups
      .filter((g) => totalSelected(selection[g.id]) > 0)
      .map((g) => {
        const groupSel = selection[g.id] || {};
        const items = g.items.flatMap((c: CompositionItem) => {
          const qty = groupSel[c.id] || 0;
          if (qty <= 0) return [];
          const child: any = c.child_product;
          // Repete o item N vezes para que o expansor existente crie N filhos
          return Array.from({ length: qty }, () => ({
            itemId: c.id,
            itemName: child?.name || "Item",
            priceAdjustment: 0,
            linkedProductId: c.child_product_id,
            printerStation: child?.printer_station ?? null,
            recipes: [],
          }));
        });
        return {
          optionId: g.id,
          optionName: g.name,
          items,
        };
      });
    onConfirm(result);
  };

  const showStepLabel = groups.length > 1;

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex items-baseline justify-between rounded-xl bg-muted/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">Total</span>
        <span className="text-base font-semibold tabular-nums">
          {formatBRL(basePrice)}
        </span>
      </div>

      <div className="space-y-5 pb-4">
        {groups.map((group, idx) => {
          const groupSel = selection[group.id] || {};
          const total = totalSelected(groupSel);
          const valid = isGroupValid(group);
          const filled = total > 0;
          const maxReached =
            group.max_selections > 0 && total >= group.max_selections;

          return (
            <section
              key={group.id}
              aria-required={group.is_required}
              className={cn(
                "rounded-2xl border p-3 transition-colors",
                filled ? "bg-muted/30 border-border" : "bg-card border-border",
              )}
            >
              <header className="mb-3">
                {showStepLabel && (
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Etapa {idx + 1} de {groups.length}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold leading-tight">
                    {group.name}
                  </h3>
                  {group.is_required && (
                    <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                      Obrigatório
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    valid || !group.is_required
                      ? "text-muted-foreground"
                      : "text-destructive",
                  )}
                >
                  {helperText(group)}
                  {group.max_selections > 0 && (
                    <span className="ml-1 tabular-nums">
                      · {total}/{group.max_selections}
                    </span>
                  )}
                </p>
              </header>

              <div className="space-y-2">
                {group.items.length === 0 ? (
                  <p className="rounded-lg border border-dashed py-3 text-center text-xs text-muted-foreground">
                    Nenhum item disponível
                  </p>
                ) : (
                  group.items.map((item) => {
                    const qty = groupSel[item.id] || 0;
                    const isSelected = qty > 0;
                    const childName = (item.child_product as any)?.name || "Item";
                    const disabledAdd =
                      !isSelected && maxReached && group.type !== "single";

                    if (group.allow_quantity && group.type === "multiple") {
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-3 py-2.5 min-h-[52px]",
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-border bg-background",
                          )}
                        >
                          <span className="min-w-0 flex-1 flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">
                              {childName}
                            </span>
                            <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setItemQty(group, item.id, Math.max(0, qty - 1))}
                              disabled={qty <= 0}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border active:scale-95 transition-transform disabled:opacity-40"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-6 text-center font-semibold tabular-nums text-sm">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (maxReached) return;
                                setItemQty(group, item.id, qty + 1);
                              }}
                              disabled={maxReached}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border active:scale-95 transition-transform disabled:opacity-40"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={disabledAdd}
                        onClick={() => toggle(group, item.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors min-h-[52px]",
                          "active:scale-[0.98] transition-transform",
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background",
                          disabledAdd && "opacity-50",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/30 bg-transparent",
                          )}
                        >
                          {isSelected && <Check className="h-4 w-4" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{childName}</span>
                          <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div
        className="sticky bottom-0 -mx-4 mt-2 border-t bg-background px-4 pt-3 pb-4 shadow-[0_-8px_16px_-8px_rgba(0,0,0,0.15)]"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            onClick={onBack}
          >
            Voltar
          </Button>
          <Button
            type="button"
            className="h-12 flex-[2] text-base"
            onClick={handleConfirm}
            disabled={!isValid}
          >
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
