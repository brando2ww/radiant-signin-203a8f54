import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Plus, Trash2, Search, Package, Check } from "lucide-react";
import { ProductOption, ProductOptionItem } from "@/hooks/use-product-options";
import { usePDVIngredients } from "@/hooks/use-pdv-ingredients";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";

export interface OptionItemWithIngredient {
  name: string;
  price_adjustment: number;
  is_available: boolean;
  ingredient_id?: string;
  ingredient_quantity?: number;
  ingredient_unit?: string;
}

interface ProductOptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  option?: ProductOption;
  productId: string;
  onSave: (option: Omit<ProductOption, "id" | "items"> & { items: (Omit<ProductOptionItem, "id" | "option_id"> & { ingredient_id?: string; ingredient_quantity?: number; ingredient_unit?: string })[] }) => void;
}

export const ProductOptionDialog = ({
  open,
  onOpenChange,
  option,
  productId,
  onSave,
}: ProductOptionDialogProps) => {
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"single" | "multiple">("single");
  const [isRequired, setIsRequired] = useState(false);
  const [minSelections, setMinSelections] = useState(0);
  const [maxSelections, setMaxSelections] = useState(1);
  const [allowQuantity, setAllowQuantity] = useState(false);
  const [items, setItems] = useState<OptionItemWithIngredient[]>([
    { name: "", price_adjustment: 0, is_available: true },
  ]);
  const [openPopoverIndex, setOpenPopoverIndex] = useState<number | null>(null);

  const { ingredients } = usePDVIngredients();

  useEffect(() => {
    if (option) {
      setName(option.name);
      setType(option.type);
      setIsRequired(option.is_required);
      setMinSelections(option.min_selections);
      setMaxSelections(option.max_selections);
      setAllowQuantity(!!(option as any).allow_quantity);
      setItems(
        option.items?.map((item) => ({
          name: item.name,
          price_adjustment: item.price_adjustment,
          is_available: item.is_available,
          ingredient_id: (item as any).ingredient_id,
          ingredient_quantity: (item as any).ingredient_quantity,
          ingredient_unit: (item as any).ingredient_unit,
        })) || [{ name: "", price_adjustment: 0, is_available: true }]
      );
    } else {
      setName("");
      setType("single");
      setIsRequired(false);
      setMinSelections(0);
      setMaxSelections(1);
      setAllowQuantity(false);
      setItems([{ name: "", price_adjustment: 0, is_available: true }]);
    }
  }, [option, open]);

  const handleAddItem = () => {
    setItems([...items, { name: "", price_adjustment: 0, is_available: true }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSelectIngredient = (index: number, ingredientId: string) => {
    const ingredient = ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) return;

    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      name: newItems[index].name || ingredient.name,
      ingredient_id: ingredientId,
      ingredient_unit: ingredient.unit,
      ingredient_quantity: newItems[index].ingredient_quantity || 1,
    };
    setItems(newItems);
    setOpenPopoverIndex(null);
  };

  const handleClearIngredient = (index: number) => {
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      ingredient_id: undefined,
      ingredient_quantity: undefined,
      ingredient_unit: undefined,
    };
    setItems(newItems);
  };

  const handleSubmit = () => {
    if (!name.trim() || items.some((item) => !item.name.trim())) {
      return;
    }

    onSave({
      product_id: productId,
      name: name.trim(),
      type,
      is_required: isRequired,
      min_selections: type === "multiple" ? minSelections : 0,
      max_selections: type === "multiple" ? maxSelections : 1,
      order_position: option?.order_position || 0,
      allow_quantity: type === "multiple" ? allowQuantity : false,
      items: items.map((item, index) => ({
        name: item.name,
        price_adjustment: item.price_adjustment,
        is_available: item.is_available,
        order_position: index,
        ingredient_id: item.ingredient_id,
        ingredient_quantity: item.ingredient_quantity,
        ingredient_unit: item.ingredient_unit,
      })),
    } as any);

    onOpenChange(false);
  };

  const getIngredientName = (ingredientId?: string) => {
    if (!ingredientId) return null;
    return ingredients.find((i) => i.id === ingredientId)?.name;
  };

  return (
    <Dialog modal={false} open={open} onOpenChange={(val) => {
      if (!val) setOpenPopoverIndex(null);
      onOpenChange(val);
    }}>
      <DialogContent
        ref={dialogContentRef}
        hideOverlay
        className="max-w-2xl w-[95vw] h-[85vh] p-0 grid grid-rows-[auto_1fr_auto] gap-0 overflow-hidden"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>{option ? "Editar Opção" : "Nova Opção"}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-4 space-y-5 min-h-0">
          {/* Seção: Configurações */}
          <section className="rounded-lg border bg-card/50 p-4 space-y-4">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">Configurações</h3>
              <p className="text-xs text-muted-foreground">
                Defina como o cliente vai escolher entre os itens desta opção
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="option-name" className="text-xs">Nome da opção *</Label>
              <Input
                id="option-name"
                placeholder="Ex: Escolha o tamanho, Adicionais"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="option-type" className="text-xs">Tipo de seleção</Label>
                <Select value={type} onValueChange={(value: "single" | "multiple") => setType(value)}>
                  <SelectTrigger id="option-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Escolha única (Radio)</SelectItem>
                    <SelectItem value="multiple">Múltipla escolha (Checkbox)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-md border bg-background px-3 sm:mt-[22px] h-10">
                <Label htmlFor="is-required" className="text-sm cursor-pointer">
                  Obrigatória
                </Label>
                <Switch
                  id="is-required"
                  checked={isRequired}
                  onCheckedChange={setIsRequired}
                />
              </div>
            </div>

            {type === "multiple" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="min-selections" className="text-xs">Mínimo de seleções</Label>
                    <Input
                      id="min-selections"
                      type="number"
                      min="0"
                      value={minSelections}
                      onChange={(e) => setMinSelections(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-selections" className="text-xs">Máximo de seleções</Label>
                    <Input
                      id="max-selections"
                      type="number"
                      min="1"
                      value={maxSelections}
                      onChange={(e) => setMaxSelections(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="flex items-start justify-between rounded-md border bg-background px-3 py-3 gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor="allow-quantity" className="text-sm cursor-pointer">
                      Permitir múltiplas unidades por item
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Cada item terá controles − e + em vez de checkbox.
                    </p>
                  </div>
                  <Switch
                    id="allow-quantity"
                    checked={allowQuantity}
                    onCheckedChange={setAllowQuantity}
                  />
                </div>
              </>
            )}
          </section>

          {/* Seção: Itens */}
          <section className="space-y-3">
            <div className="flex items-center justify-between sticky top-0 z-10 bg-background py-1 -mx-1 px-1">
              <div>
                <h3 className="text-sm font-semibold">Itens da opção *</h3>
                <p className="text-xs text-muted-foreground">
                  {items.length} {items.length === 1 ? "item cadastrado" : "itens cadastrados"}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={handleAddItem}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar item
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="p-3 border rounded-lg space-y-3">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Nome do item *"
                        value={item.name}
                        onChange={(e) => handleItemChange(index, "name", e.target.value)}
                      />
                      <div className="flex gap-2 items-center">
                        <CurrencyInput
                          value={item.price_adjustment}
                          onChange={(v) => handleItemChange(index, "price_adjustment", Number(v) || 0)}
                          className="flex-1"
                        />
                        <Label className="flex items-center gap-2 whitespace-nowrap">
                          <Switch
                            checked={item.is_available}
                            onCheckedChange={(checked) => handleItemChange(index, "is_available", checked)}
                          />
                          <span className="text-sm">Disponível</span>
                        </Label>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleRemoveItem(index)}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Ingredient linking */}
                  <div className="border-t pt-3 space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      Vincular ao Estoque (opcional)
                    </Label>
                    <div className="flex gap-2 items-center">
                      <Popover
                        modal={false}
                        open={openPopoverIndex === index}
                        onOpenChange={(open) => setOpenPopoverIndex(open ? index : null)}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "flex-1 justify-start text-left font-normal",
                              !item.ingredient_id && "text-muted-foreground"
                            )}
                          >
                            <Search className="h-3.5 w-3.5 mr-2 shrink-0" />
                            {item.ingredient_id
                              ? getIngredientName(item.ingredient_id)
                              : "Buscar insumo..."}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start" container={dialogContentRef.current}>
                          <Command>
                            <CommandInput placeholder="Buscar insumo..." />
                            <CommandList>
                              <CommandEmpty>Nenhum insumo encontrado</CommandEmpty>
                              <CommandGroup>
                                {ingredients.map((ing) => (
                                  <CommandItem
                                    key={ing.id}
                                    value={ing.name}
                                    onSelect={() => handleSelectIngredient(index, ing.id)}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        item.ingredient_id === ing.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex-1">
                                      <span>{ing.name}</span>
                                      <span className="text-xs text-muted-foreground ml-2">
                                        ({ing.unit}) - {formatBRL(Number(ing.unit_cost))}
                                      </span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>

                      {item.ingredient_id && (
                        <>
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="Qtd"
                            value={item.ingredient_quantity || ""}
                            onChange={(e) =>
                              handleItemChange(index, "ingredient_quantity", Number(e.target.value) || 0)
                            }
                            className="w-24"
                          />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {item.ingredient_unit || "un"}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => handleClearIngredient(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>
            {option ? "Salvar" : "Criar Opção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
