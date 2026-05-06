import { useForm } from "react-hook-form";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PDVProduct } from "@/hooks/use-pdv-products";
import { useProductImageUpload } from "@/hooks/use-product-image-upload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Upload, X, Info } from "lucide-react";
import { ProductRecipeManager } from "./ProductRecipeManager";

import { ProductCompositionManager } from "./ProductCompositionManager";
import { usePDVRecipes } from "@/hooks/use-pdv-recipes";
import { useProductionCenters } from "@/hooks/use-production-centers";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NCM_CODES,
  CEST_CODES,
  CST_ICMS_CODES,
  CSOSN_CODES,
  CFOP_CODES,
  CST_PIS_COFINS_CODES,
  ORIGIN_CODES,
} from "@/data/fiscal-codes";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  product: PDVProduct | null;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}

function FiscalCombobox({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { code: string; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between h-10 font-normal text-left">
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar..." />
          <CommandList>
            <CommandEmpty>Nenhum resultado</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.code}
                  value={opt.label}
                  onSelect={() => {
                    onChange(opt.code);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ProductDialog({
  open,
  onOpenChange,
  product,
  onSubmit,
  isSubmitting,
}: ProductDialogProps) {
  const { uploadImage, isUploading } = useProductImageUpload();
  const { centers: productionCenters } = useProductionCenters();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const { calculateCMV, recipes } = usePDVRecipes(product?.id);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [isSubstituicaoTributaria, setIsSubstituicaoTributaria] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const handleDialogOpenChange = (next: boolean) => {
    onOpenChange(next);
  };

  const handleConfirmDiscardClose = () => {
    setConfirmCloseOpen(false);
    onOpenChange(false);
  };

  const form = useForm({
    defaultValues: {
      name: product?.name || "",
      description: product?.description || "",
      category: product?.category || "",
      image_url: product?.image_url || "",
      price_salon: product?.price_salon || 0,
      price_balcao: product?.price_balcao || 0,
      price_delivery: product?.price_delivery || 0,
      preparation_time: product?.preparation_time || 15,
      serves: product?.serves || 1,
      is_available: product?.is_available ?? true,
      is_sold_by_weight: product?.is_sold_by_weight ?? false,
      available_days: (product as any)?.available_days || [],
      printer_station: (product as any)?.printer_station || "cozinha",
      ncm: product?.ncm || "",
      cest: product?.cest || "",
      cfop: product?.cfop || "",
      origin: product?.origin || "",
      cst_icms: product?.cst_icms || "",
      csosn: product?.csosn || "",
      icms_rate: product?.icms_rate || 0,
      pis_cst: product?.pis_cst || "",
      pis_rate: product?.pis_rate || 0,
      cofins_cst: product?.cofins_cst || "",
      cofins_rate: product?.cofins_rate || 0,
      tax_unit: product?.tax_unit || "",
      ean: product?.ean || "",
      is_composite: (product as any)?.is_composite ?? false,
      stock_deduction_mode: (product as any)?.stock_deduction_mode || "main",
    },
  });

  const currentPrice = form.watch("price_salon") || 0;
  const cmv = calculateCMV(recipes);

  useEffect(() => {
    if (!open) return;
    if (product) {
      form.reset({
        name: product.name,
        description: product.description || "",
        category: product.category,
        image_url: product.image_url || "",
        price_salon: product.price_salon,
        price_balcao: product.price_balcao || 0,
        price_delivery: product.price_delivery || 0,
        preparation_time: product.preparation_time,
        serves: product.serves,
        is_available: product.is_available,
        is_sold_by_weight: product.is_sold_by_weight,
        available_days: (product as any)?.available_days || [],
        printer_station: (product as any)?.printer_station || "cozinha",
        ncm: product.ncm || "",
        cest: product.cest || "",
        cfop: product.cfop || "",
        origin: product.origin || "",
        cst_icms: product.cst_icms || "",
        csosn: product.csosn || "",
        icms_rate: product.icms_rate || 0,
        pis_cst: product.pis_cst || "",
        pis_rate: product.pis_rate || 0,
        cofins_cst: product.cofins_cst || "",
        cofins_rate: product.cofins_rate || 0,
        tax_unit: product.tax_unit || "",
        ean: product.ean || "",
        is_composite: (product as any)?.is_composite ?? false,
        stock_deduction_mode: (product as any)?.stock_deduction_mode || "main",
      });
      setPreviewImage(product.image_url || null);
      // Determine ST mode
      setIsSubstituicaoTributaria(!!(product.csosn && product.csosn.length > 0));
    } else {
      form.reset({
        name: "",
        description: "",
        category: "",
        image_url: "",
        price_salon: 0,
        price_balcao: 0,
        price_delivery: 0,
        preparation_time: 15,
        serves: 1,
        is_available: true,
        is_sold_by_weight: false,
        available_days: [],
        printer_station: "cozinha",
        ncm: "",
        cest: "",
        cfop: "",
        origin: "",
        cst_icms: "",
        csosn: "",
        icms_rate: 0,
        pis_cst: "",
        pis_rate: 0,
        cofins_cst: "",
        cofins_rate: 0,
        tax_unit: "",
        ean: "",
        is_composite: false,
        stock_deduction_mode: "main",
      });
      setPreviewImage(null);
      setIsSubstituicaoTributaria(false);
    }
  }, [product, open, form]);

  const handleSubmit = form.handleSubmit((data) => {
    if (!data.name?.trim()) {
      toast.error("Nome do produto é obrigatório");
      return;
    }
    if (!data.category?.trim()) {
      toast.error("Categoria é obrigatória");
      return;
    }
    onSubmit({ ...data, name: data.name.trim(), category: data.category.trim() });
    form.reset();
    setPreviewImage(null);
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setRawImageSrc(reader.result as string);
        setCropDialogOpen(true);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleCropComplete = useCallback(async (blob: Blob) => {
    const file = new File([blob], "product-image.jpg", { type: "image/jpeg" });
    const url = await uploadImage(file);
    if (url) {
      form.setValue("image_url", url);
      setPreviewImage(url);
    }
  }, [uploadImage, form]);

  const currentImage = previewImage || form.watch("image_url");
  const availableDays = form.watch("available_days") || [];

  const toggleDay = (day: number) => {
    const current = form.getValues("available_days") || [];
    if (current.includes(day)) {
      form.setValue("available_days", current.filter((d: number) => d !== day));
    } else {
      form.setValue("available_days", [...current, day].sort());
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] h-[90vh] max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>
            {product ? "Editar Produto" : "Novo Produto"}
          </DialogTitle>
          <DialogDescription>
            Configure as informações do produto para o PDV
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
             <Tabs defaultValue="basic">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="basic">Básico</TabsTrigger>
                <TabsTrigger value="pricing">Preços</TabsTrigger>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger value="recipe" disabled={!product}>
                        Receita
                      </TabsTrigger>
                    </TooltipTrigger>
                    {!product && (
                      <TooltipContent>
                        <p>Salve o produto primeiro para configurar a receita</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger value="composition" disabled={!product}>
                        Composição
                      </TabsTrigger>
                    </TooltipTrigger>
                    {!product && (
                      <TooltipContent>
                        <p>Salve o produto primeiro para configurar composição</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="image_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Imagem do Produto</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          {currentImage ? (
                            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                              <img
                                src={currentImage}
                                alt="Preview"
                                className="w-full h-full object-cover"
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute top-2 right-2"
                                onClick={() => {
                                  form.setValue("image_url", "");
                                  setPreviewImage(null);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center aspect-video rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 cursor-pointer transition-colors">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                {isUploading ? (
                                  <>
                                    <Upload className="h-8 w-8 animate-pulse" />
                                    <span className="text-sm">Enviando...</span>
                                  </>
                                ) : (
                                  <>
                                    <ImageIcon className="h-8 w-8" />
                                    <span className="text-sm">
                                      Clique para fazer upload
                                    </span>
                                  </>
                                )}
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageSelect}
                                disabled={isUploading}
                              />
                            </label>
                          )}
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            Resolução ideal: 800x600px (4:3)
                          </p>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Pizza Margherita" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Descreva os ingredientes e características..."
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Pizzas, Bebidas..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="printer_station"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Centro de Produção</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o centro" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {productionCenters.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              Nenhum centro cadastrado. Crie em Configurações → Produção.
                            </div>
                          ) : (
                            productionCenters.map((center) => (
                              <SelectItem key={center.id} value={center.slug}>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: center.color }}
                                  />
                                  {center.name}
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Define para qual bancada o item será enviado
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="preparation_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tempo de Preparo (min)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="serves"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Serve (pessoas)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="pricing" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="price_salon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preço Salão *</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value || ''}
                          onChange={(v) => field.onChange(v ? Number(v) : 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Preço para consumo no salão
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="price_balcao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preço Balcão</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value || ''}
                          onChange={(v) => field.onChange(v ? Number(v) : null)}
                        />
                      </FormControl>
                      <FormDescription>
                        Preço para retirada no balcão
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="price_delivery"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preço Delivery</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value || ''}
                          onChange={(v) => field.onChange(v ? Number(v) : null)}
                        />
                      </FormControl>
                      <FormDescription>
                        Preço para entrega
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_available"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Disponível para venda</FormLabel>
                        <FormDescription>
                          Produto aparecerá nos canais de venda
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_sold_by_weight"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Vendido por peso</FormLabel>
                        <FormDescription>
                          Produto vendido em gramas/quilos
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Available Days */}
                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <FormLabel>Disponível nos dias</FormLabel>
                    <FormDescription>
                      Deixe todos desmarcados para disponibilidade diária
                    </FormDescription>
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
              </TabsContent>

              <TabsContent value="recipe" className="space-y-4 mt-4">
                {product ? (
                  <ProductRecipeManager 
                    productId={product.id} 
                    productPrice={currentPrice}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Salve o produto primeiro para configurar a receita
                  </div>
                )}
              </TabsContent>

              {product && (
                <TabsContent value="composition" className="mt-4">
                  <ProductCompositionManager
                    productId={product.id}
                    productPrice={currentPrice}
                    isComposite={form.watch("is_composite")}
                    stockDeductionMode={form.watch("stock_deduction_mode")}
                    onCompositeChange={(value) =>
                      form.setValue("is_composite", value, { shouldDirty: true })
                    }
                    onStockDeductionModeChange={(value) =>
                      form.setValue("stock_deduction_mode", value, { shouldDirty: true })
                    }
                  />
                </TabsContent>
              )}

              <TabsContent value="fiscal" className="space-y-6 mt-4">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Identificação</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="ean"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>EAN / GTIN</FormLabel>
                          <FormControl>
                            <Input placeholder="7891234567890" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ncm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>NCM</FormLabel>
                          <FormControl>
                            <FiscalCombobox
                              value={field.value}
                              onChange={field.onChange}
                              options={NCM_CODES}
                              placeholder="Selecione o NCM"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="cest"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CEST</FormLabel>
                        <FormControl>
                          <FiscalCombobox
                            value={field.value}
                            onChange={field.onChange}
                            options={CEST_CODES}
                            placeholder="Selecione o CEST"
                          />
                        </FormControl>
                        <FormDescription>Código Especificador da Substituição Tributária</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">ICMS</h4>
                  
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                    <Checkbox
                      checked={isSubstituicaoTributaria}
                      onCheckedChange={(v) => setIsSubstituicaoTributaria(!!v)}
                    />
                    <div>
                      <span className="text-sm font-medium">Simples Nacional (CSOSN)</span>
                      <p className="text-xs text-muted-foreground">Marque se o estabelecimento é optante do Simples Nacional</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="origin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Origem</FormLabel>
                          <FormControl>
                            <FiscalCombobox
                              value={field.value}
                              onChange={field.onChange}
                              options={ORIGIN_CODES}
                              placeholder="Selecione a origem"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cfop"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CFOP</FormLabel>
                          <FormControl>
                            <FiscalCombobox
                              value={field.value}
                              onChange={field.onChange}
                              options={CFOP_CODES}
                              placeholder="Selecione o CFOP"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {isSubstituicaoTributaria ? (
                      <FormField
                        control={form.control}
                        name="csosn"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CSOSN</FormLabel>
                            <FormControl>
                              <FiscalCombobox
                                value={field.value}
                                onChange={field.onChange}
                                options={CSOSN_CODES}
                                placeholder="Selecione o CSOSN"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        control={form.control}
                        name="cst_icms"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CST ICMS</FormLabel>
                            <FormControl>
                              <FiscalCombobox
                                value={field.value}
                                onChange={field.onChange}
                                options={CST_ICMS_CODES}
                                placeholder="Selecione o CST"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name="icms_rate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Alíquota ICMS %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="18.00"
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">PIS / COFINS</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="pis_cst"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CST PIS</FormLabel>
                          <FormControl>
                            <FiscalCombobox
                              value={field.value}
                              onChange={field.onChange}
                              options={CST_PIS_COFINS_CODES}
                              placeholder="Selecione o CST PIS"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="pis_rate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Alíquota PIS %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="1.65"
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cofins_cst"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CST COFINS</FormLabel>
                          <FormControl>
                            <FiscalCombobox
                              value={field.value}
                              onChange={field.onChange}
                              options={CST_PIS_COFINS_CODES}
                              placeholder="Selecione o CST COFINS"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cofins_rate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Alíquota COFINS %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="7.60"
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Unidade Tributável</h4>
                  <FormField
                    control={form.control}
                    name="tax_unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unidade</FormLabel>
                        <FormControl>
                          <Input placeholder="UN, KG, L, CX..." {...field} />
                        </FormControl>
                        <FormDescription>Unidade de medida tributável do produto</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || isUploading}>
                {isSubmitting ? "Salvando..." : product ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
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

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Há alterações não salvas na aba Opções. Se você fechar agora, elas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscardClose}
              className={buttonVariants({ variant: "destructive" })}
            >
              Descartar e fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
