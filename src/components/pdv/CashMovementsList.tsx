import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  TrendingDown,
  TrendingUp,
  ShoppingCart,
  DollarSign,
  CreditCard,
  Smartphone,
  Ticket,
  UserCheck,
  Printer,
  Package,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PaymentMethodKey =
  | "dinheiro"
  | "cartao"
  | "credito"
  | "debito"
  | "pix"
  | "vale_refeicao"
  | "fiado";

interface Movement {
  id: string;
  type: "entrada" | "sangria" | "reforco" | "venda";
  amount: number;
  payment_method?: PaymentMethodKey | null;
  description: string | null;
  created_at: string;
  source?: string | null;
  comanda_id?: string | null;
  discount_reason?: string | null;
  discount_authorized_by?: string | null;
}

interface CashMovementsListProps {
  movements: Movement[];
}

const PAYMENT_CONFIG: Record<PaymentMethodKey, { label: string; Icon: typeof DollarSign }> = {
  dinheiro: { label: "Dinheiro", Icon: DollarSign },
  cartao: { label: "Cartão", Icon: CreditCard },
  credito: { label: "Crédito", Icon: CreditCard },
  debito: { label: "Débito", Icon: CreditCard },
  pix: { label: "PIX", Icon: Smartphone },
  vale_refeicao: { label: "Vale-refeição", Icon: Ticket },
  fiado: { label: "À Prazo", Icon: UserCheck },
};

function getMovementConfig(type: Movement["type"]) {
  switch (type) {
    case "venda":
      return {
        label: "Venda",
        Icon: ShoppingCart,
        bgColor: "bg-green-100 dark:bg-green-950",
        iconColor: "text-green-600",
        amountColor: "text-green-600",
        prefix: "+",
      };
    case "sangria":
      return {
        label: "Sangria",
        Icon: TrendingDown,
        bgColor: "bg-red-100 dark:bg-red-950",
        iconColor: "text-red-600",
        amountColor: "text-destructive",
        prefix: "-",
      };
    case "reforco":
      return {
        label: "Reforço",
        Icon: TrendingUp,
        bgColor: "bg-blue-100 dark:bg-blue-950",
        iconColor: "text-blue-600",
        amountColor: "text-blue-600",
        prefix: "+",
      };
    default:
      return {
        label: "Entrada",
        Icon: Package,
        bgColor: "bg-muted",
        iconColor: "text-muted-foreground",
        amountColor: "text-foreground",
        prefix: "+",
      };
  }
}

async function printComandaReceipt(comandaId: string) {
  const [{ data: comanda }, { data: items }, { data: payments }] = await Promise.all([
    supabase.from("pdv_comandas").select("comanda_number,customer_name,subtotal,status").eq("id", comandaId).single(),
    supabase.from("pdv_comanda_items").select("product_name,quantity,unit_price,subtotal,notes").eq("comanda_id", comandaId).order("created_at"),
    supabase.from("pdv_payments").select("payment_method,amount,cash_received,change_amount").eq("order_id",
      // pdv_comandas.order_id
      (await supabase.from("pdv_comandas").select("order_id").eq("id", comandaId).single()).data?.order_id ?? ""
    ),
  ]);

  if (!comanda) { toast.error("Comanda não encontrada"); return; }

  const PAYMENT_LABELS: Record<string, string> = {
    dinheiro: "Dinheiro", credito: "Crédito", debito: "Débito",
    pix: "PIX", vale_refeicao: "Vale-refeição", fiado: "À Prazo", cartao: "Cartão",
  };

  const now = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });

  const itemsHtml = (items || []).map(i =>
    `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:13px">
      <span>${i.quantity}x ${i.product_name}${i.notes ? ` <span style="font-size:11px;opacity:0.7">(${i.notes})</span>` : ""}</span>
      <span style="font-weight:700">${formatBRL(Number(i.subtotal))}</span>
    </div>`
  ).join("");

  const paymentsHtml = (payments || []).map(p =>
    `<div style="display:flex;justify-content:space-between;font-size:13px;padding:1px 0">
      <span>${PAYMENT_LABELS[p.payment_method] ?? p.payment_method}</span>
      <span style="font-weight:700">${formatBRL(Number(p.amount))}</span>
    </div>
    ${p.cash_received ? `<div style="display:flex;justify-content:space-between;font-size:12px;opacity:0.7"><span>Recebido</span><span>${formatBRL(Number(p.cash_received))}</span></div>` : ""}
    ${p.change_amount ? `<div style="display:flex;justify-content:space-between;font-size:12px;opacity:0.7"><span>Troco</span><span>${formatBRL(Number(p.change_amount))}</span></div>` : ""}`
  ).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { color: #000 !important; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; margin: 0; padding: 8px; line-height: 1.4; }
  h1 { font-size: 15px; font-weight: 800; text-align: center; margin: 0 0 4px; border-bottom: 2px solid #000; padding-bottom: 5px; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .total-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; border-top: 2px solid #000; padding-top: 5px; margin-top: 4px; }
  .footer { text-align: center; font-size: 11px; margin-top: 10px; border-top: 1px solid #000; padding-top: 5px; opacity: 0.7; }
</style></head><body>
<h1>RECIBO</h1>
<div style="font-size:12px;text-align:center;margin-bottom:5px">
  ${comanda.customer_name ? `<div><b>${comanda.customer_name}</b></div>` : ""}
  <div>Comanda #${comanda.comanda_number ?? "—"}</div>
</div>
<div class="divider"></div>
${itemsHtml}
<div class="total-row"><span>TOTAL</span><span>${formatBRL(Number(comanda.subtotal))}</span></div>
<div class="divider"></div>
${paymentsHtml}
<div class="footer">2ª via · ${now}</div>
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;width:0;height:0;border:none;left:-9999px";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (doc) {
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1000); }, 300);
  }
}

function MovementDetail({ movement, onClose }: { movement: Movement; onClose: () => void }) {
  const [reprinting, setReprinting] = useState(false);
  const cfg = getMovementConfig(movement.type);
  const paymentCfg = movement.payment_method ? PAYMENT_CONFIG[movement.payment_method] : null;
  const isDelivery = movement.source === "delivery" || movement.source === "delivery_online";
  const fullTime = format(new Date(movement.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });

  const handleReprint = async () => {
    if (!movement.comanda_id) return;
    setReprinting(true);
    try {
      await printComandaReceipt(movement.comanda_id);
    } catch {
      toast.error("Erro ao reimprimir recibo");
    } finally {
      setReprinting(false);
    }
  };

  return (
    <SheetContent side="right" className="w-80">
      <SheetHeader className="pb-4">
        <SheetTitle className="flex items-center gap-2">
          <div className={cn("rounded-full p-1.5", cfg.bgColor)}>
            <cfg.Icon className={cn("h-4 w-4", cfg.iconColor)} />
          </div>
          {cfg.label}
        </SheetTitle>
      </SheetHeader>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Valor</span>
          <span className={cn("font-semibold tabular-nums", cfg.amountColor)}>
            {cfg.prefix} {formatBRL(movement.amount)}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Horário</span>
          <span className="font-medium">{fullTime}</span>
        </div>

        {paymentCfg && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Pagamento</span>
            <div className="flex items-center gap-1.5">
              <paymentCfg.Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{paymentCfg.label}</span>
            </div>
          </div>
        )}

        {movement.description && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Descrição</span>
            <span className="font-medium text-right max-w-[60%]">{movement.description}</span>
          </div>
        )}

        {isDelivery && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Canal</span>
            <Badge variant="outline" className="text-xs gap-1">
              <Globe className="h-3 w-3" />
              {movement.source === "delivery_online" ? "Delivery Online" : "Delivery"}
            </Badge>
          </div>
        )}

        {movement.discount_reason && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Desconto aplicado</p>
              <p className="font-medium">{movement.discount_reason}</p>
              {movement.discount_authorized_by && (
                <p className="text-xs text-muted-foreground">
                  Autorizado por: {movement.discount_authorized_by}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {movement.type === "venda" && movement.comanda_id && (
        <>
          <Separator className="my-4" />
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleReprint}
            disabled={reprinting}
          >
            <Printer className="h-4 w-4" />
            {reprinting ? "Imprimindo..." : "Reimprimir recibo"}
          </Button>
        </>
      )}
    </SheetContent>
  );
}

export function CashMovementsList({ movements }: CashMovementsListProps) {
  const [selected, setSelected] = useState<Movement | null>(null);

  if (movements.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nenhuma movimentação registrada</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-0.5">
        {movements.map((movement) => {
          const cfg = getMovementConfig(movement.type);
          const paymentCfg = movement.payment_method ? PAYMENT_CONFIG[movement.payment_method] : null;
          const isDelivery = movement.source === "delivery" || movement.source === "delivery_online";
          const time = format(new Date(movement.created_at), "HH:mm", { locale: ptBR });

          return (
            <button
              key={movement.id}
              onClick={() => setSelected(movement)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted text-left transition-colors"
            >
              <div className={cn("rounded-full p-1.5 shrink-0", cfg.bgColor)}>
                <cfg.Icon className={cn("h-3.5 w-3.5", cfg.iconColor)} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium">{cfg.label}</span>
                  {paymentCfg && (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      · <paymentCfg.Icon className="h-3 w-3 mx-0.5" /> {paymentCfg.label}
                    </span>
                  )}
                  {isDelivery && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                      {movement.source === "delivery_online" ? "Online" : "Delivery"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {movement.description || "—"} · {time}
                </p>
              </div>

              <span className={cn("text-sm font-semibold tabular-nums shrink-0", cfg.amountColor)}>
                {cfg.prefix} {formatBRL(movement.amount)}
              </span>
            </button>
          );
        })}
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && <MovementDetail movement={selected} onClose={() => setSelected(null)} />}
      </Sheet>
    </>
  );
}
