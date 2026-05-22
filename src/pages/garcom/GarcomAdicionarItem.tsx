import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Plus, Minus, ClipboardCheck } from "lucide-react";
import { usePDVProducts } from "@/hooks/use-pdv-products";
import { useDraftCart } from "@/contexts/DraftCartContext";
import { usePDVProductOptionsForOrder } from "@/hooks/use-pdv-product-options";
import { useCompositionGroups } from "@/hooks/use-pdv-composition-groups";
import type { SelectedOption } from "@/components/pdv/ProductOptionSelector";
import { MobileProductOptionSelector } from "@/components/garcom/MobileProductOptionSelector";
import { MobileCompositionGroupSelector } from "@/components/garcom/MobileCompositionGroupSelector";
import { ProductCategoryNav } from "@/components/garcom/ProductCategoryNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Step = "composition" | "options" | "quantity";

export default function GarcomAdicionarItem() {
  const { id: comandaId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { products, isLoading } = usePDVProducts();
  const draft = useDraftCart();

  const draftItems = comandaId ? draft.getItems(comandaId) : [];
  const draftTotal = comandaId ? draft.total(comandaId) : 0;
  const draftCount = comandaId ? draft.count(comandaId) : 0;

  const handleGoToReview = () => {
    if (!comandaId) return;
    navigate(`/garcom/comanda/${comandaId}`);
  };

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<typeof products extends (infer T)[] ? T : never | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<Step>("quantity");
  const [compositionSelections, setCompositionSelections] = useState<SelectedOption[]>([]);
  const [optionSelections, setOptionSelections] = useState<SelectedOption[]>([]);


  const { data: productOptions } = usePDVProductOptionsForOrder(selectedProduct?.id);
  const { groups: compositionGroups } = useCompositionGroups(selectedProduct?.id);

  const selectedOptions: SelectedOption[] = [...compositionSelections, ...optionSelections];

  const optionsExtra = selectedOptions.reduce(
    (total, opt) => total + opt.items.reduce((s, i) => s + i.priceAdjustment, 0),
    0,
  );

  const available = (products ?? []).filter((p) => p.is_available);
  const categories = [...new Set(available.map((p) => p.category))].sort();

  const filtered = available.filter((p) => {
    const matchCat = !selectedCategory || p.category === selectedCategory;
    const matchSearch =
      !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const resetSheet = () => {
    setSelectedProduct(null);
    setCompositionSelections([]);
    setOptionSelections([]);
    setStep("quantity");
    setQuantity(1);
    setNotes("");
  };

  const handleSelectProduct = (product: any) => {
    setSelectedProduct(product);
    setCompositionSelections([]);
    setOptionSelections([]);
    setQuantity(1);
    setNotes("");
    // Começa em "composition"; o effectiveStep abaixo pula etapas vazias.
    setStep("composition");
  };

  const hasComposition = (compositionGroups?.length ?? 0) > 0;
  const hasOptions = (productOptions?.length ?? 0) > 0;

  // Pula etapas que não se aplicam ao produto.
  const effectiveStep: Step = (() => {
    if (step === "composition" && !hasComposition) {
      return hasOptions ? "options" : "quantity";
    }
    if (step === "options" && !hasOptions) return "quantity";
    return step;
  })();

  const handleAdd = () => {
    if (!selectedProduct || !comandaId) return;

    const optionsNotes = selectedOptions
      .map((opt) => `${opt.optionName}: ${opt.items.map((i) => i.itemName).join(", ")}`)
      .join("; ");
    const fullNotes = [optionsNotes, notes.trim()].filter(Boolean).join(" | ");

    draft.addItem(comandaId, {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity,
      unitPrice: (selectedProduct.price_salon ?? 0) + optionsExtra,
      notes: fullNotes || undefined,
      selectedOptions,
    });
    toast.success("Adicionado ao rascunho");
    resetSheet();
  };


  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4 safe-area-top">
        <button onClick={() => navigate(-1)} className="active:scale-95 transition-transform">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">Adicionar Item</h1>
      </header>

      {/* Search */}
      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 rounded-xl"
          />
        </div>
      </div>

      {/* Categories */}
      <ProductCategoryNav
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {/* Product List */}
      <div className="flex-1 px-4 pb-48 space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground text-sm">
            Nenhum produto encontrado
          </p>
        ) : (
          filtered.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => handleSelectProduct(product)}
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left active:scale-[0.98] transition-transform"
            >
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-12 w-12 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-muted shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{product.name}</p>
                <p className="text-xs text-muted-foreground">{product.category}</p>
              </div>
              <span className="shrink-0 font-semibold text-sm tabular-nums">
                {formatBRL(product.price_salon)}
              </span>
            </button>
          ))
        )}
      </div>

      {/* Conferir Comanda Bar */}
      {draftItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background">
          <div className="px-4 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {draftCount} {draftCount === 1 ? "item no rascunho" : "itens no rascunho"}
              </span>
              <span className="font-semibold tabular-nums">{formatBRL(draftTotal)}</span>
            </div>
            <Button
              onClick={handleGoToReview}
              className="w-full h-11 active:scale-[0.98] transition-transform"
            >
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Conferir comanda ({draftCount})
            </Button>
          </div>
        </div>
      )}

      {/* Product Detail Sheet */}
      <Sheet
        open={!!selectedProduct}
        onOpenChange={(o) => {
          if (!o) resetSheet();
        }}
      >
        <SheetContent
          side="bottom"
          className="z-[60] rounded-t-2xl px-4 pb-0 max-h-[92vh] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="text-left truncate pr-8">
              {selectedProduct?.name}
            </SheetTitle>
          </SheetHeader>

          {/* Step: Options */}
          {effectiveStep === "options" && hasOptions && productOptions && (
            <div className="mt-4">
              <MobileProductOptionSelector
                options={productOptions}
                basePrice={selectedProduct?.price_salon ?? 0}
                onConfirm={(s) => {
                  setSelectedOptions(s);
                  setStep("quantity");
                }}
                onBack={() => resetSheet()}
              />
            </div>
          )}

          {/* Step: Quantity */}
          {effectiveStep === "quantity" && (
            <div className="mt-4 space-y-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
              {selectedOptions.length > 0 && (
                <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                  {selectedOptions.map((opt) => (
                    <p key={opt.optionId} className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {opt.optionName}:
                      </span>{" "}
                      {opt.items.map((i) => i.itemName).join(", ")}
                    </p>
                  ))}
                </div>
              )}

              {/* Quantity */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Quantidade</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border active:scale-95 transition-transform"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center font-bold tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border active:scale-95 transition-transform"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium">Observações</label>
                <Textarea
                  placeholder="Ex: sem cebola, ponto bem passado..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 rounded-xl resize-none"
                  rows={2}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {hasOptions && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-12"
                    onClick={() => {
                      setSelectedOptions([]);
                      setStep("options");
                    }}
                  >
                    Voltar
                  </Button>
                )}
                <Button
                  className="flex-1 h-12 text-base active:scale-[0.98] transition-transform"
                  onClick={handleAdd}
                >
                  Adicionar · {formatBRL(((selectedProduct?.price_salon ?? 0) + optionsExtra) * quantity)}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
