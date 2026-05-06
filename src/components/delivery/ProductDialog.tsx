import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUpload } from "@/components/ui/image-upload";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { DeliveryProduct, useCreateProduct, useUpdateProduct } from "@/hooks/use-delivery-products";
import { DeliveryCategory } from "@/hooks/use-delivery-categories";
import { useProductImageUpload } from "@/hooks/use-product-image-upload";
import { ProductOptionsManager } from "./ProductOptionsManager";
import { DeliveryRecipeManager } from "./DeliveryRecipeManager";
import { CurrencyInput } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { Info } from "lucide-react";

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: DeliveryProduct;
  categories: DeliveryCategory[];
  onProductCreated?: (product: DeliveryProduct) => void;
  preselectedCategoryId?: string;
}

export const ProductDialog = ({
  open,
  onOpenChange,
  product,
  categories,
  onProductCreated,
  preselectedCategoryId,
}: ProductDialogProps) => {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [promotionalPrice, setPromotionalPrice] = useState("");
  const [preparationTime, setPreparationTime] = useState("30");
  const [serves, setServes] = useState("1");
  const [isAvailable, setIsAvailable] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [availableDays, setAvailableDays] = useState<number[]>([]);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const { uploadImage, deleteImage, isUploading } = useProductImageUpload();

  useEffect(() => {
    if (product) {
      setCategoryId(product.category_id);
      setName(product.name);
      setDescription(product.description || "");
      setBasePrice(product.base_price.toString());
      setPromotionalPrice(product.promotional_price?.toString() || "");
      setPreparationTime(product.preparation_time.toString());
      setServes(product.serves.toString());
      setIsAvailable(product.is_available);
      setIsFeatured(product.is_featured);
      setCurrentImageUrl(product.image_url || null);
      setImageFile(null);
      setAvailableDays((product as any).available_days || []);
    } else {
      setCategoryId(preselectedCategoryId || categories[0]?.id || "");
      setName("");
      setDescription("");
      setBasePrice("");
      setPromotionalPrice("");
      setPreparationTime("30");
      setServes("1");
      setIsAvailable(true);
      setIsFeatured(false);
      setCurrentImageUrl(null);
      setImageFile(null);
      setAvailableDays([]);
    }
  }, [product, categories, open, preselectedCategoryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let imageUrl = currentImageUrl;

    if (imageFile) {
      const uploadedUrl = await uploadImage(imageFile);
      if (uploadedUrl) {
        imageUrl = uploadedUrl;
        if (currentImageUrl && currentImageUrl !== uploadedUrl) {
          await deleteImage(currentImageUrl);
        }
      } else {
        toast.error("Erro ao fazer upload da imagem");
        return;
      }
    }

    const productData = {
      category_id: categoryId,
      name,
      description,
      base_price: Number(basePrice),
      promotional_price: promotionalPrice ? Number(promotionalPrice) : null,
      preparation_time: Number(preparationTime),
      serves: Number(serves),
      is_available: isAvailable,
      is_featured: isFeatured,
      image_url: imageUrl,
      order_position: 0,
      available_days: availableDays,
    };

    if (product) {
      updateProduct.mutate(
        { id: product.id, updates: productData },
        { onSuccess: () => { onOpenChange(false); setImageFile(null); } }
      );
    } else {
      createProduct.mutate(productData, {
        onSuccess: (data) => {
          setImageFile(null);
          if (onProductCreated) {
            onProductCreated(data as DeliveryProduct);
          } else {
            onOpenChange(false);
          }
        },
      });
    }
  };

  const handleRemoveImage = async () => {
    if (currentImageUrl) {
      const success = await deleteImage(currentImageUrl);
      if (success) {
        setCurrentImageUrl(null);
        if (product) {
          updateProduct.mutate({ id: product.id, updates: { image_url: null } });
        }
      }
    }
    setImageFile(null);
  };

  const toggleDay = (day: number) => {
    setAvailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleImageForCrop = (file: File | null) => {
    if (!file) {
      setImageFile(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result as string);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = useCallback(async (blob: Blob) => {
    const file = new File([blob], "product-image.jpg", { type: "image/jpeg" });
    setImageFile(file);
    setCurrentImageUrl(URL.createObjectURL(blob));
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] h-[90vh] max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>{product ? "Editar Produto" : "Novo Produto"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0 w-full">
          <TabsList className="mx-6 mt-4 grid grid-cols-3 shrink-0">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="recipe" disabled={!product}>
              Ficha Técnica
            </TabsTrigger>
            <TabsTrigger value="options" disabled={!product}>
              Opções e Complementos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="flex-1 min-h-0 flex flex-col mt-4 data-[state=inactive]:hidden">
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
                <ImageUpload value={currentImageUrl || undefined} onChange={handleImageForCrop} onRemove={handleRemoveImage} disabled={isUploading} />
                <p className="text-xs text-muted-foreground flex items-center gap-1 -mt-1">
                  <Info className="h-3 w-3" />
                  Resolução ideal: 800x600px (4:3)
                </p>

                <div className="space-y-2">
                  <Label>Categoria *</Label>
                  <Select value={categoryId} onValueChange={setCategoryId} required>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Preço Base *</Label>
                    <CurrencyInput value={basePrice} onChange={setBasePrice} />
                  </div>
                  <div className="space-y-2">
                    <Label>Preço Promocional</Label>
                    <CurrencyInput value={promotionalPrice} onChange={setPromotionalPrice} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tempo de Preparo (min)</Label>
                    <Input type="number" value={preparationTime} onChange={(e) => setPreparationTime(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Serve (pessoas)</Label>
                    <Input type="number" value={serves} onChange={(e) => setServes(e.target.value)} required />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Disponível</Label>
                    <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Produto em destaque</Label>
                    <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
                  </div>
                </div>

                {/* Available Days */}
                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <Label>Disponível nos dias</Label>
                    <p className="text-xs text-muted-foreground">Deixe todos desmarcados para disponibilidade diária</p>
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

              <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending || isUploading}>
                  {isUploading ? "Enviando..." : product ? "Salvar" : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="recipe" className="flex-1 min-h-0 mt-4 data-[state=inactive]:hidden overflow-hidden">
            <div className="h-full overflow-y-auto px-6 pb-6">
              {product && (
                <DeliveryRecipeManager productId={product.id} productPrice={product.base_price} />
              )}
            </div>
          </TabsContent>

          <TabsContent value="options" className="flex-1 min-h-0 mt-4 data-[state=inactive]:hidden overflow-hidden">
            <div className="h-full overflow-y-auto px-6 pb-6">
              <ProductOptionsManager productId={product?.id} />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {rawImageSrc && (
        <ImageCropDialog
          open={cropDialogOpen}
          onOpenChange={setCropDialogOpen}
          imageSrc={rawImageSrc}
          aspectRatio={4 / 3}
          onCropComplete={handleCropComplete}
          title="Recortar imagem do produto"
        />
      )}
    </Dialog>
  );
};