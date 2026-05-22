import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Clock,
  Copy,
  Edit,
  GripVertical,
  ImageIcon,
  MoreVertical,
  Settings2,
  Trash2,
  Users,
  FolderInput,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DeliveryProduct,
  useUpdateProduct,
} from "@/hooks/use-delivery-products";
import { DeliveryCategory } from "@/hooks/use-delivery-categories";
import { useProductOptions } from "@/hooks/use-product-options";
import { formatBRL } from "@/lib/format";
import { deferMenuAction } from "@/lib/ui/defer-menu-action";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: DeliveryProduct;
  categories: DeliveryCategory[];
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export const ProductCard = ({
  product,
  categories,
  onEdit,
  onDuplicate,
  onDelete,
}: ProductCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.id });
  const updateProduct = useUpdateProduct();
  const { data: options = [] } = useProductOptions(product.id);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const toggleAvailability = (checked: boolean) =>
    updateProduct.mutate({
      id: product.id,
      updates: { is_available: checked },
    });

  const handleMoveCategory = (categoryId: string) => {
    if (categoryId === product.category_id) return;
    updateProduct.mutate({
      id: product.id,
      updates: { category_id: categoryId },
    });
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-card-click]")) return;
    onEdit();
  };

  const otherCategories = categories.filter((c) => c.id !== product.category_id);
  const hasPromo = product.promotional_price != null;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      onClick={handleCardClick}
      className={cn(
        "group relative flex items-stretch gap-3 p-3 min-w-0 w-full cursor-pointer",
        "transition-all hover:border-primary/40 hover:shadow-sm",
        !product.is_available && "opacity-60"
      )}
    >
      <button
        type="button"
        data-no-card-click
        className="flex items-center px-1 -ml-1 cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground touch-none"
        aria-label="Arrastar para reordenar"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="relative h-20 w-20 shrink-0 rounded-md overflow-hidden bg-muted">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
        {!product.is_available && (
          <div className="absolute inset-0 bg-destructive/85 flex items-center justify-center">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-destructive-foreground text-center px-1">
              Indisponível
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-hidden">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-sm leading-tight">{product.name}</h3>
          {(product as any).source_pdv_product_id && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              PDV
            </Badge>
          )}
        </div>
        {product.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {product.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-auto pt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {product.preparation_time} min
          </span>
          {product.serves > 1 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {product.serves}
            </span>
          )}
          {options.length > 0 && (
            <span className="flex items-center gap-1">
              <Settings2 className="h-3 w-3" />
              {options.length} opç{options.length > 1 ? "ões" : "ão"}
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2 pt-1">
          {hasPromo ? (
            <>
              <span className="text-xs line-through text-muted-foreground">
                {formatBRL(Number(product.base_price))}
              </span>
              <span className="text-sm font-bold text-primary">
                {formatBRL(Number(product.promotional_price))}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                Promo
              </Badge>
            </>
          ) : (
            <span className="text-sm font-bold">
              {formatBRL(Number(product.base_price))}
            </span>
          )}
        </div>
      </div>

      <div
        data-no-card-click
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-end justify-between gap-2 shrink-0"
      >
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
            {otherCategories.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="mr-2 h-4 w-4" />
                  Mover para...
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel className="text-xs">
                    Selecione a categoria
                  </DropdownMenuLabel>
                  {otherCategories.map((cat) => (
                    <DropdownMenuItem
                      key={cat.id}
                      onClick={() => handleMoveCategory(cat.id)}
                    >
                      {cat.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
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

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            {product.is_available ? "Disponível" : "Indisp."}
          </span>
          <Switch
            checked={product.is_available}
            onCheckedChange={toggleAvailability}
            aria-label="Disponibilidade"
          />
        </div>
      </div>
    </Card>
  );
};
