import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ChevronDown,
  Edit,
  GripVertical,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DeliveryCategory,
  useUpdateCategory,
} from "@/hooks/use-delivery-categories";
import {
  DeliveryProduct,
  useReorderProducts,
} from "@/hooks/use-delivery-products";
import { ProductCard } from "./ProductCard";
import { EmptyState } from "./EmptyState";
import { deferMenuAction } from "@/lib/ui/defer-menu-action";

interface CategorySectionProps {
  category: DeliveryCategory;
  categories: DeliveryCategory[];
  products: DeliveryProduct[];
  open: boolean;
  onToggleOpen: () => void;
  onEditCategory: () => void;
  onDeleteCategory: () => void;
  onAddProduct: () => void;
  onEditProduct: (p: DeliveryProduct) => void;
  onDuplicateProduct: (p: DeliveryProduct) => void;
  onDeleteProduct: (p: DeliveryProduct) => void;
}

export const CategorySection = ({
  category,
  categories,
  products,
  open,
  onToggleOpen,
  onEditCategory,
  onDeleteCategory,
  onAddProduct,
  onEditProduct,
  onDuplicateProduct,
  onDeleteProduct,
}: CategorySectionProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id });
  const reorderProducts = useReorderProducts();
  const updateCategory = useUpdateCategory();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const productSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleProductDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = products.findIndex((p) => p.id === active.id);
    const newIndex = products.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(products, oldIndex, newIndex);
    reorderProducts.mutate(
      next.map((p, i) => ({ id: p.id, order_position: i + 1 }))
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border bg-card overflow-hidden"
    >
      <Accordion
        type="single"
        collapsible
        value={open ? category.id : ""}
        onValueChange={() => onToggleOpen()}
      >
        <AccordionItem value={category.id} className="border-0">
          <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30">
            <button
              type="button"
              className="p-1.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
              aria-label="Arrastar categoria"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>

            <AccordionTrigger className="flex-1 hover:no-underline py-2 [&>svg]:hidden">
              <div className="flex items-center gap-2 flex-1 text-left min-w-0">
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    open ? "rotate-0" : "-rotate-90"
                  }`}
                />
                <span className="text-base font-bold truncate">{category.name}</span>
                <Badge variant="secondary" className="shrink-0">
                  {products.length} {products.length === 1 ? "produto" : "produtos"}
                </Badge>
                {!category.is_active && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    Oculta
                  </Badge>
                )}
              </div>
            </AccordionTrigger>

            <div
              className="flex items-center gap-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="hidden sm:flex items-center gap-2 mr-2">
                <span className="text-xs text-muted-foreground">Visível</span>
                <Switch
                  checked={category.is_active}
                  onCheckedChange={(checked) =>
                    updateCategory.mutate({
                      id: category.id,
                      updates: { is_active: checked },
                    })
                  }
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={onAddProduct}
                className="hidden md:inline-flex"
              >
                <Plus className="h-4 w-4 mr-1" />
                Produto
              </Button>
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
          </div>

          <AccordionContent className="p-4">
            {products.length === 0 ? (
              <EmptyState
                compact
                title="Nenhum produto nesta categoria"
                description="Adicione o primeiro produto para começar."
                actionLabel="Adicionar produto"
                onAction={onAddProduct}
              />
            ) : (
              <DndContext
                sensors={productSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleProductDragEnd}
              >
                <SortableContext
                  items={products.map((p) => p.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 auto-rows-fr">
                    {products.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        categories={categories}
                        onEdit={() => onEditProduct(product)}
                        onDuplicate={() => onDuplicateProduct(product)}
                        onDelete={() => onDeleteProduct(product)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
