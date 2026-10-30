// Impressão de DANFE NFC-e (via URL Nuvem Fiscal) e recibo não-fiscal 80mm
import { groupChargeItems } from "@/lib/group-charge-items";

interface NonFiscalReceiptParams {
  business: { name?: string; cnpj?: string; address?: string; phone?: string };
  /** Cabeçalho hierárquico (preferido). */
  header?: { mesa: string; comanda: string };
  /** @deprecated mantido por compatibilidade — usar header */
  identifier?: string;
  items: Array<{ product_name: string; quantity: number; unit_price: number; subtotal: number }>;
  subtotal: number;
  desconto?: number;
  taxa_servico?: number;
  total: number;
  forma_pagamento: string;
  valor_pago?: number;
  troco?: number;
}

export function openPrintIframe(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 200);
  };
  doc.open();
  doc.write(html);
  doc.close();
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function printNonFiscalReceipt(p: NonFiscalReceiptParams) {
  const receiptItems = groupChargeItems(p.items.map((item, index) => ({ ...item, id: String(index) })));
  const now = new Date().toLocaleString("pt-BR");
  const pagamentoLabel: Record<string, string> = {
    dinheiro: "DINHEIRO",
    cartao: "CARTÃO",
    cartao_credito: "CARTÃO CRÉDITO",
    cartao_debito: "CARTÃO DÉBITO",
    pix: "PIX",
  };
  const pago = pagamentoLabel[p.forma_pagamento] || p.forma_pagamento.toUpperCase();

  // Cabeçalho hierárquico: MESA destacada, comanda menor.
  // Suporta legado `identifier` (string única).
  const mesa = (p.header?.mesa ?? "").toString().trim();
  const comandaName = (p.header?.comanda ?? "").toString().trim();
  const legacy = (p.identifier ?? "").toString().trim();
  const headerMesa = mesa || legacy || "AVULSA";
  const headerComanda = comandaName || (legacy && legacy !== headerMesa ? legacy : "");

  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Recibo</title>
<style>
  @page { size: auto; margin: 2mm; }
  * { box-sizing: border-box; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Texto fino em Courier perdia definição na rasterização do driver térmico.
     A conta usa traço forte inclusive nos itens, quantidades e valores. */
  /* Respeita a área útil do driver, menor que a bobina, e resguarda os centavos. */
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 700; line-height: 1.3; width: 100%; max-width: 70mm; margin: 0; padding: 0 1mm; }
  .center { text-align: center; }
  .right { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 4px; }
  .row > span:first-child { min-width: 0; overflow-wrap: anywhere; }
  .row > span:last-child { flex-shrink: 0; margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; font: inherit; }
  td { padding: 2px 0; vertical-align: top; font-weight: 700; }
  .bold { font-weight: 800; }
  .lg { font-size: 16px; }
  .xl { font-size: 22px; line-height: 1.1; letter-spacing: 1px; }
  .md { font-size: 14px; }
  .sm { font-size: 12px; }
  .item-name { word-break: break-word; overflow-wrap: anywhere; }
</style></head><body>
  <div class="center bold lg">${p.business.name || "Estabelecimento"}</div>
  ${p.business.cnpj ? `<div class="center sm">CNPJ: ${p.business.cnpj}</div>` : ""}
  ${p.business.address ? `<div class="center sm">${p.business.address}</div>` : ""}
  ${p.business.phone ? `<div class="center sm">Tel: ${p.business.phone}</div>` : ""}
  <hr />
  <div class="center bold xl">${String(headerMesa).toUpperCase()}</div>
  ${headerComanda ? `<div class="center bold md">${headerComanda}</div>` : ""}
  <hr />
  <div class="center bold">RECIBO NÃO-FISCAL</div>
  <div class="center sm">${now}</div>
  <hr />
  <table>
    ${receiptItems.map(({ item: i, quantity, subtotal }) => `
      <tr><td colspan="2" class="item-name">${i.product_name}</td></tr>
      <tr><td colspan="2"><div class="row">
        <span class="sm">${quantity} x ${fmt(i.unit_price)}</span>
        <span class="right">${fmt(subtotal)}</span>
      </div></td></tr>
    `).join("")}
  </table>
  <hr />
  <div class="row"><span>Subtotal</span><span>${fmt(p.subtotal)}</span></div>
  ${p.desconto && p.desconto > 0 ? `<div class="row"><span>Desconto</span><span>-${fmt(p.desconto)}</span></div>` : ""}
  ${p.taxa_servico && p.taxa_servico > 0 ? `<div class="row"><span>Taxa Serviço</span><span>${fmt(p.taxa_servico)}</span></div>` : ""}
  <div class="row bold lg"><span>TOTAL</span><span>${fmt(p.total)}</span></div>
  <hr />
  <div class="row"><span>Pagamento</span><span>${pago}</span></div>
  ${p.valor_pago ? `<div class="row"><span>Recebido</span><span>${fmt(p.valor_pago)}</span></div>` : ""}
  ${p.troco && p.troco > 0 ? `<div class="row bold"><span>Troco</span><span>${fmt(p.troco)}</span></div>` : ""}
  <hr />
  <div class="center sm">Este documento NÃO possui validade fiscal</div>
  <div class="center sm">Obrigado pela preferência!</div>
  <br /><br />
</body></html>`;

  openPrintIframe(html);
}

export function printDanfeFromUrl(pdfUrl: string) {
  // DANFE NFC-e PDF (térmico). Abre em iframe e imprime.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = pdfUrl;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // Fallback: abre nova aba
        window.open(pdfUrl, "_blank");
      }
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 500);
  };
}
