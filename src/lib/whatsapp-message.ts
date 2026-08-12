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
  /** resfriado | congelado | ambiente. */
  conservation?: string | null;
  deliveryDays?: number | null;
  paymentTerms?: string | null;
}

const CONSERVATION_LABELS: Record<string, string> = {
  resfriado: "Resfriado",
  congelado: "Congelado",
  ambiente: "Ambiente (seco)",
};

/** Rótulo legível da conservação, ou null quando não informada. */
export function conservationLabel(value?: string | null): string | null {
  if (!value) return null;
  return CONSERVATION_LABELS[value] ?? value;
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
    // Marca e conservação definem QUAL produto foi fechado: o fornecedor pode
    // ter ofertado o mesmo item em várias marcas, resfriado e congelado.
    if (it.brand) m += `   Marca: ${it.brand}\n`;
    const cons = conservationLabel(it.conservation);
    if (cons) m += `   Conservação: ${cons}\n`;
  });

  m += `\n💰 *Total: ${formatBRL(total)}*\n`;
  if (prazo != null) m += `📦 Prazo de entrega: ${prazo} dia${prazo === 1 ? "" : "s"}\n`;
  if (pagamento) m += `💳 Pagamento: ${pagamento}\n`;
  if (opts?.notes) m += `📝 ${opts.notes}\n`;
  m += `\nPor favor, confirme o pedido. Obrigado!`;
  return m;
}

/** Contexto do template configurado em Compras > Configurações. */
export interface QuotationTemplateContext {
  /** default_message_template do pdv_purchase_settings. Vazio = texto padrão. */
  template?: string | null;
  supplierName?: string;
  quotationDate?: Date;
}

/** Troca {variavel} pelo valor. O que não conhecemos fica como está, para o
 *  usuário enxergar que digitou uma variável inexistente em vez de sumir. */
function renderTemplateVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (original, key: string) =>
    key in vars ? vars[key] : original
  );
}

/**
 * Gera mensagem de solicitação de cotação.
 *
 * Três comportamentos, nesta ordem:
 * 1. Sem template configurado: mensagem padrão do sistema, como sempre foi.
 * 2. Template SEM {itens}: mantém a abertura (saudação com o nome da casa,
 *    referência e lista de produtos) e troca só o encerramento pelo template.
 *    É o caso comum, em que o lojista escreve prazo e assinatura.
 * 3. Template COM {itens}: o template é a mensagem inteira e manda em tudo,
 *    inclusive na posição da lista.
 *
 * O link público do formulário é anexado depois, pela edge send-quotation-whatsapp.
 */
export function generateQuotationMessage(
  items: QuotationItem[],
  deadline: Date,
  businessName?: string,
  requestNumber?: string,
  ctx?: QuotationTemplateContext
): string {
  const formattedDeadline = deadline.toLocaleDateString('pt-BR');

  const itemsList = items
    .map((item, index) => `${index + 1}. ${item.ingredientName}: ${item.quantity} ${item.unit}`)
    .join('\n');

  let header = `Olá! `;
  if (businessName) {
    header += `Aqui é do *${businessName}*.\n`;
  }
  if (requestNumber) {
    header += `📋 *Ref.: ${requestNumber}*\n\n`;
  } else {
    header += `\n`;
  }
  header += `Estamos solicitando cotação para os seguintes produtos:\n\n`;
  header += `${itemsList}\n`;

  const template = ctx?.template?.trim();
  if (template) {
    const rendered = renderTemplateVars(template, {
      fornecedor_nome: ctx?.supplierName ?? '',
      cotacao_numero: requestNumber ?? '',
      prazo_resposta: formattedDeadline,
      estabelecimento_nome: businessName ?? '',
      data_cotacao: (ctx?.quotationDate ?? new Date()).toLocaleDateString('pt-BR'),
      itens: itemsList,
    });

    return template.includes('{itens}') ? rendered : `${header}\n${rendered}`;
  }

  let message = header;
  message += `\nPreencha os preços pelo link abaixo (é rápido e não precisa responder por aqui).\n`;
  message += `Aguardamos retorno até ${formattedDeadline}.\n`;
  message += `Obrigado!`;
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

