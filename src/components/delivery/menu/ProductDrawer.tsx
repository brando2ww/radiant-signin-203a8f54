import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DeliveryProduct,
  useUpdateProduct,
} from "@/hooks/use-delivery-products";
import { DeliveryCategory } from "@/hooks/use-delivery-categories";
import { formatBRL } from "@/lib/format";
import { ExternalLink, Package } from "lucide-react";
import { Link } from "react-router-dom";

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

interface ProductDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: DeliveryProduct;
  categories: DeliveryCategory[];
}

export const ProductDrawer = ({
  open,
  onOpenChange,
  product,
  categories,
}: ProductDrawerProps) => {
  const [categoryId, setCategoryId] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [availableDays, setAvailableDays] = useState<number[]>([]);

  const updateProduct = useUpdateProduct();

  useEffect(() => {
    if (product) {
      setCategoryId(product.category_id);
      setIsAvailable(product.is_available);
      setIsFeatured(product.is_featured);
      setAvailableDays((product as any).available_days || []);
    }
  }, [product, open]);

  if (!product) return null;

  const sourceId = (product as any).source_pdv_product_id as string | null;
  const price = (product as any).promotional_price ?? product.base_price;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProduct.mutate(
      {
        id: product.id,
        updates: {
          category_id: categoryId,
          is_available: isAvailable,
          is_featured: isFeatured,
          available_days: availableDays,
        } as any,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const toggleDay = (day: number) => {
    setAvailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-6 py-4 border-b shrink-0 text-left">
          <SheetTitle>Organização no cardápio</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Preço, descrição, opções e ficha técnica são gerenciados em Administração → Produtos.
          </p>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-6">
            {/* Read-only PDV info */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-16 w-16 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{product.name}</h3>
                    {sourceId && (
                      <Badge variant="secondary" className="text-xs">
                        Vinculado ao PDV
                      </Badge>
                    )}
                  </div>
                  {product.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {product.description}
                    </p>
                  )}
                  <p className="text-sm font-medium mt-1">{formatBRL(price)}</p>
                </div>
              </div>
              {sourceId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  asChild
                >
                  <Link to={`/pdv/produtos?edit=${sourceId}`}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    Editar no PDV
                  </Link>
                </Button>
              )}
            </div>

            {/* Curation fields */}
            <div className="space-y-2">
              <Label>Categoria do delivery</Label>
              <Select value={categoryId} onValueChange={setCategoryId} required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Disponível no delivery</Label>
                  <p className="text-xs text-muted-foreground">
                    Controla se aparece para o cliente
                  </p>
                </div>
                <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Produto em destaque</Label>
                  <p className="text-xs text-muted-foreground">
                    Aparece no topo do cardápio
                  </p>
                </div>
                <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div>
                <Label>Disponível nos dias</Label>
                <p className="text-xs text-muted-foreground">
                  Deixe todos desmarcados para disponibilidade diária
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <label
                    key={day.value}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-sm transition-colors ${
                      availableDays.includes(day.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <Checkbox
                      checked={availableDays.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                      className="sr-only"
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t shrink-0 bg-background flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={updateProduct.isPending}>
              Salvar alterações
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};
