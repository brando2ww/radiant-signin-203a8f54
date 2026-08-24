import { useMemo, useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import {
  Loader2,
  Send,
  AlertCircle,
  Printer,
  ClipboardCheck,
  ChevronLeft,
  AlertTriangle,
} from "lucide-react";
import { QuotationRequest } from "@/hooks/use-pdv-quotations";
import { useBusinessSettings } from "@/hooks/use-business-settings";
import { conservationLabel, generateWinnerOrderMessage, WinnerOrderItem } from "@/lib/whatsapp-message";
import { formatBRL } from "@/lib/format";
import { usePDVSettings } from "@/hooks/use-pdv-settings";
import { useWhatsAppConnection } from "@/hooks/use-whatsapp-connection";
import { TemplatePreview } from "@/components/pdv/whatsapp/TemplatePreview";
import { TEMPLATE_PEDIDO, achatarParametro } from "@/lib/whatsapp-templates";
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
/** Linha do pedido, com a origem na cotação — é a chave da edição de quantidade. */
interface OrderLine extends WinnerOrderItem {
  itemId: string;
}

interface SupplierOrder {
  supplierId: string;
  name: string;
  phone: string; // whatsapp || phone
  items: OrderLine[];
  poItems: PoItem[];
  paymentTerms: string | null;
  maxDeliveryDays: number | null;
  total: number;
  /** Pedido mínimo do fornecedor. 0 = não tem. null = não informado. */
  minimumOrder: number | null;
  message: string;
}

const contactOf = (s?: { phone?: string | null; whatsapp?: string | null } | null) =>
  (s?.whatsapp && s.whatsapp.trim()) || (s?.phone && s.phone.trim()) || "";

/**
 * Campo preenchido com algo que se possa ler.
 *
 * Fornecedor que responde "." em forma de pagamento não está informando nada,
 * e "Pagamento: ." na conferência é pior do que "não informado": parece defeito
 * da tela.
 */
const temTexto = (v: unknown): boolean =>
  typeof v === "string" ? /[\p{L}\p{N}]/u.test(v) : Boolean(v);

/** Aceita vírgula decimal, que é como se digita quantidade por aqui. */
const parseQtd = (v: string): number => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function SendOrderDialog({ open, onOpenChange, quotation }: SendOrderDialogProps) {
  const { settings } = useBusinessSettings();
  const { settings: pdvSettings } = usePDVSettings();
  const { connection } = useWhatsAppConnection();
  // Número oficial: o que sai é o modelo aprovado, não o texto editável.
  const canalOficial = connection?.provider === "sellgrid" || connection?.provider === "cloud";
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Record<string, string>>({});
  // "review" = conferência do que foi escolhido; "send" = mensagens do WhatsApp
  const [step, setStep] = useState<"review" | "send">("review");
  // Já assumiu o risco de fechar abaixo do pedido mínimo de algum fornecedor?
  const [minimumAck, setMinimumAck] = useState(false);
  /**
   * Quantidade ajustada na hora de fechar, por item da cotação.
   *
   * O que se cota nem sempre é o que se compra: o preço chegou, o comprador
   * viu o total e resolveu levar menos. Sem isto ele cancelava o pedido e
   * refazia a cotação inteira, ou pedia a mais e acertava no recebimento.
   * A cotação não é tocada — o ajuste vale para ESTE pedido.
   */
  const [qtdEditada, setQtdEditada] = useState<Record<string, string>>({});

  // Agrupa os itens VENCEDORES por fornecedor.
  const orders = useMemo<SupplierOrder[]>(() => {
    const bySupplier = new Map<string, SupplierOrder>();
    (quotation.items ?? []).forEach((item) => {
      const win = item.responses?.find((r) => r.is_winner);
      if (!win || !win.supplier) return;
      const sid = win.supplier.id;
      // Zero significa "decidi não levar este". A linha continua na tela,
      // apagada, mas sai do total, do pedido de compra e da mensagem.
      const bruto = qtdEditada[item.id];
      const quantidade = bruto === undefined ? item.quantity_needed : parseQtd(bruto);
      const orderItem: OrderLine = {
        itemId: item.id,
        ingredientName: item.ingredient?.name ?? "Item",
        quantity: quantidade,
        unit: item.unit,
        unitPrice: Number(win.unit_price) || 0,
        brand: win.brand,
        conservation: win.conservation,
        deliveryDays: win.delivery_days,
        paymentTerms: win.payment_terms,
      };
      const poItem: PoItem = {
        ingredient_id: item.ingredient_id,
        quantity: quantidade,
        unit: item.unit,
        unit_price: Number(win.unit_price) || 0,
        quotation_response_id: (win as any).id ?? null,
      };
      const existing = bySupplier.get(sid);
      if (existing) {
        existing.items.push(orderItem);
        if (quantidade > 0) {
          existing.poItems.push(poItem);
          existing.total += orderItem.quantity * orderItem.unitPrice;
        }
        if (win.delivery_days != null) existing.maxDeliveryDays = Math.max(existing.maxDeliveryDays ?? 0, win.delivery_days);
        if (!existing.paymentTerms && win.payment_terms) existing.paymentTerms = win.payment_terms;
      } else {
        bySupplier.set(sid, {
          supplierId: sid,
          name: win.supplier.name,
          phone: contactOf(win.supplier),
          items: [orderItem],
          poItems: quantidade > 0 ? [poItem] : [],
          paymentTerms: win.payment_terms ?? null,
          maxDeliveryDays: win.delivery_days ?? null,
          total: quantidade > 0 ? orderItem.quantity * orderItem.unitPrice : 0,
          minimumOrder: win.supplier.minimum_order ?? null,
          message: "",
        });
      }
    });
    return Array.from(bySupplier.values());
  }, [quotation.items, qtdEditada]);

  // Itens da cotação que ficaram sem vencedor: precisam aparecer na conferência,
  // senão o pedido sai incompleto sem ninguém perceber.
  const pendingItems = useMemo(
    () =>
      (quotation.items ?? [])
        .filter((item) => !item.responses?.some((r) => r.is_winner))
        .map((item) => ({
          name: item.ingredient?.name ?? "Item",
          quantity: item.quantity_needed,
          unit: item.unit,
        })),
    [quotation.items]
  );

  /**
   * Valores do modelo `pedido_fornecedor` para um fornecedor.
   *
   * Prazo e pagamento são opcionais no cadastro, e parâmetro vazio faz a Meta
   * recusar o envio inteiro — daí o "A combinar" em vez de string vazia.
   */
  /** Linhas que de fato entram no pedido: as zeradas ficam só na conferência. */
  const linhasAtivas = (o: SupplierOrder) => o.items.filter((i) => i.quantity > 0);

  const valoresPedido = (o: SupplierOrder): string[] => {
    const nomeCasa = pdvSettings?.business_name || settings?.business_name || "";
    const qtd = linhasAtivas(o).length;
    return [
      achatarParametro(o.name),
      achatarParametro(nomeCasa),
      achatarParametro(quotation.request_number) || "sem referência",
      `${qtd} ${qtd === 1 ? "item" : "itens"}`,
      formatBRL(o.total),
      o.maxDeliveryDays != null
        ? `${o.maxDeliveryDays} ${o.maxDeliveryDays === 1 ? "dia" : "dias"}`
        : "A combinar",
      achatarParametro(o.paymentTerms) || "A combinar",
    ];
  };

  const grandTotal = useMemo(
    () => orders.reduce((sum, o) => sum + o.total, 0),
    [orders]
  );

  // Fornecedores cujo pedido não alcança o mínimo que eles aceitam entregar.
  const belowMinimum = useMemo(
    () =>
      orders.filter((o) => o.minimumOrder != null && o.minimumOrder > 0 && o.total < o.minimumOrder),
    [orders]
  );
  const isBelow = (o: SupplierOrder) =>
    o.minimumOrder != null && o.minimumOrder > 0 && o.total < o.minimumOrder;

  // Abaixo do mínimo o avanço custa dois cliques: o primeiro só assume o risco.
  // Não bloqueia — negociar o mínimo por fora é comum e travar levaria o
  // comprador a fechar o pedido fora do sistema.
  const handleConfirm = () => {
    if (orders.every((o) => o.poItems.length === 0)) {
      toast.error("Todos os itens estão zerados. Ajuste ao menos uma quantidade.");
      return;
    }
    if (belowMinimum.length > 0 && !minimumAck) {
      setMinimumAck(true);
      toast.warning(
        belowMinimum.length === 1
          ? `${belowMinimum[0].name} está abaixo do pedido mínimo. Clique de novo para seguir assim.`
          : `${belowMinimum.length} fornecedores abaixo do pedido mínimo. Clique de novo para seguir assim.`,
      );
      return;
    }
    setStep("send");
  };

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      toast.error("Não foi possível abrir a janela de impressão.");
      return;
    }
    const esc = (s: string) =>
      s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    const today = new Date().toLocaleDateString("pt-BR");

    const blocks = orders
      .map(
        (o) => `
        <section>
          <h2>${esc(o.name)}</h2>
          <p class="meta">
            Prazo de entrega: ${o.maxDeliveryDays != null ? `${o.maxDeliveryDays} dia(s)` : "não informado"}
            &nbsp;·&nbsp; Pagamento: ${temTexto(o.paymentTerms) ? esc(o.paymentTerms!) : "não informado"}
          </p>
          <table>
            <thead>
              <tr>
                <th>Item</th><th class="num">Qtd</th><th class="num">Preço unit.</th>
                <th class="num">Subtotal</th><th class="check">Conferido</th>
              </tr>
            </thead>
            <tbody>
              ${linhasAtivas(o)
                .map(
                  (i) => `<tr>
                    <td>${esc(i.ingredientName)}${[i.brand, conservationLabel(i.conservation)]
                      .filter(temTexto)
                      .map((s) => ` <small>(${esc(String(s))})</small>`)
                      .join("")}</td>
                    <td class="num">${i.quantity} ${esc(i.unit)}</td>
                    <td class="num">${formatBRL(i.unitPrice)}</td>
                    <td class="num">${formatBRL(i.quantity * i.unitPrice)}</td>
                    <td class="check"></td>
                  </tr>`
                )
                .join("")}
              <tr class="total">
                <td colspan="3">Total do fornecedor</td>
                <td class="num">${formatBRL(o.total)}</td><td class="check"></td>
              </tr>
            </tbody>
          </table>
        </section>`
      )
      .join("");

    const pending = pendingItems.length
      ? `<section class="pending">
           <h2>Itens sem fornecedor definido</h2>
           <ul>${pendingItems
             .map((i) => `<li>${esc(i.name)} — ${i.quantity} ${esc(i.unit)}</li>`)
             .join("")}</ul>
         </section>`
      : "";

    win.document.write(`<!doctype html>
      <html lang="pt-BR"><head><meta charset="utf-8" />
      <title>Pedido ${esc(quotation.request_number || "")}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, Arial, sans-serif; color: #111; margin: 32px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        h2 { font-size: 15px; margin: 0 0 4px; }
        .head { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
        .meta { color: #555; font-size: 12px; margin: 0 0 8px; }
        section { margin-bottom: 24px; page-break-inside: avoid; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
        th { background: #f3f3f3; }
        .num { text-align: right; white-space: nowrap; }
        .check { width: 90px; }
        .total td { font-weight: 700; background: #fafafa; }
        .grand { font-size: 16px; font-weight: 700; text-align: right; border-top: 2px solid #111; padding-top: 10px; }
        .pending { color: #a15c00; }
        .sign { margin-top: 48px; display: flex; gap: 48px; }
        .sign div { flex: 1; border-top: 1px solid #111; padding-top: 6px; font-size: 12px; color: #555; }
        @media print { body { margin: 12mm; } }
      </style></head>
      <body>
        <div class="head">
          <h1>Pedido de compra · ${esc(quotation.request_number || "")}</h1>
          <p class="meta">
            ${esc(settings?.business_name || "")} &nbsp;·&nbsp; Emitido em ${today}
            &nbsp;·&nbsp; ${orders.length} fornecedor(es)
          </p>
        </div>
        ${blocks}
        ${pending}
        <p class="grand">Total geral: ${formatBRL(grandTotal)}</p>
        <div class="sign">
          <div>Conferido por (recebimento)</div>
          <div>Data / assinatura</div>
        </div>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  // Monta as mensagens padrão quando abre.
  useEffect(() => {
    if (!open) return;
    setStep("review");
    setMinimumAck(false);
    setQtdEditada({});
  }, [open]);

  // Separado do reset acima: mexer numa quantidade refaz a mensagem, mas não
  // pode jogar o comprador de volta para a etapa de conferência.
  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    orders.forEach((o) => {
      next[o.supplierId] = generateWinnerOrderMessage(o.name, linhasAtivas(o), {
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
      .filter((o) => o.phone && o.poItems.length > 0)
      .map((o) => ({
        supplierId: o.supplierId,
        phone: o.phone,
        message: messages[o.supplierId] ?? "",
        // Só usados no número oficial, onde vale o modelo aprovado. São os
        // mesmos valores do preview mostrado na etapa anterior.
        templateParams: valoresPedido(o),
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "review" ? (
              <>
                <ClipboardCheck className="h-5 w-5" />
                Confirmação do pedido
              </>
            ) : (
              <>
                <WhatsAppIcon className="h-5 w-5 text-green-600" />
                Enviar pedido ao(s) fornecedor(es)
              </>
            )}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {step === "review"
              ? "Confira os vencedores antes de fechar. Dá para ajustar a quantidade de cada item aqui mesmo — zero tira o item do pedido. Imprima a lista para quem for receber a mercadoria conferir."
              : "Revise a mensagem que cada fornecedor vai receber e envie."}
          </p>
        </DialogHeader>

        {orders.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum vencedor selecionado ainda. Escolha os vencedores no comparativo.
          </div>
        ) : step === "review" ? (
          <ScrollArea className="max-h-[55vh]">
            <div className="space-y-4 pr-2">
              {pendingItems.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">
                      {pendingItems.length} item(ns) sem vencedor definido
                    </p>
                    <p>
                      {pendingItems
                        .map((i) => `${i.name} (${i.quantity} ${i.unit})`)
                        .join(", ")}{" "}
                      · não entram neste pedido.
                    </p>
                  </div>
                </div>
              )}

              {belowMinimum.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="text-destructive">
                    <p className="font-medium">
                      {belowMinimum.length === 1
                        ? "1 fornecedor abaixo do pedido mínimo"
                        : `${belowMinimum.length} fornecedores abaixo do pedido mínimo`}
                    </p>
                    <p className="text-xs">
                      Ele pode recusar a entrega. Volte ao comparativo para somar mais
                      itens com ele, ou confirme assumindo o risco.
                    </p>
                  </div>
                </div>
              )}

              {orders.map((o) => (
                <div
                  key={o.supplierId}
                  className={`overflow-hidden rounded-lg border ${
                    isBelow(o) ? "border-destructive/50" : ""
                  }`}
                >
                  <div
                    className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${
                      isBelow(o) ? "bg-destructive/5" : "bg-muted/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Entrega:{" "}
                        {o.maxDeliveryDays != null
                          ? `${o.maxDeliveryDays} dia(s)`
                          : "não informada"}{" "}
                        · Pagamento: {temTexto(o.paymentTerms) ? o.paymentTerms : "não informado"}
                      </p>
                      {isBelow(o) && (
                        <p className="text-xs font-medium text-destructive">
                          Pedido mínimo {formatBRL(o.minimumOrder!)} · faltam{" "}
                          {formatBRL(o.minimumOrder! - o.total)}
                        </p>
                      )}
                    </div>
                    <Badge variant={isBelow(o) ? "destructive" : "secondary"}>
                      {formatBRL(o.total)}
                    </Badge>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="px-3 py-1.5 text-left font-medium">Item</th>
                        <th className="px-3 py-1.5 text-right font-medium">Qtd</th>
                        <th className="px-3 py-1.5 text-right font-medium">
                          Preço unit.
                        </th>
                        <th className="px-3 py-1.5 text-right font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {o.items.map((i) => {
                        const foraDoPedido = i.quantity <= 0;
                        return (
                          <tr key={i.itemId} className={foraDoPedido ? "opacity-50" : undefined}>
                            <td className="px-3 py-2">
                              {i.ingredientName}
                              {[i.brand, conservationLabel(i.conservation)]
                                .filter(temTexto)
                                .map((s) => (
                                  <span key={String(s)} className="text-muted-foreground">
                                    {" "}
                                    · {s}
                                  </span>
                                ))}
                              {foraDoPedido && (
                                <span className="ml-1 text-xs font-medium text-muted-foreground">
                                  · fora do pedido
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Input
                                  inputMode="decimal"
                                  value={qtdEditada[i.itemId] ?? String(i.quantity)}
                                  onChange={(e) =>
                                    setQtdEditada((v) => ({ ...v, [i.itemId]: e.target.value }))
                                  }
                                  onFocus={(e) => e.target.select()}
                                  className="h-8 w-[72px] text-right"
                                  aria-label={`Quantidade de ${i.ingredientName}`}
                                />
                                <span className="w-8 text-left text-xs text-muted-foreground">
                                  {i.unit}
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              {formatBRL(i.unitPrice)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                              {formatBRL(i.quantity * i.unitPrice)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {!o.phone && (
                    <div className="flex items-center gap-1.5 border-t px-3 py-2 text-xs text-amber-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Sem WhatsApp cadastrado · não será enviado automaticamente.
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-3 py-2">
                <span className="text-sm font-medium">Total geral do pedido</span>
                <span className="text-lg font-semibold">{formatBRL(grandTotal)}</span>
              </div>
            </div>
          </ScrollArea>
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
                  {canalOficial && (
                    <TemplatePreview template={TEMPLATE_PEDIDO} valores={valoresPedido(o)} contato={o.name} />
                  )}

                  <div className="space-y-1">
                    {canalOficial && (
                      <p className="text-[11px] text-muted-foreground">
                        Texto abaixo: usado só no envio pelo número do próprio
                        estabelecimento (QR Code). Pelo número oficial, vale o modelo
                        acima — e a lista completa dos produtos vai logo depois, quando o
                        fornecedor tocar em confirmar.
                      </p>
                    )}
                    <Textarea
                      rows={7}
                      value={messages[o.supplierId] ?? ""}
                      onChange={(e) => setMessages((m) => ({ ...m, [o.supplierId]: e.target.value }))}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {step === "review" ? (
            <>
              <Button
                variant="outline"
                onClick={handlePrint}
                disabled={orders.length === 0}
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir conferência
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={orders.length === 0}
                  variant={belowMinimum.length > 0 && !minimumAck ? "destructive" : "default"}
                >
                  {belowMinimum.length > 0 && !minimumAck
                    ? "Confirmar mesmo assim"
                    : "Confirmar pedido"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("review")}
                disabled={sending}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Voltar à conferência
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || orders.every((o) => !o.phone)}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Enviar pedido
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
