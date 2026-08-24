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
import { usePDVQuotations, type QuotationRequest } from "@/hooks/use-pdv-quotations";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { usePDVIngredients } from "@/hooks/use-pdv-ingredients";
import { usePDVIngredientSuppliers } from "@/hooks/use-pdv-ingredient-suppliers";
import { usePurchaseSettings } from "@/hooks/use-purchase-settings";
import { useBusinessSettings } from "@/hooks/use-business-settings";
import { WhatsAppChatPreview } from "@/components/pdv/whatsapp/WhatsAppChatPreview";
import { generateQuotationMessage } from "@/lib/whatsapp-message";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { QuotationItemSuppliers } from "./QuotationItemSuppliers";
import { IngredientCombobox } from "./IngredientCombobox";
import { toast } from "sonner";

interface QuotationItem {
  // Chave estável só de UI. Como itens novos entram no TOPO da lista, o índice
  // do array deixa de identificar a linha (todo mundo desce um) e o React
  // reaproveitaria o DOM errado se a key fosse o índice.
  _uid: string;
  /** id no banco. Só existe ao editar; item novo não tem. */
  id?: string;
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
  preselectedItems?: Omit<QuotationItem, "selected_suppliers" | "_uid" | "id">[];
  /** Passada = o diálogo edita essa cotação em vez de criar uma nova. */
  quotation?: QuotationRequest;
}

let itemUidCounter = 0;
const nextItemUid = () => `item-${++itemUidCounter}`;

export function QuotationRequestDialog({
  open,
  onOpenChange,
  preselectedItems,
  quotation,
}: QuotationRequestDialogProps) {
  const { createQuotation, updateQuotation } = usePDVQuotations();
  const { ingredients } = usePDVIngredients();
  const { availableSuppliers } = usePDVIngredientSuppliers();
  const { settings: purchaseSettings } = usePurchaseSettings();
  const { settings: businessSettings } = useBusinessSettings();

  const isEditing = !!quotation;
  const isSaving = createQuotation.isPending || updateQuotation.isPending;

  const [items, setItems] = useState<QuotationItem[]>([]);
  const [deadline, setDeadline] = useState<Date>(addDays(new Date(), 3));
  const [notes, setNotes] = useState("");

  // Quais fornecedores já estão vinculados a cada item. Não vem na query da
  // lista de cotações, então busca sob demanda — só quando o diálogo abre.
  const { data: existingLinks, isLoading: loadingLinks } = useQuery({
    queryKey: ["quotation-item-suppliers", quotation?.id, "edit"],
    queryFn: async () => {
      const itemIds = quotation?.items?.map((i) => i.id) || [];
      if (itemIds.length === 0) return [];
      const { data, error } = await supabase
        .from("pdv_quotation_item_suppliers")
        .select("quotation_item_id, supplier_id")
        .in("quotation_item_id", itemIds);
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!quotation?.items?.length,
  });

  // Hidrata o formulário com a cotação em edição. Depende de `existingLinks`
  // para não montar a lista sem os fornecedores e depois salvá-la vazia.
  useEffect(() => {
    if (!open || !quotation || existingLinks === undefined) return;
    setItems(
      (quotation.items || []).map((item) => ({
        _uid: nextItemUid(),
        id: item.id,
        ingredient_id: item.ingredient_id,
        ingredient_name: item.ingredient?.name || "",
        quantity_needed: item.quantity_needed,
        unit: item.unit,
        notes: item.notes || undefined,
        selected_suppliers: existingLinks
          .filter((l) => l.quotation_item_id === item.id)
          .map((l) => l.supplier_id),
      }))
    );
    setDeadline(quotation.deadline ? new Date(quotation.deadline) : addDays(new Date(), 3));
    setNotes(quotation.notes || "");
    // Reidratar a cada mudança de `items`/`existingLinks` apagaria o que o
    // usuário acabou de digitar; o gatilho é abrir o diálogo nesta cotação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quotation?.id, existingLinks === undefined]);

  // Initialize with preselected items
  useEffect(() => {
    if (isEditing) return;
    if (open && preselectedItems && preselectedItems.length > 0) {
      setItems(
        preselectedItems.map((item) => ({
          ...item,
          _uid: nextItemUid(),
          selected_suppliers: [],
        }))
      );
    }
  }, [open, preselectedItems, isEditing]);

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

    const supplierName =
      availableSuppliers.find((s) => s.id === supplierId)?.name ?? "Fornecedor";

    return {
      supplierName,
      // A prévia precisa usar o mesmo template do envio, senão mostra um texto
      // que o fornecedor nunca vai receber.
      text: generateQuotationMessage(
        supplierItems.map((item) => ({
          ingredientName: item.ingredient_name,
          quantity: item.quantity_needed,
          unit: item.unit,
        })),
        deadline,
        businessSettings?.business_name || undefined,
        quotation?.request_number || undefined,
        {
          template: purchaseSettings?.defaultMessageTemplate,
          supplierName,
        }
      ) +
        // A edge anexa o link no envio. Sem ele na prévia, some justamente a
        // parte que o fornecedor precisa tocar.
        "\n\n👉 *Preencha seu orçamento aqui:*\nhttps://pdv.velaraia.app/l/cotacao/…",
    };
  }, [
    items,
    deadline,
    availableSuppliers,
    purchaseSettings?.defaultMessageTemplate,
    businessSettings?.business_name,
    quotation?.request_number,
  ]);

  // O item novo entra no TOPO: com listas longas o usuário teria que rolar até
  // o fim do dialog para preencher o que acabou de adicionar.
  const handleAddItem = () => {
    setItems([
      {
        _uid: nextItemUid(),
        ingredient_id: "",
        ingredient_name: "",
        quantity_needed: 1,
        unit: "un",
        selected_suppliers: [],
      },
      ...items,
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof QuotationItem, value: string | number | string[]) => {
    const newItems = [...items];
    if (field === "ingredient_id") {
      // Insumo repetido geraria duas linhas do mesmo item na cotação e o
      // fornecedor responderia duas vezes o mesmo preço — e o comparativo
      // mostraria o item duplicado, cada um com seu vencedor.
      const duplicate = items.some(
        (it, i) => i !== index && it.ingredient_id === value,
      );
      if (duplicate) {
        toast.error("Este insumo já está na cotação.");
        return;
      }
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
    if (isSaving) return;

    // Rede de segurança: cotação em edição pode ter vindo com duplicata gravada
    // antes desta trava existir.
    const ids = items.map((i) => i.ingredient_id);
    if (new Set(ids).size !== ids.length) {
      toast.error("Há insumos repetidos na lista. Remova as linhas duplicadas.");
      return;
    }

    const payloadItems = items.map((item) => ({
      ingredient_id: item.ingredient_id,
      quantity_needed: item.quantity_needed,
      unit: item.unit,
      notes: item.notes,
      selected_suppliers: item.selected_suppliers,
    }));

    const done = {
      onSuccess: () => {
        onOpenChange(false);
        resetForm();
      },
    };

    if (isEditing && quotation) {
      updateQuotation.mutate(
        {
          id: quotation.id,
          deadline: format(deadline, "yyyy-MM-dd"),
          notes,
          items: items.map((item, index) => ({
            id: item.id,
            ...payloadItems[index],
          })),
        },
        done
      );
      return;
    }

    createQuotation.mutate(
      {
        deadline: format(deadline, "yyyy-MM-dd"),
        notes,
        items: payloadItems,
      },
      done
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

  // Fornecedores DISTINTOS: o mesmo fornecedor costuma ser escolhido em vários
  // itens, e ele recebe UM link com todos os itens dele. Somar por item dizia
  // "9 fornecedores" quando na verdade eram 4 pessoas recebendo mensagem.
  const totalSelectedSuppliers = new Set(
    items.flatMap((item) => item.selected_suppliers),
  ).size;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isEditing
              ? `Editar Cotação ${quotation?.request_number ?? ""}`.trim()
              : "Nova Solicitação de Cotação"}
          </DialogTitle>
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
                      key={item._uid}
                      className="p-3 border rounded-md space-y-2"
                    >
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                          <Label className="text-xs">Ingrediente</Label>
                          {/* Some da lista o que já foi escolhido em outra
                              linha: bloquear só no clique deixaria o usuário
                              procurar um item que ele não pode usar. */}
                          <IngredientCombobox
                            ingredients={ingredients.filter(
                              (ing) =>
                                ing.id === item.ingredient_id ||
                                !items.some(
                                  (it, i) => i !== index && it.ingredient_id === ing.id,
                                ),
                            )}
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
                <WhatsAppChatPreview
                  contato={messagePreview.supplierName}
                  texto={messagePreview.text}
                  rodape="Cada fornecedor recebe apenas os itens dele, com um link exclusivo."
                />
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
            disabled={
              items.length === 0 ||
              items.some((item) => !item.ingredient_id) ||
              isSaving ||
              // Salvar antes de saber quais fornecedores já estavam vinculados
              // apagaria todos eles.
              (isEditing && loadingLinks)
            }
          >
            {isSaving
              ? isEditing
                ? "Salvando..."
                : "Criando..."
              : `${isEditing ? "Salvar Alterações" : "Criar Cotação"}${
                  totalSelectedSuppliers > 0 ? ` (${totalSelectedSuppliers} fornecedores)` : ""
                }`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
