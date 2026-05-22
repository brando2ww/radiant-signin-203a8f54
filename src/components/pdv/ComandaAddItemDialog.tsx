import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Minus, Loader2 } from "lucide-react";
import { usePDVProducts, PDVProduct } from "@/hooks/use-pdv-products";
import { usePDVProductOptionsForOrder } from "@/hooks/use-pdv-product-options";
import { ProductOptionSelector, SelectedOption } from "./ProductOptionSelector";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";

interface ComandaAddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItem: (data: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
    selectedOptions?: SelectedOption[];
  }) => Promise<void>;
  isLoading?: boolean;
}

type Step = "search" | "options" | "quantity";

export function ComandaAddItemDialog({
  open,
  onOpenChange,
  onAddItem,
  isLoading,
}: ComandaAddItemDialogProps) {
  const { products = [], isLoading: isLoadingProducts } = usePDVProducts();
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<PDVProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<Step>("search");
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);

  const { data: productOptions } = usePDVProductOptionsForOrder(selectedProduct?.id);

  const today = new Date().getDay();
  const filteredProducts = products.filter(
    (p) =>
      p.is_available &&
      (!(p as any).available_days?.length || (p as any).available_days.includes(today)) &&
      (p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase()))
  );

  const getProductPrice = (product: PDVProduct) => {
    return product.price_salon || product.price_balcao || product.price_delivery || 0;
  };

  const optionsExtra = selectedOptions.reduce(
    (total, opt) => total + opt.items.reduce((s, i) => s + i.priceAdjustment, 0),
    0
  );

  const handleSelectProduct = (product: PDVProduct) => {
    setSelectedProduct(product);
    setSelectedOptions([]);
    setQuantity(1);
    setNotes("");
    setStep("quantity");
  };

  const showOptions = step === "quantity" && productOptions && productOptions.length > 0 && selectedOptions.length === 0;
  const effectiveStep = showOptions ? "options" : step;

  const handleAddItem = async () => {
    if (!selectedProduct) return;

    const optionsNotes = selectedOptions
      .map((opt) => `${opt.optionName}: ${opt.items.map((i) => i.itemName).join(", ")}`)
      .join("; ");
    const fullNotes = [optionsNotes, notes.trim()].filter(Boolean).join(" | ");

    // Opções selecionadas (com produto vinculado) viram filhos para roteamento de cozinha


    await onAddItem({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity,
      unitPrice: getProductPrice(selectedProduct) + optionsExtra,
      notes: fullNotes || undefined,
      selectedOptions: selectedOptions.length > 0 ? selectedOptions : undefined,
    });

    // Reset and close
    setSelectedProduct(null);
    setQuantity(1);
    setNotes("");
    setSearch("");
    setStep("search");
    setSelectedOptions([]);
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedProduct(null);
    setQuantity(1);
    setNotes("");
    setSearch("");
    setStep("search");
    setSelectedOptions([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar Item</DialogTitle>
        </DialogHeader>

        {effectiveStep === "search" && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto..."
                className="pl-9"
                autoFocus
              />
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6">
              {isLoadingProducts ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  Nenhum produto encontrado
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleSelectProduct(product)}
                      className={cn(
                        "w-full p-3 text-left rounded-lg border transition-all",
                        "hover:bg-accent hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.category && (
                            <p className="text-sm text-muted-foreground">
                              {product.category}
                            </p>
                          )}
                        </div>
                        <span className="font-bold">
                          {formatBRL(getProductPrice(product))}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}

        {effectiveStep === "options" && selectedProduct && productOptions && (
          <>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-lg">{selectedProduct.name}</p>
                </div>
                <span className="font-bold text-lg">
                  {formatBRL(getProductPrice(selectedProduct))}
                </span>
              </div>
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
          </>
        )}

        {effectiveStep === "quantity" && step === "quantity" && selectedProduct && (selectedOptions.length > 0 || !productOptions?.length) && (
          <>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-lg">{selectedProduct.name}</p>
                  {selectedProduct.category && (
                    <p className="text-sm text-muted-foreground">
                      {selectedProduct.category}
                    </p>
                  )}
                </div>
                <span className="font-bold text-lg">
                  {formatBRL(getProductPrice(selectedProduct) + optionsExtra)}
                </span>
              </div>
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

            <div className="flex items-center justify-center gap-4 py-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="text-2xl font-bold w-12 text-center">
                {quantity}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações (opcional)..."
                rows={2}
              />
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span>{formatBRL((getProductPrice(selectedProduct) + optionsExtra) * quantity)}</span>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    if (productOptions && productOptions.length > 0) {
                      setSelectedOptions([]);
                      setStep("quantity");
                    } else {
                      setSelectedProduct(null);
                      setStep("search");
                    }
                  }}
                >
                  Voltar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleAddItem}
                  disabled={isLoading}
                >
                  {isLoading && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Adicionar
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
