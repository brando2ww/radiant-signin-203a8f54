import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Plus,
  Search,
  GripVertical,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Star,
  StarOff,
  ChevronUp,
  ChevronDown,
  Settings2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryDialog } from "./CategoryDialog";
import { ProductDialog } from "./ProductDialog";
import { DeleteCategoryDialog } from "./DeleteCategoryDialog";
import { SeedDemoButton } from "./SeedDemoButton";
import {
  useDeliveryCategories,
  useReorderCategories,
  DeliveryCategory,
} from "@/hooks/use-delivery-categories";
import {
  useDeliveryProducts,
  useReorderProducts,
  useUpdateProduct,
  useDeleteProduct,
  useCreateProduct,
  DeliveryProduct,
} from "@/hooks/use-delivery-products";
import { useProductOptions } from "@/hooks/use-product-options";
import { formatBRL } from "@/lib/format";
import { deferMenuAction } from "@/lib/ui/defer-menu-action";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ---------- Sortable product card ----------
const SortableProductCard = ({
  product,
  onEdit,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  product: DeliveryProduct;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.id });
  const updateProduct = useUpdateProduct();
  const { data: options = [] } = useProductOptions(product.id);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const toggleAvailability = () =>
    updateProduct.mutate({
      id: product.id,
      updates: { is_available: !product.is_available },
    });

  const toggleFeatured = () =>
    updateProduct.mutate({
      id: product.id,
      updates: { is_featured: !product.is_featured },
    });

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "overflow-hidden transition-shadow h-full flex flex-col",
        product.is_featured && "ring-1 ring-primary/40"
      )}
    >
      <div className="flex gap-3 p-3 flex-1 min-w-0">
        <button
          type="button"
          className="flex items-center px-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          aria-label="Arrastar para reordenar"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-20 w-20 rounded-md object-cover shrink-0"
          />
        ) : (
          <div className="h-20 w-20 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0">
            Sem imagem
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">{product.name}</h3>
                {product.is_featured && (
                  <Star className="h-4 w-4 fill-primary text-primary shrink-0" />
                )}
              </div>
              {product.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {product.description}
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
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
                <DropdownMenuItem onClick={toggleFeatured}>
                  {product.is_featured ? (
                    <>
                      <StarOff className="mr-2 h-4 w-4" />
                      Remover destaque
                    </>
                  ) : (
                    <>
                      <Star className="mr-2 h-4 w-4" />
                      Destacar
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleAvailability}>
                  {product.is_available ? (
                    <>
                      <EyeOff className="mr-2 h-4 w-4" />
                      Ocultar
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      Mostrar
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onMoveUp} disabled={!canMoveUp}>
                  <ChevronUp className="mr-2 h-4 w-4" />
                  Mover para cima
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMoveDown} disabled={!canMoveDown}>
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Mover para baixo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => deferMenuAction(onDelete)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {product.promotional_price ? (
              <>
                <span className="text-xs line-through text-muted-foreground">
                  {formatBRL(Number(product.base_price))}
                </span>
                <span className="text-base font-bold text-primary">
                  {formatBRL(Number(product.promotional_price))}
                </span>
              </>
            ) : (
              <span className="text-base font-bold">
                {formatBRL(Number(product.base_price))}
              </span>
            )}
            {!product.is_available && <Badge variant="outline">Indisponível</Badge>}
            <Badge variant="secondary" className="text-xs">
              {product.preparation_time} min
            </Badge>
            {options.length > 0 && (
              <Badge variant="outline" className="text-xs gap-1">
                <Settings2 className="h-3 w-3" />
                {options.length}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

// ---------- Sortable category section ----------
const SortableCategorySection = ({
  category,
  products,
  search,
  onEditCategory,
  onDeleteCategory,
  onAddProduct,
  onEditProduct,
  onDuplicateProduct,
  onDeleteProduct,
}: {
  category: DeliveryCategory;
  products: DeliveryProduct[];
  search: string;
  onEditCategory: () => void;
  onDeleteCategory: () => void;
  onAddProduct: () => void;
  onEditProduct: (p: DeliveryProduct) => void;
  onDuplicateProduct: (p: DeliveryProduct) => void;
  onDeleteProduct: (p: DeliveryProduct) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id });
  const reorderProducts = useReorderProducts();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...products].sort(
      (a, b) => (a.order_position || 0) - (b.order_position || 0)
    );
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const productSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleProductDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = filteredProducts.findIndex((p) => p.id === active.id);
    const newIndex = filteredProducts.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(filteredProducts, oldIndex, newIndex);
    reorderProducts.mutate(
      next.map((p, i) => ({ id: p.id, order_position: i + 1 }))
    );
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= filteredProducts.length) return;
    const next = arrayMove(filteredProducts, index, target);
    reorderProducts.mutate(
      next.map((p, i) => ({ id: p.id, order_position: i + 1 }))
    );
  };

  return (
    <AccordionItem
      ref={setNodeRef}
      style={style}
      value={category.id}
      id={`category-${category.id}`}
      className="border rounded-lg bg-card overflow-hidden scroll-mt-20"
    >
      <div className="flex items-center gap-1 px-2 sticky top-14 z-10 bg-card border-b">
        <button
          type="button"
          className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          aria-label="Arrastar categoria"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <AccordionTrigger className="flex-1 hover:no-underline py-4">
          <div className="flex items-center gap-2 flex-1 text-left">
            <span className="text-lg font-semibold">{category.name}</span>
            <Badge variant="secondary">{products.length}</Badge>
            {!category.is_active && (
              <Badge variant="outline" className="text-xs">
                Inativa
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => deferMenuAction(onAddProduct)}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar produto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => deferMenuAction(onEditCategory)}>
              <Edit className="mr-2 h-4 w-4" />
              Editar categoria
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => deferMenuAction(onDeleteCategory)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir categoria
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AccordionContent className="px-3 pb-3">
        {filteredProducts.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">
            {search
              ? "Nenhum produto encontrado nesta categoria"
              : "Nenhum produto nesta categoria"}
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={onAddProduct}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar produto
              </Button>
            </div>
          </div>
        ) : (
          <DndContext
            sensors={productSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleProductDragEnd}
          >
            <SortableContext
              items={filteredProducts.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredProducts.map((product, index) => (
                  <SortableProductCard
                    key={product.id}
                    product={product}
                    onEdit={() => onEditProduct(product)}
                    onDuplicate={() => onDuplicateProduct(product)}
                    onDelete={() => onDeleteProduct(product)}
                    onMoveUp={() => handleMove(index, -1)}
                    onMoveDown={() => handleMove(index, 1)}
                    canMoveUp={index > 0}
                    canMoveDown={index < filteredProducts.length - 1}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

// ---------- Main MenuTab ----------
export const MenuTab = () => {
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [productPreselectedCategory, setProductPreselectedCategory] =
    useState<string | undefined>(undefined);
  const [editingCategory, setEditingCategory] = useState<DeliveryCategory | null>(
    null
  );
  const [deletingCategory, setDeletingCategory] = useState<DeliveryCategory | null>(
    null
  );
  const [editingProduct, setEditingProduct] = useState<DeliveryProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<DeliveryProduct | null>(null);
  const [createdProduct, setCreatedProduct] = useState<DeliveryProduct | null>(null);
  const [search, setSearch] = useState("");
  const [openCategoryIds, setOpenCategoryIds] = useState<string[]>([]);
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

  // Open all categories by default on first load
  useEffect(() => {
    if (!initializedOpenRef.current && sortedCategories.length > 0) {
      setOpenCategoryIds(sortedCategories.map((c) => c.id));
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
    return map;
  }, [allProducts, categories]);

  // Auto-open all categories that match search; otherwise let user toggle
  const visibleCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      const list = productsByCategory.get(c.id) || [];
      return list.some((p) => p.name.toLowerCase().includes(q));
    });
  }, [sortedCategories, productsByCategory, search]);

  const accordionValue = search.trim()
    ? visibleCategories.map((c) => c.id)
    : openCategoryIds;

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

  const handleAddProductToCategory = (categoryId: string) => {
    setProductPreselectedCategory(categoryId);
    setIsProductDialogOpen(true);
  };

  const handleProductCreated = (product: DeliveryProduct) => {
    setIsProductDialogOpen(false);
    setProductPreselectedCategory(undefined);
    setCreatedProduct(product);
  };

  const handleDuplicateProduct = (product: DeliveryProduct) => {
    const { id, user_id, created_at, updated_at, ...rest } = product;
    createProduct.mutate({
      ...rest,
      name: `${product.name} (cópia)`,
      order_position: 0, // hook will auto-assign max+1
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold">Gerenciar Cardápio</h2>
          <p className="text-sm text-muted-foreground">
            Arraste para reordenar categorias e produtos
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {allProducts.length === 0 && categories.length === 0 && <SeedDemoButton />}
          <Button onClick={() => setIsCategoryDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova Categoria
          </Button>
          <Button
            onClick={() => {
              setProductPreselectedCategory(undefined);
              setIsProductDialogOpen(true);
            }}
            size="sm"
            variant="secondary"
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Produto
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar categoria ou produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {sortedCategories.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          Nenhuma categoria cadastrada. Crie a primeira categoria para começar a
          montar seu cardápio.
        </Card>
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
            <Accordion
              type="multiple"
              value={accordionValue}
              onValueChange={setOpenCategoryIds}
              className="space-y-6"
            >
              {visibleCategories.map((category) => (
                <SortableCategorySection
                  key={category.id}
                  category={category}
                  products={productsByCategory.get(category.id) || []}
                  search={search}
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
                  Nenhum resultado para "{search}"
                </Card>
              )}
            </Accordion>
          </SortableContext>
        </DndContext>
      )}

      {/* Dialogs */}
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

      <ProductDialog
        open={isProductDialogOpen}
        onOpenChange={(open) => {
          setIsProductDialogOpen(open);
          if (!open) setProductPreselectedCategory(undefined);
        }}
        categories={categories}
        preselectedCategoryId={productPreselectedCategory}
        onProductCreated={handleProductCreated}
      />

      <ProductDialog
        open={!!editingProduct}
        onOpenChange={(open) => !open && setEditingProduct(null)}
        product={editingProduct || undefined}
        categories={categories}
      />

      {/* Re-open in edit mode after creation */}
      <ProductDialog
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
