import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Edit, Trash2, Eye, EyeOff, Star, Settings2, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeliveryProduct, useUpdateProduct, useDeleteProduct, useDuplicateProduct } from "@/hooks/use-delivery-products";
import { useProductOptions } from "@/hooks/use-product-options";
import { useState } from "react";
import { ProductDialog } from "./ProductDialog";
import { useDeliveryCategories } from "@/hooks/use-delivery-categories";
import { deferMenuAction } from "@/lib/ui/defer-menu-action";
import { formatBRL } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { imagemNoTamanho } from "@/lib/imagem";

interface ProductListProps {
  products: DeliveryProduct[];
  categoryId: string | null;
}

const ProductListItem = ({ product, onEdit, onDuplicate, onDelete }: { product: DeliveryProduct; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) => {
  const { data: options = [] } = useProductOptions(product.id);
  const updateProduct = useUpdateProduct();

  const handleToggleAvailability = () => {
    updateProduct.mutate({
      id: product.id,
      updates: { is_available: !product.is_available },
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 p-4">
        {product.image_url ? (
          <img
            src={imagemNoTamanho(product.image_url, 240)}
            loading="lazy"
            decoding="async"
            alt={product.name}
            className="h-24 w-24 rounded-md object-cover"
          />
        ) : (
          <div className="h-24 w-24 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
            Sem imagem
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{product.name}</h3>
              {product.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {product.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {product.is_featured && (
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => deferMenuAction(onEdit)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => deferMenuAction(onDuplicate)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleToggleAvailability}>
                    {product.is_available ? (
                      <EyeOff className="mr-2 h-4 w-4" />
                    ) : (
                      <Eye className="mr-2 h-4 w-4" />
                    )}
                    {product.is_available ? "Ocultar" : "Mostrar"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => deferMenuAction(onDelete)} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {product.promotional_price ? (
              <>
                <span className="text-sm line-through text-muted-foreground">
                  {formatBRL(Number(product.base_price))}
                </span>
                <span className="text-lg font-bold text-primary">
                  {formatBRL(Number(product.promotional_price))}
                </span>
              </>
            ) : (
              <span className="text-lg font-bold">
                {formatBRL(Number(product.base_price))}
              </span>
            )}
            {!product.is_available && (
              <Badge variant="outline">Indisponível</Badge>
            )}
            {(() => {
              const days = (product as any).available_days as number[] | undefined;
              if (days && days.length > 0 && !days.includes(new Date().getDay())) {
                return <Badge variant="outline">Indisponível hoje</Badge>;
              }
              return null;
            })()}
            <Badge variant="secondary" className="text-xs">
              {product.preparation_time} min
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Serve {product.serves}
            </Badge>
            {options.length > 0 && (
              <Badge variant="outline" className="text-xs gap-1">
                <Settings2 className="h-3 w-3" />
                {options.length} {options.length === 1 ? "opção" : "opções"}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export const ProductList = ({ products, categoryId }: ProductListProps) => {
  const [editingProduct, setEditingProduct] = useState<DeliveryProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<DeliveryProduct | null>(null);
  const { data: categories = [] } = useDeliveryCategories();
  const deleteProduct = useDeleteProduct();
  const duplicateProduct = useDuplicateProduct();

  const handleDuplicate = (product: DeliveryProduct) => {
    duplicateProduct.mutate(product.id);
  };

  const handleDelete = () => {
    if (deletingProduct) {
      deleteProduct.mutate(deletingProduct.id, {
        onSuccess: () => setDeletingProduct(null),
        onError: () => {
          toast.error("Erro ao excluir produto");
          setDeletingProduct(null);
        },
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Produtos</span>
            <Badge variant="secondary">{products.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {products.map((product) => (
            <ProductListItem
              key={product.id}
              product={product}
              onEdit={() => setEditingProduct(product)}
              onDuplicate={() => handleDuplicate(product)}
              onDelete={() => setDeletingProduct(product)}
            />
          ))}
          {products.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              {categoryId
                ? "Nenhum produto nesta categoria"
                : "Nenhum produto cadastrado"}
            </p>
          )}
        </CardContent>
      </Card>

      <ProductDialog
        open={!!editingProduct}
        onOpenChange={(open) => !open && setEditingProduct(null)}
        product={editingProduct || undefined}
        categories={categories}
      />

      <AlertDialog open={!!deletingProduct} onOpenChange={(open) => !open && setDeletingProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o produto "{deletingProduct?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
