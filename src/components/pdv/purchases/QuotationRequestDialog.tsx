import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePDVQuotations } from "@/hooks/use-pdv-quotations";
import { usePDVIngredients } from "@/hooks/use-pdv-ingredients";
import { usePDVIngredientSuppliers } from "@/hooks/use-pdv-ingredient-suppliers";
import { generateQuotationMessage } from "@/lib/whatsapp-message";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { QuotationItemSuppliers } from "./QuotationItemSuppliers";
import { IngredientCombobox } from "./IngredientCombobox";

interface QuotationItem {
  ingredient_id: string;
  ingredient_name: string;
  quantity_needed: number;
  unit: string;
  notes?: string;
  selected_suppliers: string[];
}

interface QuotationRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedItems?: Omit<QuotationItem, "selected_suppliers">[];
}

export function QuotationRequestDialog({
  open,
  onOpenChange,
  preselectedItems,
}: QuotationRequestDialogProps) {
  const { createQuotation } = usePDVQuotations();
  const { ingredients } = usePDVIngredients();
  const { availableSuppliers } = usePDVIngredientSuppliers();

  const [items, setItems] = useState<QuotationItem[]>([]);
  const [deadline, setDeadline] = useState<Date>(addDays(new Date(), 3));
  const [notes, setNotes] = useState("");

  // Initialize with preselected items
  useEffect(() => {
    if (open && preselectedItems && preselectedItems.length > 0) {
      setItems(preselectedItems.map((item) => ({ ...item, selected_suppliers: [] })));
    }
  }, [open, preselectedItems]);

  // Prévia da mensagem. Cada fornecedor recebe SÓ os itens que foi convidado a
  // cotar, então não existe uma mensagem única: a prévia usa o primeiro
  // fornecedor selecionado como exemplo. O texto real é montado no envio.
  const messagePreview = useMemo(() => {
    const withSuppliers = items.filter(
      (item) => item.ingredient_id && item.selected_suppliers.length > 0
    );
    if (withSuppliers.length === 0) return null;

    const supplierId = withSuppliers[0].selected_suppliers[0];
    const supplierItems = withSuppliers.filter((item) =>
      item.selected_suppliers.includes(supplierId)
    );

    return {
      supplierName:
        availableSuppliers.find((s) => s.id === supplierId)?.name ?? "Fornecedor",
      text: generateQuotationMessage(
        supplierItems.map((item) => ({
          ingredientName: item.ingredient_name,
          quantity: item.quantity_needed,
          unit: item.unit,
        })),
        deadline
      ),
    };
  }, [items, deadline, availableSuppliers]);

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        ingredient_id: "",
        ingredient_name: "",
        quantity_needed: 1,
        unit: "un",
        selected_suppliers: [],
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof QuotationItem, value: string | number | string[]) => {
    const newItems = [...items];
    if (field === "ingredient_id") {
      const ingredient = ingredients.find((i) => i.id === value);
      if (ingredient) {
        newItems[index] = {
          ...newItems[index],
          ingredient_id: ingredient.id,
          ingredient_name: ingredient.name,
          unit: ingredient.unit,
          selected_suppliers: [], // Reset suppliers when ingredient changes
        };
      }
    } else if (field === "quantity_needed") {
      newItems[index] = { ...newItems[index], quantity_needed: value as number };
    } else if (field === "selected_suppliers") {
      newItems[index] = { ...newItems[index], selected_suppliers: value as string[] };
    }
    setItems(newItems);
  };

  const handleSubmit = () => {
    if (items.length === 0 || items.some((item) => !item.ingredient_id)) {
      return;
    }

    createQuotation.mutate(
      {
        deadline: format(deadline, "yyyy-MM-dd"),
        notes,
        items: items.map((item) => ({
          ingredient_id: item.ingredient_id,
          quantity_needed: item.quantity_needed,
          unit: item.unit,
          notes: item.notes,
          selected_suppliers: item.selected_suppliers,
        })),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
        },
      }
    );
  };

  const resetForm = () => {
    setItems([]);
    setDeadline(addDays(new Date(), 3));
    setNotes("");
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  // Count total selected suppliers
  const totalSelectedSuppliers = items.reduce(
    (acc, item) => acc + item.selected_suppliers.length,
    0
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Nova Solicitação de Cotação</DialogTitle>
        </DialogHeader>

        {/* Uma única área rolável: aninhar scroll no diálogo prende a roda do mouse. */}
        <div className="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2">
          <div className="space-y-6">
            {/* Deadline */}
            <div className="space-y-2">
              <Label>Prazo para Respostas</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !deadline && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deadline
                      ? format(deadline, "PPP", { locale: ptBR })
                      : "Selecione uma data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={deadline}
                    onSelect={(date) => date && setDeadline(date)}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    locale={ptBR}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Itens da Cotação</Label>
                <Button variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Item
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-md border-dashed">
                  Nenhum item adicionado. Clique em "Adicionar Item" para começar.
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div
                      key={index}
                      className="p-3 border rounded-md space-y-2"
                    >
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                          <Label className="text-xs">Ingrediente</Label>
                          <IngredientCombobox
                            ingredients={ingredients}
                            value={item.ingredient_id}
                            onChange={(value) =>
                              handleItemChange(index, "ingredient_id", value)
                            }
                          />
                        </div>
                        <div className="col-span-3">
                          <Label className="text-xs">Quantidade</Label>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantity_needed}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "quantity_needed",
                                parseFloat(e.target.value) || 0
                              )
                            }
                          />
                        </div>
                        <div className="col-span-3">
                          <Label className="text-xs">Unidade</Label>
                          <Input value={item.unit} disabled />
                        </div>
                        <div className="col-span-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(index)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Supplier Selection */}
                      {item.ingredient_id && (
                        <QuotationItemSuppliers
                          ingredientId={item.ingredient_id}
                          selectedSuppliers={item.selected_suppliers}
                          onSuppliersChange={(suppliers) =>
                            handleItemChange(index, "selected_suppliers", suppliers)
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Message Preview */}
            {messagePreview && (
              <div className="space-y-2">
                <Label>Mensagem para Fornecedores</Label>
                <pre className="rounded-md border bg-muted/50 p-3 font-mono text-sm whitespace-pre-wrap max-h-[220px] overflow-y-auto">
                  {messagePreview.text}
                </pre>
                <p className="text-xs text-muted-foreground">
                  Prévia do que <strong>{messagePreview.supplierName}</strong> vai receber.
                  Cada fornecedor recebe apenas os itens dele, mais o link do formulário.
                </p>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações internas sobre esta cotação..."
                rows={2}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 shrink-0">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={items.length === 0 || items.some((item) => !item.ingredient_id) || createQuotation.isPending}
          >
            {createQuotation.isPending ? "Criando..." : `Criar Cotação${totalSelectedSuppliers > 0 ? ` (${totalSelectedSuppliers} fornecedores)` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
