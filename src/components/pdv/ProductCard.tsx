import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Copy, Edit, Layers, MoreVertical, Package, RefreshCw, Send, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PDVProduct } from "@/hooks/use-pdv-products";
import { usePDVRecipes } from "@/hooks/use-pdv-recipes";
import { useResyncDeliveryOptions } from "@/hooks/use-share-to-delivery";
import { CMVBadge } from "./CMVBadge";
import { deferMenuAction } from "@/lib/ui/defer-menu-action";
import { formatBRL } from "@/lib/format";

interface ProductCardProps {
  product: PDVProduct;
  onEdit: (product: PDVProduct) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (product: PDVProduct) => void;
  isSharedToDelivery?: boolean;
  onShareToDelivery?: (product: PDVProduct) => void;
}

export function ProductCard({ product, onEdit, onDelete, onDuplicate, isSharedToDelivery, onShareToDelivery }: ProductCardProps) {
  const { recipes, calculateCMV } = usePDVRecipes(product.id);
  const cmv = calculateCMV(recipes);
  const resyncDelivery = useResyncDeliveryOptions();

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative aspect-video bg-muted">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => deferMenuAction(() => onEdit(product))}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              {onDuplicate && (
                <DropdownMenuItem onClick={() => deferMenuAction(() => onDuplicate(product))}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicar
                </DropdownMenuItem>
              )}
              {!isSharedToDelivery && onShareToDelivery && (
                <DropdownMenuItem onClick={() => deferMenuAction(() => onShareToDelivery(product))}>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar para Delivery
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => deferMenuAction(() => onDelete(product.id))}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge variant={product.is_available ? "default" : "secondary"}>
            {product.is_available ? "Disponível" : "Indisponível"}
          </Badge>
          {(product as any)?.is_composite && (
            <Badge variant="outline" className="bg-background/80 gap-1">
              <Layers className="h-3 w-3" />
              Composto
            </Badge>
          )}
          {isSharedToDelivery && (
            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Delivery
            </Badge>
          )}
        </div>
      </div>
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-lg line-clamp-1">{product.name}</h3>
          </div>
          {product.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {product.description}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Badge variant="outline">{product.category}</Badge>
            {cmv > 0 && <CMVBadge cmv={cmv} price={product.price_salon} showMargin />}
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Salão:</span>
            <span className="font-bold text-lg">
              {formatBRL(product.price_salon)}
            </span>
          </div>
          {product.price_balcao && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Balcão:</span>
              <span className="text-sm font-medium">
                {formatBRL(product.price_balcao)}
              </span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => onEdit(product)}>
          <Edit className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
