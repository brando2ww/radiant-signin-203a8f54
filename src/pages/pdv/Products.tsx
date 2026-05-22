import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Package, Grid3x3, List } from "lucide-react";
import { usePDVProducts, PDVProduct } from "@/hooks/use-pdv-products";
import { useSharedProductIds } from "@/hooks/use-share-to-delivery";
import { ProductCard } from "@/components/pdv/ProductCard";
import { ProductDialog } from "@/components/pdv/ProductDialog";
import { ProductFilters } from "@/components/pdv/ProductFilters";
import { ShareToDeliveryDialog } from "@/components/pdv/ShareToDeliveryDialog";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Toggle } from "@/components/ui/toggle";

export default function PDVProducts() {
  const {
    products,
    isLoading,
    createProduct,
    isCreating,
    updateProduct,
    isUpdating,
    deleteProduct,
    isDeleting,
    duplicateProduct,
  } = usePDVProducts();

  const { data: sharedIds = new Set<string>() } = useSharedProductIds();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [shareProduct, setShareProduct] = useState<PDVProduct | null>(null);

  // Filtros
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");

  // Categorias únicas
  const categories = useMemo(() => {
    const cats = new Set(
      products
        .map((p) => p.category)
        .filter((c): c is string => !!c && c.trim() !== "")
    );
    return Array.from(cats).sort();
  }, [products]);

  // Produtos filtrados
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        product.description?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" || product.category === categoryFilter;
      const matchesAvailability =
        availabilityFilter === "all" ||
        (availabilityFilter === "available" && product.is_available) ||
        (availabilityFilter === "unavailable" && !product.is_available);

      return matchesSearch && matchesCategory && matchesAvailability;
    });
  }, [products, search, categoryFilter, availabilityFilter]);

  const handleCreate = () => {
    setSelectedProduct(null);
    setDialogOpen(true);
  };

  const handleEdit = (product: any) => {
    setSelectedProduct(product);
    setDialogOpen(true);
  };

  const handleSubmit = (data: any) => {
    if (selectedProduct) {
      updateProduct(
        { id: selectedProduct.id, updates: data },
        {
          onSuccess: () => setDialogOpen(false),
        }
      );
    } else {
      createProduct(data, {
        onSuccess: (createdProduct) => {
          // Re-open in edit mode so Recipe tab is accessible
          setSelectedProduct(createdProduct);
        },
      });
    }
  };

  const handleDuplicate = (product: PDVProduct) => {
    duplicateProduct(product.id);
  };


  const handleDelete = () => {
    if (deleteDialog) {
      deleteProduct(deleteDialog, {
        onSuccess: () => setDeleteDialog(null),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Produtos</h1>
          <p className="text-muted-foreground">
            Gerencie seu cardápio e fichas técnicas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Toggle
            pressed={viewMode === "grid"}
            onPressedChange={() => setViewMode("grid")}
            aria-label="Visualização em grade"
            size="sm"
          >
            <Grid3x3 className="h-4 w-4" />
          </Toggle>
          <Toggle
            pressed={viewMode === "list"}
            onPressedChange={() => setViewMode("list")}
            aria-label="Visualização em lista"
            size="sm"
          >
            <List className="h-4 w-4" />
          </Toggle>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Produto
          </Button>
        </div>
      </div>

      <ProductFilters
        search={search}
        onSearchChange={setSearch}
        category={categoryFilter}
        onCategoryChange={setCategoryFilter}
        categories={categories}
        availability={availabilityFilter}
        onAvailabilityChange={setAvailabilityFilter}
        totalProducts={products.length}
        filteredCount={filteredProducts.length}
      />

      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="min-h-[400px] flex items-center justify-center">
            <div className="text-center space-y-4">
              <Package className="h-16 w-16 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-medium">
                  {products.length === 0
                    ? "Nenhum produto cadastrado"
                    : "Nenhum produto encontrado"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {products.length === 0
                    ? "Comece criando seu primeiro produto"
                    : "Tente ajustar os filtros de busca"}
                </p>
              </div>
              {products.length === 0 && (
                <Button onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Produto
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              : "space-y-4"
          }
        >
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteDialog(id)}
              onDuplicate={handleDuplicate}
              isSharedToDelivery={sharedIds.has(product.id)}
              onShareToDelivery={(p) => setShareProduct(p)}
            />
          ))}
        </div>
      )}

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={selectedProduct}
        onSubmit={handleSubmit}
        isSubmitting={isCreating || isUpdating}
      />

      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este produto? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareToDeliveryDialog
        open={!!shareProduct}
        onOpenChange={(open) => !open && setShareProduct(null)}
        product={shareProduct}
      />
    </div>
  );
}
