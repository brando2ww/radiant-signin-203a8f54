import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Loader2, Package } from "lucide-react";
import { usePDVProducts, PDVProduct } from "@/hooks/use-pdv-products";
import { useSharedProductIds, useShareToDelivery } from "@/hooks/use-share-to-delivery";
import { DeliveryCategory } from "@/hooks/use-delivery-categories";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AddPDVProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: DeliveryCategory[];
  preselectedCategoryId?: string;
}

export const AddPDVProductDialog = ({
  open,
  onOpenChange,
  categories,
  preselectedCategoryId,
}: AddPDVProductDialogProps) => {
  const { products = [], isLoading } = usePDVProducts() as any;
  const { data: sharedIds } = useSharedProductIds();
  const { mutate: share, isPending } = useShareToDelivery();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PDVProduct | null>(null);
  const [categoryId, setCategoryId] = useState(preselectedCategoryId || "");

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active),
    [categories]
  );

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products as PDVProduct[])
      .filter((p) => !sharedIds?.has(p.id))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true));
  }, [products, sharedIds, search]);

  const handleClose = (val: boolean) => {
    if (!val) {
      setSearch("");
      setSelected(null);
      setCategoryId(preselectedCategoryId || "");
    }
    onOpenChange(val);
  };

  const handleConfirm = () => {
    if (!selected || !categoryId) return;
    const price = selected.price_delivery ?? selected.price_salon ?? 0;
    share(
      { product: selected, categoryId, basePrice: price },
      { onSuccess: () => handleClose(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-[95vw] h-[80vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>Adicionar produto do PDV</DialogTitle>
          <DialogDescription>
            Escolha um produto cadastrado em Administração → Produtos para publicar no cardápio do delivery.
            Preço, opções e ficha técnica vêm do PDV.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-b shrink-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoria do delivery</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {activeCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full overflow-y-auto px-6 py-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Carregando...
              </div>
            ) : available.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                {search
                  ? "Nenhum produto encontrado."
                  : "Todos os produtos do PDV já foram adicionados ao delivery."}
              </div>
            ) : (
              <div className="space-y-2">
                {available.map((p) => {
                  const isSelected = selected?.id === p.id;
                  const price = p.price_delivery ?? p.price_salon ?? 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelected(p)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                        isSelected
                          ? "border-primary bg-muted"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <div className="h-12 w-12 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.category}
                        </p>
                      </div>
                      <div className="text-sm font-semibold shrink-0">
                        {formatBRL(price)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selected || !categoryId || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Adicionar ao cardápio"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
