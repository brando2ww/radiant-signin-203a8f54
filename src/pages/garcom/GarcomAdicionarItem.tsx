import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Plus, Minus, ClipboardCheck, Flame, ChevronRight } from "lucide-react";
import { usePDVProducts } from "@/hooks/use-pdv-products";
import { useDraftCart } from "@/contexts/DraftCartContext";
import { usePDVProductOptionsForOrder } from "@/hooks/use-pdv-product-options";
import { useCompositionGroups } from "@/hooks/use-pdv-composition-groups";
import type { SelectedOption } from "@/components/pdv/ProductOptionSelector";
import { MobileProductOptionSelector } from "@/components/garcom/MobileProductOptionSelector";
import { MobileCompositionGroupSelector } from "@/components/garcom/MobileCompositionGroupSelector";
import { ProductCategoryNav } from "@/components/garcom/ProductCategoryNav";
import {
  casaBusca, normalizar, ordenarDestaques, useWaiterMenuItems, useWaiterMenuSettings,
  useWaiterTopProducts,
} from "@/hooks/use-waiter-menu";
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

/** Linha do produto. Mesma aparência nos destaques e na busca. */
function ProdutoLinha({ product, onSelect }: { product: any; onSelect: (p: any) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left active:scale-[0.98] transition-transform"
    >
      {product.image_url ? (
        <img src={product.image_url} alt={product.name} className="h-12 w-12 rounded-lg object-cover shrink-0" />
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
  );
}

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

  // ── A lista que o garçom vê ──────────────────────────────────────────────
  //
  // O catálogo cru não serve em pé na frente da mesa: no Kōten são 358 produtos
  // ativos e buscar "salm" devolvia 46 linhas em ordem alfabética, começando
  // pelo número do nome ("04 Joe Salmão"). Três coisas mudam isso: o que o dono
  // escondeu sai, os mais pedidos sobem, e a busca passa a ordenar por
  // popularidade em vez de alfabeto.
  const { settings } = useWaiterMenuSettings();
  const { itens: preferencias } = useWaiterMenuItems();
  const { data: maisPedidos = [] } = useWaiterTopProducts(
    settings?.destaque_janela_dias ?? 30,
    settings?.destaque_quantidade ?? 20,
  );

  const prefPorProduto = useMemo(
    () => new Map(preferencias.map((p) => [p.product_id, p])),
    [preferencias],
  );

  /** Posição no ranking: quanto menor, mais sai. Quem não vendeu fica no fim. */
  const postoNoRanking = useMemo(() => {
    const mapa = new Map<string, number>();
    maisPedidos.forEach((p, i) => mapa.set(p.product_id, i));
    return mapa;
  }, [maisPedidos]);

  const available = useMemo(() => {
    const ocultas = new Set(settings?.categorias_ocultas ?? []);
    return (products ?? []).filter((p) => {
      if (!p.is_available) return false;
      if (ocultas.has(p.category)) return false;
      const pref = prefPorProduto.get(p.id);
      if (pref?.oculto) return false;
      // Variação pendurada num principal não polui a lista: ela aparece dentro
      // do produto pai, na hora de escolher.
      if (pref?.pai_product_id) return false;
      return true;
    });
  }, [products, settings, prefPorProduto]);

  const categories = useMemo(() => {
    const presentes = [...new Set(available.map((p) => p.category))];
    const ordem = settings?.categorias_ordem ?? [];
    // O que o dono ordenou vem primeiro, na ordem dele; o resto segue em ordem
    // alfabética, para categoria nova não sumir no fim sem ninguém notar.
    const ordenadas = ordem.filter((c) => presentes.includes(c));
    const sobra = presentes.filter((c) => !ordenadas.includes(c)).sort();
    return [...ordenadas, ...sobra];
  }, [available, settings]);

  const destaques = useMemo(() => {
    const modo = settings?.destaque_modo ?? "misto";
    const fixados = available.filter((p) => prefPorProduto.get(p.id)?.fixado);
    const doHistorico = maisPedidos
      .map((t) => available.find((p) => p.id === t.product_id))
      .filter(Boolean) as typeof available;

    const base =
      modo === "manual" ? fixados
      : modo === "historico" ? doHistorico
      // Misto: o que o dono fixou abre a lista, o histórico completa sem repetir.
      : [...fixados, ...doHistorico.filter((p) => !fixados.some((f) => f.id === p.id))];

    // A ordem arrastada no painel manda: o que a tela do dono mostra na prévia
    // é o que o garçom vê aqui, senão a prévia seria uma promessa falsa.
    return ordenarDestaques(base, prefPorProduto as any, postoNoRanking);
  }, [available, maisPedidos, prefPorProduto, settings, postoNoRanking]);

  const buscando = search.trim().length > 0;

  const filtered = useMemo(() => {
    const lista = available.filter((p) => {
      const matchCat = !selectedCategory || p.category === selectedCategory;
      return matchCat && (!buscando || casaBusca(p.name, search));
    });

    // Resultado ordenado pelo que mais sai, e não pelo alfabeto. É o que faz
    // "sashimi de salmão" aparecer antes de "02 Niguiri Salmão Flambado".
    return lista.sort((a, b) => {
      const pa = postoNoRanking.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const pb = postoNoRanking.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return normalizar(a.name).localeCompare(normalizar(b.name));
    });
  }, [available, selectedCategory, search, buscando, postoNoRanking]);

  /** Sem busca e sem categoria escolhida, a tela abre pelos destaques. */
  const mostrandoDestaques = !buscando && !selectedCategory && destaques.length > 0;

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

    // Não duplicar como OBS as opções que já viram filhos de composição
    // (com produto vinculado). Apenas extras/modificadores sem produto
    // vinculado continuam como observação no pai.
    const optionsNotes = selectedOptions
      .map((opt) => {
        const visibleItems = opt.items.filter((i) => !i.linkedProductId);
        if (visibleItems.length === 0) return "";
        return `${opt.optionName}: ${visibleItems.map((i) => i.itemName).join(", ")}`;
      })
      .filter(Boolean)
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
        ) : mostrandoDestaques ? (
          <>
            <div className="flex items-center gap-2 pt-1 pb-0.5">
              <Flame className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mais pedidos
              </p>
            </div>
            {destaques.map((product) => (
              <ProdutoLinha key={product.id} product={product} onSelect={handleSelectProduct} />
            ))}
            <button
              type="button"
              onClick={() => setSelectedCategory(categories[0] ?? "")}
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-dashed p-3 text-sm text-muted-foreground active:scale-[0.98] transition-transform"
            >
              Ver o cardápio inteiro
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground text-sm">
            Nenhum produto encontrado
          </p>
        ) : (
          filtered.map((product) => (
            <ProdutoLinha key={product.id} product={product} onSelect={handleSelectProduct} />
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

          {/* Step: Composition (escolha de itens da composição) */}
          {effectiveStep === "composition" && hasComposition && compositionGroups && (
            <div className="mt-4">
              <MobileCompositionGroupSelector
                groups={compositionGroups}
                basePrice={selectedProduct?.price_salon ?? 0}
                onConfirm={(s) => {
                  setCompositionSelections(s);
                  setStep(hasOptions ? "options" : "quantity");
                }}
                onBack={() => resetSheet()}
              />
            </div>
          )}

          {/* Step: Options */}
          {effectiveStep === "options" && hasOptions && productOptions && (
            <div className="mt-4">
              <MobileProductOptionSelector
                options={productOptions}
                basePrice={selectedProduct?.price_salon ?? 0}
                onConfirm={(s) => {
                  setOptionSelections(s);
                  setStep("quantity");
                }}
                onBack={() => {
                  if (hasComposition) {
                    setOptionSelections([]);
                    setStep("composition");
                  } else {
                    resetSheet();
                  }
                }}
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
                {(hasOptions || hasComposition) && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-12"
                    onClick={() => {
                      if (hasOptions) {
                        setOptionSelections([]);
                        setStep("options");
                      } else {
                        setCompositionSelections([]);
                        setStep("composition");
                      }
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
