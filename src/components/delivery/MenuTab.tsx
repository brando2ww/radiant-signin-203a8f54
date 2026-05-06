import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
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
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { LayoutGrid } from "lucide-react";
import {
  useDeliveryCategories,
  useReorderCategories,
  DeliveryCategory,
} from "@/hooks/use-delivery-categories";
import {
  useDeliveryProducts,
  useReorderProducts,
  useDeleteProduct,
  useCreateProduct,
  DeliveryProduct,
} from "@/hooks/use-delivery-products";
import { CategoryDialog } from "./CategoryDialog";
import { DeleteCategoryDialog } from "./DeleteCategoryDialog";
import { SeedDemoButton } from "./SeedDemoButton";
import { MenuToolbar, type QuickFilter } from "./menu/MenuToolbar";
import { CategorySection } from "./menu/CategorySection";
import { EmptyState } from "./menu/EmptyState";
import { ProductDrawer } from "./menu/ProductDrawer";
import { AddPDVProductDialog } from "./menu/AddPDVProductDialog";
import { toast } from "sonner";

export const MenuTab = () => {
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);
  const [productPreselectedCategory, setProductPreselectedCategory] = useState<
    string | undefined
  >(undefined);
  const [editingCategory, setEditingCategory] = useState<DeliveryCategory | null>(
    null
  );
  const [deletingCategory, setDeletingCategory] = useState<DeliveryCategory | null>(
    null
  );
  const [editingProduct, setEditingProduct] = useState<DeliveryProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<DeliveryProduct | null>(
    null
  );
  const [createdProduct, setCreatedProduct] = useState<DeliveryProduct | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QuickFilter>("all");
  const [openCategoryIds, setOpenCategoryIds] = useState<Set<string>>(new Set());
  const initializedOpenRef = useRef(false);

  const { data: categories = [] } = useDeliveryCategories();
  const { data: allProducts = [] } = useDeliveryProducts();

  const reorderCategories = useReorderCategories();
  const createProduct = useCreateProduct();
  const deleteProduct = useDeleteProduct();

  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (a, b) => (a.order_position || 0) - (b.order_position || 0)
      ),
    [categories]
  );

  useEffect(() => {
    if (!initializedOpenRef.current && sortedCategories.length > 0) {
      setOpenCategoryIds(new Set(sortedCategories.map((c) => c.id)));
      initializedOpenRef.current = true;
    }
  }, [sortedCategories]);

  const productsByCategory = useMemo(() => {
    const map = new Map<string, DeliveryProduct[]>();
    for (const c of categories) map.set(c.id, []);
    for (const p of allProducts) {
      if (!map.has(p.category_id)) map.set(p.category_id, []);
      map.get(p.category_id)!.push(p);
    }
    // Sort each list and apply filters
    const q = search.trim().toLowerCase();
    for (const [k, list] of map) {
      let next = [...list].sort(
        (a, b) => (a.order_position || 0) - (b.order_position || 0)
      );
      if (filter === "available") next = next.filter((p) => p.is_available);
      else if (filter === "unavailable") next = next.filter((p) => !p.is_available);
      else if (filter === "promo")
        next = next.filter((p) => p.promotional_price != null);
      if (q) next = next.filter((p) => p.name.toLowerCase().includes(q));
      map.set(k, next);
    }
    return map;
  }, [allProducts, categories, search, filter]);

  const visibleCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedCategories.filter((c) => {
      const list = productsByCategory.get(c.id) || [];
      if (!q && filter === "all") return true;
      if (q && c.name.toLowerCase().includes(q)) return true;
      return list.length > 0;
    });
  }, [sortedCategories, productsByCategory, search, filter]);

  const categorySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleCategoryDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedCategories.findIndex((c) => c.id === active.id);
    const newIndex = sortedCategories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(sortedCategories, oldIndex, newIndex);
    reorderCategories.mutate(
      next.map((c, i) => ({ id: c.id, order_position: i + 1 }))
    );
  };

  const toggleCategoryOpen = (id: string) => {
    setOpenCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddProductToCategory = (categoryId: string) => {
    setProductPreselectedCategory(categoryId);
    setIsProductDrawerOpen(true);
  };

  const handleDuplicateProduct = (product: DeliveryProduct) => {
    const { id, user_id, created_at, updated_at, ...rest } = product as any;
    createProduct.mutate({
      ...rest,
      name: `${product.name} (cópia)`,
      order_position: 0,
    });
  };

  const confirmDeleteProduct = () => {
    if (!deletingProduct) return;
    deleteProduct.mutate(deletingProduct.id, {
      onSuccess: () => setDeletingProduct(null),
      onError: () => {
        toast.error("Erro ao excluir produto");
        setDeletingProduct(null);
      },
    });
  };

  const isSearchOrFilter = search.trim() !== "" || filter !== "all";

  return (
    <div className="space-y-0 -mt-4 sm:-mt-6">
      <MenuToolbar
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        onNewCategory={() => setIsCategoryDialogOpen(true)}
        onNewProduct={() => {
          setProductPreselectedCategory(undefined);
          setIsProductDrawerOpen(true);
        }}
      />

      <div className="pt-6 space-y-4">
        {sortedCategories.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              icon={LayoutGrid}
              title="Seu cardápio está vazio"
              description="Crie a primeira categoria para começar a montar seu cardápio de delivery."
              actionLabel="Criar primeira categoria"
              onAction={() => setIsCategoryDialogOpen(true)}
            />
            {allProducts.length === 0 && (
              <div className="flex justify-center">
                <SeedDemoButton />
              </div>
            )}
          </div>
        ) : (
          <DndContext
            sensors={categorySensors}
            collisionDetection={closestCenter}
            onDragEnd={handleCategoryDragEnd}
          >
            <SortableContext
              items={sortedCategories.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {visibleCategories.map((category) => (
                  <CategorySection
                    key={category.id}
                    category={category}
                    categories={categories}
                    products={productsByCategory.get(category.id) || []}
                    open={isSearchOrFilter || openCategoryIds.has(category.id)}
                    onToggleOpen={() => toggleCategoryOpen(category.id)}
                    onEditCategory={() => setEditingCategory(category)}
                    onDeleteCategory={() => setDeletingCategory(category)}
                    onAddProduct={() => handleAddProductToCategory(category.id)}
                    onEditProduct={setEditingProduct}
                    onDuplicateProduct={handleDuplicateProduct}
                    onDeleteProduct={setDeletingProduct}
                  />
                ))}
                {visibleCategories.length === 0 && (
                  <Card className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum resultado para os filtros aplicados
                  </Card>
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <CategoryDialog
        open={isCategoryDialogOpen}
        onOpenChange={setIsCategoryDialogOpen}
      />

      <CategoryDialog
        open={!!editingCategory}
        onOpenChange={(open) => !open && setEditingCategory(null)}
        category={editingCategory || undefined}
      />

      <DeleteCategoryDialog
        open={!!deletingCategory}
        onOpenChange={(open) => !open && setDeletingCategory(null)}
        category={deletingCategory || undefined}
      />

      <AddPDVProductDialog
        open={isProductDrawerOpen}
        onOpenChange={(open) => {
          setIsProductDrawerOpen(open);
          if (!open) setProductPreselectedCategory(undefined);
        }}
        categories={categories}
        preselectedCategoryId={productPreselectedCategory}
      />

      <ProductDrawer
        open={!!editingProduct}
        onOpenChange={(open) => !open && setEditingProduct(null)}
        product={editingProduct || undefined}
        categories={categories}
      />

      <ProductDrawer
        open={!!createdProduct}
        onOpenChange={(open) => !open && setCreatedProduct(null)}
        product={createdProduct || undefined}
        categories={categories}
      />

      <AlertDialog
        open={!!deletingProduct}
        onOpenChange={(open) => !open && setDeletingProduct(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o produto "{deletingProduct?.name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProduct}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
