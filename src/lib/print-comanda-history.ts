import type { ClosedComandaDetail } from "@/lib/comanda-history";
import { historyPaymentSummary, historyTimestamp } from "@/lib/comanda-history";
import { formatBRL } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/financial/payment-method-keys";
import { openPrintIframe } from "@/lib/print-fiscal-receipt";
import { groupChargeItems } from "@/lib/group-charge-items";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function buildClosedComandaReceipt(detail: ClosedComandaDetail) {
  const payment = historyPaymentSummary(detail);
  const order = detail.atendimento;
  const location = order ? order.balcao ? "BALCÃO" : order.mesa ? `MESA ${order.mesa.replace(/^mesa\s*/i, "")}` : "MESA NÃO IDENTIFICADA" : "BALCÃO / AVULSA";
  const lines = groupChargeItems(detail.itens.map((item) => ({
    id: item.id, product_name: item.produto, quantity: item.quantidade, unit_price: item.preco_unitario,
    subtotal: item.subtotal, notes: item.observacoes, parent_item_id: item.parent_item_id, is_composite_child: item.complemento,
  })));
  const row = (label: string, value: string) => `<div class="row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Reimpressão comanda ${esc(detail.comanda.numero)}</title>
  <style>@page{size:auto;margin:2mm}*{box-sizing:border-box;color:#000!important}body{font:700 13px/1.3 Arial,sans-serif;width:100%;max-width:70mm;margin:0;padding:0 1mm}.center{text-align:center}.large{font-size:19px}.small{font-size:11px}hr{border:0;border-top:1px dashed #000;margin:6px 0}.row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:3px}.row strong{white-space:nowrap;margin-left:auto}p{margin:3px 0;overflow-wrap:anywhere}section{margin:7px 0}</style></head><body>
  <div class="center"><p>${esc(detail.business?.name || "Estabelecimento")}</p>
  ${detail.business?.cnpj ? `<p class="small">CNPJ: ${esc(detail.business.cnpj)}</p>` : ""}
  ${detail.business?.address ? `<p class="small">${esc(detail.business.address)}</p>` : ""}
  <hr><p class="large">${esc(location)}</p><p>COMANDA #${esc(detail.comanda.numero)}</p><p>${esc(detail.comanda.cliente || "Sem identificação")}</p>
  <p>REIMPRESSÃO · RECIBO NÃO FISCAL</p><p class="small">Fechamento: ${esc(historyTimestamp(detail.comanda.fechada_em))}</p></div><hr>
  ${lines.map((group) => `<section><p>${group.item.is_composite_child ? "↳ " : ""}${esc(group.item.product_name)}</p>${row(`${group.quantity} x ${formatBRL(group.item.unit_price)}`, group.item.is_composite_child ? "Incluído" : formatBRL(group.subtotal))}${group.item.notes ? `<p class="small">Obs: ${esc(group.item.notes)}</p>` : ""}</section>`).join("")}
  <hr>${row("Consumo desta comanda", formatBRL(detail.comanda.consumo))}
  ${order && Number(order.desconto) > 0 ? row("Desconto do atendimento", formatBRL(order.desconto!)) : ""}
  ${order && Number(order.taxa_servico_paga ?? order.taxa_servico) > 0 ? row("Taxa de serviço do atendimento", formatBRL(order.taxa_servico_paga ?? order.taxa_servico!)) : ""}
  ${detail.cashback_usado > 0 ? row("Cashback usado na comanda", formatBRL(detail.cashback_usado)) : ""}<hr>
  <p>PAGAMENTOS ${payment.scope === "atendimento" ? "DO ATENDIMENTO" : "DA COMANDA"}</p>
  ${payment.scope === "atendimento" ? `<p class="small">Atendimento ${esc(order?.numero)}: valores podem incluir outras comandas e pagamentos parciais.</p>` : ""}
  ${payment.payments.length ? payment.payments.map((p) => `${row(paymentMethodLabel(p.forma), formatBRL(p.valor))}${Number(p.recebido) > 0 ? `<p class="small">Recebido: ${esc(formatBRL(p.recebido!))} · Troco: ${esc(formatBRL(p.troco || 0))}</p>` : ""}`).join("") + row("TOTAL DOS PAGAMENTOS", formatBRL(payment.total!)) : `<p class="small">Pagamento sem vínculo preservado no registro antigo.</p>`}
  <hr><p class="center small">Este documento NÃO possui validade fiscal.<br>Reimpressão para conferência. Não gera nova cobrança.</p><br><br></body></html>`;
}

export function printClosedComandaReceipt(detail: ClosedComandaDetail) {
  openPrintIframe(buildClosedComandaReceipt(detail));
}
