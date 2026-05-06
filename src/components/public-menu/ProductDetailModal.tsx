import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, Clock, Users } from "lucide-react";
import { PublicProduct } from "@/hooks/use-public-menu";
import { useState, useEffect, useMemo } from "react";
import { CartItem } from "@/pages/PublicMenu";
import { toast } from "sonner";
import { useMarketingTracking } from "@/hooks/use-marketing-tracking";
import { formatBRL } from "@/lib/format";

interface ProductDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: PublicProduct;
  onAddToCart: (item: CartItem) => void;
}

// optionId -> itemId -> quantity
type Selections = Record<string, Record<string, number>>;

export const ProductDetailModal = ({
  open,
  onOpenChange,
  product,
  onAddToCart,
}: ProductDetailModalProps) => {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [selections, setSelections] = useState<Selections>({});
  const { trackViewItem } = useMarketingTracking();

  const basePrice = product.promotional_price || product.base_price;

  useEffect(() => {
    if (open) {
      trackViewItem({
        id: product.id,
        name: product.name,
        price: Number(basePrice),
      });
    }
  }, [open, product.id, product.name, basePrice, trackViewItem]);

  const getQty = (optionId: string, itemId: string) =>
    selections[optionId]?.[itemId] ?? 0;

  const getOptionTotal = (optionId: string) =>
    Object.values(selections[optionId] || {}).reduce((s, n) => s + n, 0);

  const setQty = (optionId: string, itemId: string, qty: number) => {
    setSelections((prev) => {
      const next = { ...prev };
      const group = { ...(next[optionId] || {}) };
      if (qty <= 0) delete group[itemId];
      else group[itemId] = qty;
      next[optionId] = group;
      return next;
    });
  };

  const handleSingleSelect = (optionId: string, itemId: string) => {
    setSelections((prev) => ({ ...prev, [optionId]: { [itemId]: 1 } }));
  };

  const handleCheckboxToggle = (optionId: string, itemId: string, max: number) => {
    setSelections((prev) => {
      const group = { ...(prev[optionId] || {}) };
      if (group[itemId]) {
        delete group[itemId];
      } else {
        const total = Object.values(group).reduce((s, n) => s + n, 0);
        if (total >= max) return prev;
        group[itemId] = 1;
      }
      return { ...prev, [optionId]: group };
    });
  };

  const calculateTotal = () => {
    let total = Number(basePrice);
    product.delivery_product_options?.forEach((option) => {
      const group = selections[option.id] || {};
      Object.entries(group).forEach(([itemId, qty]) => {
        const item = option.delivery_product_option_items?.find((i) => i.id === itemId);
        if (item) total += Number(item.price_adjustment) * qty;
      });
    });
    return total * quantity;
  };

  const validationErrors = useMemo(() => {
    const errs: { optionId: string; message: string }[] = [];
    product.delivery_product_options?.forEach((option) => {
      const total = getOptionTotal(option.id);
      if (option.is_required && total === 0) {
        errs.push({ optionId: option.id, message: `${option.name} é obrigatório` });
      } else if (option.type === "multiple" && total < (option.min_selections || 0)) {
        errs.push({ optionId: option.id, message: `Selecione pelo menos ${option.min_selections}` });
      } else if (option.type === "multiple" && option.max_selections > 0 && total > option.max_selections) {
        errs.push({ optionId: option.id, message: `Máximo ${option.max_selections}` });
      }
    });
    return errs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, product.delivery_product_options]);

  const handleAddToCart = () => {
    if (validationErrors.length > 0) {
      validationErrors.forEach((e) => toast.error(e.message));
      return;
    }

    const cartOptions: CartItem["selectedOptions"] = [];
    product.delivery_product_options?.forEach((option) => {
      const group = selections[option.id] || {};
      Object.entries(group).forEach(([itemId, qty]) => {
        const item = option.delivery_product_option_items?.find((i) => i.id === itemId);
        if (item && qty > 0) {
          cartOptions.push({
            optionId: option.id,
            optionName: option.name,
            itemId: item.id,
            itemName: item.name,
            priceAdjustment: Number(item.price_adjustment),
            quantity: qty,
          });
        }
      });
    });

    onAddToCart({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: Number(basePrice),
      selectedOptions: cartOptions,
      notes: notes || undefined,
    });

    toast.success("Produto adicionado ao carrinho!");
    onOpenChange(false);

    setQuantity(1);
    setNotes("");
    setSelections({});
  };

  const isInvalid = validationErrors.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {product.image_url && (
            <div className="relative w-full h-64 rounded-lg overflow-hidden">
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
              {product.promotional_price && (
                <Badge className="absolute top-2 right-2">Promoção</Badge>
              )}
            </div>
          )}

          {product.description && (
            <p className="text-muted-foreground">{product.description}</p>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{product.preparation_time} min</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>Serve {product.serves} pessoa(s)</span>
            </div>
          </div>

          {product.delivery_product_options?.map((option) => {
            const total = getOptionTotal(option.id);
            const isMultiple = option.type === "multiple";
            const allowQty = isMultiple && !!option.allow_quantity;
            const max = option.max_selections || 0;
            const isComplete = isMultiple && max > 0 && total >= max;

            return (
              <div key={option.id} className="space-y-3 border rounded-lg p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Label className="text-base font-semibold">
                      {option.name}
                      {option.is_required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {!isMultiple
                        ? "Escolha 1 opção"
                        : `Escolha de ${option.min_selections} até ${option.max_selections} ${
                            option.max_selections === 1 ? "opção" : "opções"
                          }`}
                    </p>
                  </div>
                  {isMultiple && (
                    <div className="flex items-center gap-2 shrink-0">
                      {isComplete && (
                        <Badge variant="secondary" className="text-[10px]">Completo</Badge>
                      )}
                      <span className="text-xs font-medium text-muted-foreground tabular-nums">
                        {total}/{max || "∞"} selecionados
                      </span>
                    </div>
                  )}
                </div>

                {!isMultiple ? (
                  <RadioGroup
                    value={Object.keys(selections[option.id] || {})[0] || ""}
                    onValueChange={(v) => handleSingleSelect(option.id, v)}
                  >
                    {option.delivery_product_option_items
                      ?.filter((item) => item.is_available)
                      .map((item) => (
                        <div key={item.id} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value={item.id} id={item.id} />
                            <Label htmlFor={item.id} className="cursor-pointer">
                              {item.name}
                            </Label>
                          </div>
                          {item.price_adjustment !== 0 && (
                            <span className="text-sm text-muted-foreground">
                              +{formatBRL(Number(item.price_adjustment))}
                            </span>
                          )}
                        </div>
                      ))}
                  </RadioGroup>
                ) : allowQty ? (
                  <div className="space-y-2">
                    {option.delivery_product_option_items
                      ?.filter((item) => item.is_available)
                      .map((item) => {
                        const qty = getQty(option.id, item.id);
                        const sub = Number(item.price_adjustment) * qty;
                        const canIncrement = !(max > 0 && total >= max);
                        return (
                          <div key={item.id} className="flex items-center justify-between gap-3">
                            <span className="flex-1 text-sm">{item.name}</span>
                            <div className="flex items-center gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7"
                                disabled={qty === 0}
                                onClick={() => setQty(option.id, item.id, qty - 1)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-6 text-center text-sm font-medium tabular-nums">{qty}</span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7"
                                disabled={!canIncrement}
                                onClick={() => setQty(option.id, item.id, qty + 1)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                              {Number(item.price_adjustment) !== 0 && (
                                <span className="w-20 text-right text-sm text-muted-foreground tabular-nums">
                                  +{formatBRL(sub)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {option.delivery_product_option_items
                      ?.filter((item) => item.is_available)
                      .map((item) => {
                        const checked = !!selections[option.id]?.[item.id];
                        const disabled = !checked && isComplete;
                        return (
                          <div key={item.id} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={item.id}
                                checked={checked}
                                disabled={disabled}
                                onCheckedChange={() =>
                                  handleCheckboxToggle(option.id, item.id, max || 999)
                                }
                              />
                              <Label htmlFor={item.id} className="cursor-pointer">
                                {item.name}
                              </Label>
                            </div>
                            {item.price_adjustment !== 0 && (
                              <span className="text-sm text-muted-foreground">
                                +{formatBRL(Number(item.price_adjustment))}
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: sem cebola, ponto da carne, etc..."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="outline"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="text-lg font-semibold w-8 text-center">{quantity}</span>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <Button onClick={handleAddToCart} size="lg" disabled={isInvalid}>
              Adicionar • {formatBRL(calculateTotal())}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
