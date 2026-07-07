import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QuotationRequest, usePDVQuotations } from "@/hooks/use-pdv-quotations";
import { usePDVSuppliers } from "@/hooks/use-pdv-suppliers";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";

interface QuotationResponseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: QuotationRequest;
  /** Pré-seleção vinda de uma resposta recebida por WhatsApp (caixa de entrada). */
  presetSupplierId?: string;
  presetNotes?: string;
  inboundMessageId?: string;
  onSaved?: () => void;
}

export function QuotationResponseDialog({
  open,
  onOpenChange,
  quotation,
  presetSupplierId,
  presetNotes,
  inboundMessageId,
  onSaved,
}: QuotationResponseDialogProps) {
  const { addResponse } = usePDVQuotations();
  const { suppliers } = usePDVSuppliers();

  const [supplierId, setSupplierId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [expirationDate, setExpirationDate] = useState<Date | undefined>();
  const [deliveryDays, setDeliveryDays] = useState("");
  const [minimumOrder, setMinimumOrder] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [brand, setBrand] = useState("");
  const [notes, setNotes] = useState("");

  // Pré-preenche quando aberto a partir de uma resposta recebida por WhatsApp.
  useEffect(() => {
    if (!open) return;
    if (presetSupplierId) setSupplierId(presetSupplierId);
    if (presetNotes) setNotes(presetNotes);
    // Se a cotação tiver um único item, já seleciona.
    if (quotation.items?.length === 1) setSelectedItemId(quotation.items[0].id);
  }, [open, presetSupplierId, presetNotes, quotation.items]);

  const selectedItem = quotation.items?.find((item) => item.id === selectedItemId);
  const totalPrice = selectedItem
    ? parseFloat(unitPrice || "0") * selectedItem.quantity_needed
    : 0;

  const handleSubmit = () => {
    if (!supplierId || !selectedItemId || !unitPrice) return;

    addResponse.mutate(
      {
        quotation_item_id: selectedItemId,
        supplier_id: supplierId,
        unit_price: parseFloat(unitPrice),
        total_price: totalPrice,
        expiration_date: expirationDate
          ? format(expirationDate, "yyyy-MM-dd")
          : undefined,
        delivery_days: deliveryDays ? parseInt(deliveryDays) : undefined,
        minimum_order: minimumOrder ? parseFloat(minimumOrder) : undefined,
        payment_terms: paymentTerms || undefined,
        brand: brand || undefined,
        notes: notes || undefined,
        source: inboundMessageId ? "whatsapp" : "manual",
        inbound_message_id: inboundMessageId,
      } as any,
      {
        onSuccess: () => {
          resetForm();
          onSaved?.();
          onOpenChange(false);
        },
      }
    );
  };

  const resetForm = () => {
    setSupplierId("");
    setSelectedItemId("");
    setUnitPrice("");
    setExpirationDate(undefined);
    setDeliveryDays("");
    setMinimumOrder("");
    setPaymentTerms("");
    setBrand("");
    setNotes("");
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Resposta de Cotação</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-2">
            {/* Supplier */}
            <div className="space-y-2">
              <Label>Fornecedor *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o fornecedor..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Item */}
            <div className="space-y-2">
              <Label>Item da Cotação *</Label>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o item..." />
                </SelectTrigger>
                <SelectContent>
                  {quotation.items?.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.ingredient?.name} ({item.quantity_needed} {item.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unit Price */}
            <div className="space-y-2">
              <Label>Preço Unitário *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0,00"
              />
              {selectedItem && unitPrice && (
                <p className="text-sm text-muted-foreground">
                  Total: {formatBRL(totalPrice)} ({selectedItem.quantity_needed}{" "}
                  {selectedItem.unit})
                </p>
              )}
            </div>

            {/* Expiration Date */}
            <div className="space-y-2">
              <Label>Validade do Produto</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !expirationDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expirationDate
                      ? format(expirationDate, "PPP", { locale: ptBR })
                      : "Selecione a validade"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={expirationDate}
                    onSelect={setExpirationDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Delivery Days */}
            <div className="space-y-2">
              <Label>Prazo de Entrega (dias)</Label>
              <Input
                type="number"
                min="0"
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(e.target.value)}
                placeholder="Ex: 3"
              />
            </div>

            {/* Minimum Order */}
            <div className="space-y-2">
              <Label>Pedido Mínimo</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={minimumOrder}
                onChange={(e) => setMinimumOrder(e.target.value)}
                placeholder="Quantidade mínima"
              />
            </div>

            {/* Payment Terms */}
            <div className="space-y-2">
              <Label>Condições de Pagamento</Label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Ex: À vista, 30 dias"
              />
            </div>

            {/* Brand */}
            <div className="space-y-2">
              <Label>Marca</Label>
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Marca do produto"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações adicionais..."
                rows={2}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Fechar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!supplierId || !selectedItemId || !unitPrice || addResponse.isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            {addResponse.isPending ? "Salvando..." : "Registrar Resposta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
