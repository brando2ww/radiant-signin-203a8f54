import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Clock, Users } from "lucide-react";
import { PublicProduct } from "@/hooks/use-public-menu";
import { useState } from "react";
import { ProductDetailModal } from "./ProductDetailModal";
import { CartItem } from "@/pages/PublicMenu";
import { formatBRL } from "@/lib/format";

interface ProductCardProps {
  product: PublicProduct;
  onAddToCart: (item: CartItem) => void;
}

export const ProductCard = ({ product, onAddToCart }: ProductCardProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const hasOptions = product.delivery_product_options && product.delivery_product_options.length > 0;
  const price = product.promotional_price || product.base_price;

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
                    {formatBRL(Number(product.promotional_price))}
                  </p>
                  <p className="text-xs line-through text-muted-foreground">
                    {formatBRL(Number(product.base_price))}
                  </p>
                </div>
              ) : (
                <p className="text-base font-bold">
                  {formatBRL(Number(product.base_price))}
                </p>
              )}
            </div>
          </CardContent>

          <div className="relative shrink-0">
            {product.image_url ? (
              <div className="relative h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-md">
                <img
                  src={product.image_url}
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
