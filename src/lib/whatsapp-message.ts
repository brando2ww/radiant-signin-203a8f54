import { formatBRL } from "@/lib/format";
// Utilitário para geração de links e mensagens WhatsApp

interface QuotationItem {
  ingredientName: string;
  quantity: number;
  unit: string;
}

interface OrderItem {
  ingredientName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

interface PurchaseOrder {
  orderNumber: string;
  total: number;
  expectedDelivery?: Date;
}

/**
 * Formata número de telefone para o padrão WhatsApp
 */
export function formatPhoneForWhatsApp(phone: string): string {
  const cleanPhone = phone.replace(/\D/g, '');
  // Adiciona código do Brasil se não tiver
  return cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
}

/**
 * Gera link do WhatsApp com mensagem
 */
export function generateWhatsAppLink(phone: string, message: string): string {
  const phoneWithCountry = formatPhoneForWhatsApp(phone);
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${phoneWithCountry}?text=${encodedMessage}`;
}

/** Item vencedor de uma cotação, para montar o pedido ao fornecedor. */
export interface WinnerOrderItem {
  ingredientName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  brand?: string | null;
  deliveryDays?: number | null;
  paymentTerms?: string | null;
}

/**
 * Monta o PEDIDO ao fornecedor vencedor, o mais completo possível a partir do
 * que ele preencheu na cotação (preço, marca, prazo, pagamento).
 */
export function generateWinnerOrderMessage(
  supplierName: string | null,
  items: WinnerOrderItem[],
  opts?: { businessName?: string; requestNumber?: string; notes?: string },
): string {
  const total = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  // prazo/pagamento predominantes (usa o do primeiro item que tiver)
  const prazo = items.find((i) => i.deliveryDays != null)?.deliveryDays ?? null;
  const pagamento = items.find((i) => i.paymentTerms)?.paymentTerms ?? null;

  let m = `Olá${supplierName ? `, ${supplierName}` : ""}! `;
  if (opts?.businessName) m += `Aqui é do *${opts.businessName}*. `;
  m += `Fechamos o pedido com você`;
  if (opts?.requestNumber) m += ` (ref. ${opts.requestNumber})`;
  m += `:\n\n`;

  items.forEach((it, i) => {
    const sub = it.quantity * it.unitPrice;
    m += `${i + 1}. *${it.ingredientName}*\n`;
    m += `   ${it.quantity} ${it.unit} × ${formatBRL(it.unitPrice)} = ${formatBRL(sub)}\n`;
    if (it.brand) m += `   Marca: ${it.brand}\n`;
  });

  m += `\n💰 *Total: ${formatBRL(total)}*\n`;
  if (prazo != null) m += `📦 Prazo de entrega: ${prazo} dia${prazo === 1 ? "" : "s"}\n`;
  if (pagamento) m += `💳 Pagamento: ${pagamento}\n`;
  if (opts?.notes) m += `📝 ${opts.notes}\n`;
  m += `\nPor favor, confirme o pedido. Obrigado!`;
  return m;
}

/**
 * Gera mensagem de solicitação de cotação
 */
export function generateQuotationMessage(
  items: QuotationItem[],
  deadline: Date,
  businessName?: string,
  requestNumber?: string
): string {
  const formattedDeadline = deadline.toLocaleDateString('pt-BR');
  
  let message = `Olá! `;
  
  if (businessName) {
    message += `Aqui é do *${businessName}*.\n`;
  }
  
  if (requestNumber) {
    message += `📋 *Ref.: ${requestNumber}*\n\n`;
  } else {
    message += `\n`;
  }
  
  message += `Estamos solicitando cotação para os seguintes produtos:\n\n`;

  items.forEach((item, index) => {
    message += `${index + 1}. ${item.ingredientName}: ${item.quantity} ${item.unit}\n`;
  });

  message += `\nPreencha os preços pelo link abaixo (é rápido e não precisa responder por aqui).\n`;
  message += `Aguardamos retorno até ${formattedDeadline}.\n`;
  message += `Obrigado!`;
  // O link público do formulário é anexado pela edge send-quotation-whatsapp.
  return message;
}

/**
 * Gera mensagem de pedido de compra
 */
export function generateOrderMessage(
  order: PurchaseOrder,
  items: OrderItem[],
  businessName?: string
): string {
  let message = `Olá! `;
  
  if (businessName) {
    message += `Aqui é do ${businessName}. `;
  }
  
  message += `Gostaríamos de confirmar o seguinte pedido:\n\n`;
  message += `📋 *PEDIDO ${order.orderNumber}*\n\n`;
  
  items.forEach((item) => {
    const total = item.quantity * item.unitPrice;
    message += `• ${item.ingredientName}: ${item.quantity} ${item.unit} x ${formatBRL(item.unitPrice)} = ${formatBRL(total)}\n`;
  });
  
  message += `\n💰 *Total: ${formatBRL(order.total)}*\n`;
  
  if (order.expectedDelivery) {
    const formattedDelivery = order.expectedDelivery.toLocaleDateString('pt-BR');
    message += `📅 Entrega prevista: ${formattedDelivery}\n`;
  }
  
  message += `\nPor favor, confirme o recebimento deste pedido.\n`;
  message += `Obrigado!`;
  
  return message;
}

/**
 * Abre WhatsApp em nova aba
 */
export function openWhatsApp(phone: string, message: string): void {
  const link = generateWhatsAppLink(phone, message);
  window.open(link, '_blank');
}

/**
 * Formata valor em reais (padrão BR).
 * @deprecated Importe `formatBRL` (ou `formatCurrency`) de `@/lib/format`.
 */
export { formatBRL as formatCurrency } from "./format";

