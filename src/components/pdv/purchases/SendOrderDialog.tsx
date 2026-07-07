import { useMemo, useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { Loader2, Send, AlertCircle } from "lucide-react";
import { QuotationRequest } from "@/hooks/use-pdv-quotations";
import { useBusinessSettings } from "@/hooks/use-business-settings";
import { generateWinnerOrderMessage, WinnerOrderItem } from "@/lib/whatsapp-message";
import { formatBRL } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface SendOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: QuotationRequest;
}

interface PoItem {
  ingredient_id: string;
  quantity: number;
  unit: string;
  unit_price: number;
  quotation_response_id: string | null;
}
interface SupplierOrder {
  supplierId: string;
  name: string;
  phone: string; // whatsapp || phone
  items: WinnerOrderItem[];
  poItems: PoItem[];
  paymentTerms: string | null;
  maxDeliveryDays: number | null;
  total: number;
  message: string;
}

const contactOf = (s?: { phone?: string | null; whatsapp?: string | null } | null) =>
  (s?.whatsapp && s.whatsapp.trim()) || (s?.phone && s.phone.trim()) || "";

export function SendOrderDialog({ open, onOpenChange, quotation }: SendOrderDialogProps) {
  const { settings } = useBusinessSettings();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Record<string, string>>({});

  // Agrupa os itens VENCEDORES por fornecedor.
  const orders = useMemo<SupplierOrder[]>(() => {
    const bySupplier = new Map<string, SupplierOrder>();
    (quotation.items ?? []).forEach((item) => {
      const win = item.responses?.find((r) => r.is_winner);
      if (!win || !win.supplier) return;
      const sid = win.supplier.id;
      const orderItem: WinnerOrderItem = {
        ingredientName: item.ingredient?.name ?? "Item",
        quantity: item.quantity_needed,
        unit: item.unit,
        unitPrice: Number(win.unit_price) || 0,
        brand: win.brand,
        deliveryDays: win.delivery_days,
        paymentTerms: win.payment_terms,
      };
      const poItem: PoItem = {
        ingredient_id: item.ingredient_id,
        quantity: item.quantity_needed,
        unit: item.unit,
        unit_price: Number(win.unit_price) || 0,
        quotation_response_id: (win as any).id ?? null,
      };
      const existing = bySupplier.get(sid);
      if (existing) {
        existing.items.push(orderItem);
        existing.poItems.push(poItem);
        existing.total += orderItem.quantity * orderItem.unitPrice;
        if (win.delivery_days != null) existing.maxDeliveryDays = Math.max(existing.maxDeliveryDays ?? 0, win.delivery_days);
        if (!existing.paymentTerms && win.payment_terms) existing.paymentTerms = win.payment_terms;
      } else {
        bySupplier.set(sid, {
          supplierId: sid,
          name: win.supplier.name,
          phone: contactOf(win.supplier),
          items: [orderItem],
          poItems: [poItem],
          paymentTerms: win.payment_terms ?? null,
          maxDeliveryDays: win.delivery_days ?? null,
          total: orderItem.quantity * orderItem.unitPrice,
          message: "",
        });
      }
    });
    return Array.from(bySupplier.values());
  }, [quotation.items]);

  // Monta as mensagens padrão quando abre.
  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    orders.forEach((o) => {
      next[o.supplierId] = generateWinnerOrderMessage(o.name, o.items, {
        businessName: settings?.business_name || undefined,
        requestNumber: quotation.request_number || undefined,
      });
    });
    setMessages(next);
  }, [open, orders, settings?.business_name, quotation.request_number]);

  const handleSend = async () => {
    const toDate = (days: number | null) => {
      if (days == null) return null;
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().split("T")[0];
    };
    const payload = orders
      .filter((o) => o.phone)
      .map((o) => ({
        supplierId: o.supplierId,
        phone: o.phone,
        message: messages[o.supplierId] ?? "",
        items: o.poItems,
        paymentTerms: o.paymentTerms,
        expectedDelivery: toDate(o.maxDeliveryDays),
        requestNumber: quotation.request_number,
      }));

    if (payload.length === 0) {
      toast.error("Nenhum fornecedor vencedor com WhatsApp para enviar.");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-supplier-order", {
        body: { quotationId: quotation.id, orders: payload },
      });
      if (error) throw error;
      if (data?.code === "NO_WHATSAPP_CONNECTION") {
        toast.error("WhatsApp não conectado. Conecte nas configurações antes de enviar.");
        return;
      }
      if (data?.sent > 0) toast.success(`Pedido enviado a ${data.sent} fornecedor(es)!`);
      if (data?.errors?.length > 0) toast.warning(`${data.errors.length} envio(s) falharam.`);
      if (data?.orders?.length > 0) toast.success(`Pedido de compra registrado (${data.orders.join(", ")}).`);
      queryClient.invalidateQueries({ queryKey: ["pdv-quotations"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-purchase-orders"] });
      onOpenChange(false);
    } catch {
      toast.error("Erro ao enviar o pedido.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppIcon className="h-5 w-5 text-green-600" />
            Enviar pedido ao(s) fornecedor(es)
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Pedido montado com os itens vencedores e o que cada fornecedor cotou. Revise e envie.
          </p>
        </DialogHeader>

        {orders.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum vencedor selecionado ainda. Escolha os vencedores no comparativo.
          </div>
        ) : (
          <ScrollArea className="max-h-[55vh]">
            <div className="space-y-4 pr-2">
              {orders.map((o) => (
                <div key={o.supplierId} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{o.name}</span>
                    <Badge variant="secondary">{formatBRL(o.total)}</Badge>
                  </div>
                  {!o.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Sem WhatsApp cadastrado · não será enviado automaticamente.
                    </div>
                  )}
                  <Textarea
                    rows={7}
                    value={messages[o.supplierId] ?? ""}
                    onChange={(e) => setMessages((m) => ({ ...m, [o.supplierId]: e.target.value }))}
                    className="text-xs font-mono"
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || orders.every((o) => !o.phone)}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
