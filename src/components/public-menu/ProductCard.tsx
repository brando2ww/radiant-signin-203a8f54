import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Clock, Users } from "lucide-react";
import { PublicProduct } from "@/hooks/use-public-menu";
import { useState } from "react";
import { ProductDetailModal } from "./ProductDetailModal";
import { CartItem } from "@/pages/PublicMenu";
import { formatBRL } from "@/lib/format";
import { imagemNoTamanho } from "@/lib/imagem";

interface ProductCardProps {
  product: PublicProduct;
  onAddToCart: (item: CartItem) => void;
}

/**
 * Menor valor que o cliente paga: o preço do produto mais o item mais barato de cada opção obrigatória. Prato com o
 * preço no tamanho (ex.: Tamanho: Meio ou Inteira, produto a R$ 0) aparece "a partir de" em vez de R$ 0,00.
 */
function menorPreco(product: PublicProduct, base: number) {
  let minimo = base;
  let varia = false;
  for (const o of product.delivery_product_options ?? []) {
    if (!o.is_required && !(o.min_selections > 0)) continue;
    const precos = (o.delivery_product_option_items ?? [])
      .filter((i) => i.is_available !== false)
      .map((i) => Number(i.price_adjustment) || 0)
      .sort((a, b) => a - b);
    if (!precos.length) continue;
    minimo += precos.slice(0, Math.max(1, o.min_selections || 1)).reduce((a, b) => a + b, 0);
    if (precos[0] !== precos[precos.length - 1]) varia = true;
  }
  return { minimo, varia };
}

export const ProductCard = ({ product, onAddToCart }: ProductCardProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const hasOptions = product.delivery_product_options && product.delivery_product_options.length > 0;
  const price = product.promotional_price || product.base_price;
  const vitrine = menorPreco(product, Number(price));
  const vitrineBase = menorPreco(product, Number(product.base_price));

  const handleQuickAdd = () => {
    if (hasOptions) {
      setIsModalOpen(true);
    } else {
      onAddToCart({
        productId: product.id,
        name: product.name,
        quantity: 1,
        unitPrice: Number(price),
        selectedOptions: [],
      });
    }
  };

  return (
    <>
      <Card
        className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setIsModalOpen(true)}
      >
        <div className="flex gap-3 p-3">
          <CardContent className="flex-1 min-w-0 p-0 flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-sm sm:text-base line-clamp-1">
                {product.name}
              </h3>
              {product.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {product.description}
                </p>
              )}

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{product.preparation_time} min</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>Serve {product.serves}</span>
                </div>
              </div>
            </div>

            <div className="mt-2">
              {product.promotional_price ? (
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-base font-bold text-primary">
                    {vitrine.varia ? "a partir de " : ""}
                    {formatBRL(vitrine.minimo)}
                  </p>
                  <p className="text-xs line-through text-muted-foreground">
                    {formatBRL(vitrineBase.minimo)}
                  </p>
                </div>
              ) : (
                <p className="text-base font-bold">
                  {vitrine.varia && <span className="text-xs font-normal text-muted-foreground">a partir de </span>}
                  {formatBRL(vitrine.minimo)}
                </p>
              )}
            </div>
          </CardContent>

          <div className="relative shrink-0">
            {product.image_url ? (
              <div className="relative h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-md">
                <img
                  src={imagemNoTamanho(product.image_url, 256)}
                  loading="lazy"
                  decoding="async"
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
                {product.promotional_price && (
                  <Badge className="absolute top-1 left-1 text-[10px] px-1 py-0 bg-red-500">
                    -
                    {Math.round(
                      ((Number(product.base_price) - Number(product.promotional_price)) /
                        Number(product.base_price)) *
                        100,
                    )}
                    %
                  </Badge>
                )}
              </div>
            ) : (
              <div className="h-24 w-24 sm:h-28 sm:w-28 bg-muted rounded-md flex items-center justify-center">
                <span className="text-muted-foreground text-[10px]">Sem imagem</span>
              </div>
            )}
            <Button
              size="icon"
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full shadow"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickAdd();
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      <ProductDetailModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        product={product}
        onAddToCart={onAddToCart}
      />
    </>
  );
};
