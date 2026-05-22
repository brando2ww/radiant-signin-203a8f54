import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Minus } from "lucide-react";
import { usePDVProducts } from "@/hooks/use-pdv-products";
import { usePDVProductOptionsForOrder } from "@/hooks/use-pdv-product-options";
import { ProductOptionSelector, SelectedOption } from "./ProductOptionSelector";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBRL } from "@/lib/format";

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onAddItem: (item: any) => void;
  source?: string;
}

type Step = "search" | "options" | "quantity";

export function AddItemDialog({
  open,
  onOpenChange,
  orderId,
  onAddItem,
  source = "salon",
}: AddItemDialogProps) {
  const { products } = usePDVProducts();
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<Step>("search");
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);

  const { data: productOptions } = usePDVProductOptionsForOrder(selectedProduct?.id);

  const getPrice = (product: any) => {
    if (source === "balcao") return product.price_balcao ?? product.price_salon;
    if (source === "delivery") return product.price_delivery ?? product.price_salon;
    return product.price_salon;
  };

  const filteredProducts = useMemo(() => {
    const today = new Date().getDay();
    return products.filter(
      (p) =>
        p.is_available &&
        (!(p as any).available_days?.length || (p as any).available_days.includes(today)) &&
        (p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.category.toLowerCase().includes(search.toLowerCase()))
    );
  }, [products, search]);

  const optionsExtra = selectedOptions.reduce(
    (total, opt) => total + opt.items.reduce((s, i) => s + i.priceAdjustment, 0),
    0
  );

  const handleSelectProduct = (product: any) => {
    setSelectedProduct(product);
    setSelectedOptions([]);
    setQuantity(1);
    setNotes("");
    // Check if product has options - we'll know after the query loads
    // For now go to quantity, we'll redirect if needed
    setStep("quantity");
  };

  // If product has options and we're at quantity step but haven't selected options yet, show options
  const showOptions = step === "quantity" && productOptions && productOptions.length > 0 && selectedOptions.length === 0;
  const effectiveStep = showOptions ? "options" : step;

  const handleAddItem = () => {
    if (!selectedProduct) return;

    const optionsNotes = selectedOptions
      .map((opt) => `${opt.optionName}: ${opt.items.map((i) => i.itemName).join(", ")}`)
      .join("; ");

    const fullNotes = [optionsNotes, notes.trim()].filter(Boolean).join(" | ");

    onAddItem({
      order_id: orderId,
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      quantity,
      unit_price: getPrice(selectedProduct) + optionsExtra,
      notes: fullNotes || undefined,
      selectedOptions: selectedOptions.length > 0 ? selectedOptions : undefined,
    });

    // Reset
    setSelectedProduct(null);
    setQuantity(1);
    setNotes("");
    setSearch("");
    setStep("search");
    setSelectedOptions([]);
  };

  const handleBack = () => {
    if (effectiveStep === "options") {
      setSelectedProduct(null);
      setStep("search");
    } else if (step === "quantity") {
      if (productOptions && productOptions.length > 0) {
        setSelectedOptions([]);
        setStep("quantity"); // Will show options
      } else {
        setSelectedProduct(null);
        setStep("search");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Adicionar Item ao Pedido</DialogTitle>
          <DialogDescription>
            Selecione o produto e a quantidade
          </DialogDescription>
        </DialogHeader>

        {effectiveStep === "search" && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produtos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <ScrollArea className="h-[400px]">
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleSelectProduct(product)}
                    className="text-left p-3 rounded-lg border hover:border-primary transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{product.name}</p>
                      <Badge variant="outline">{product.category}</Badge>
                      <p className="text-lg font-bold">
                        {formatBRL(getPrice(product))}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {effectiveStep === "options" && selectedProduct && productOptions && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border bg-muted/50">
              <p className="font-semibold text-lg">{selectedProduct.name}</p>
              <p className="text-lg font-bold mt-1">
                {formatBRL(getPrice(selectedProduct))}
              </p>
            </div>
            <ProductOptionSelector
              options={productOptions}
              onConfirm={(selections) => {
                setSelectedOptions(selections);
                setStep("quantity");
              }}
              onBack={() => {
                setSelectedProduct(null);
                setStep("search");
              }}
            />
          </div>
        )}

        {effectiveStep === "quantity" && step === "quantity" && selectedProduct && (selectedOptions.length > 0 || !productOptions?.length) && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border bg-muted/50">
              <p className="font-semibold text-lg">{selectedProduct.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedProduct.category}
              </p>
              <p className="text-lg font-bold mt-2">
                {formatBRL(getPrice(selectedProduct) + optionsExtra)}
              </p>
              {selectedOptions.length > 0 && (
                <div className="mt-2 text-sm text-muted-foreground">
                  {selectedOptions.map((opt) => (
                    <p key={opt.optionId}>
                      {opt.optionName}: {opt.items.map((i) => i.itemName).join(", ")}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Quantidade
              </label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, Number(e.target.value)))
                  }
                  className="w-20 text-center"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Observações (opcional)
              </label>
              <Textarea
                placeholder="Ex: Sem cebola, ponto da carne..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center justify-between">
                <span className="font-medium">Subtotal</span>
                <span className="text-xl font-bold">
                  {formatBRL((getPrice(selectedProduct) + optionsExtra) * quantity)}
                </span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {selectedProduct && (
            <Button variant="outline" onClick={handleBack}>
              Voltar
            </Button>
          )}
          {effectiveStep === "quantity" && step === "quantity" && (
            <Button onClick={handleAddItem} disabled={!selectedProduct}>
              Adicionar ao Pedido
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
