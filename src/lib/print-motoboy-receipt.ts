import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import type { DeliveryOrder } from "@/hooks/use-delivery-orders";

const METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  dinheiro: "Dinheiro",
  pix: "PIX",
  credit: "Cartão Crédito",
  credito: "Cartão Crédito",
  debit: "Cartão Débito",
  debito: "Cartão Débito",
  voucher: "Vale-refeição",
};

function methodLabel(m: string) {
  return METHOD_LABELS[m] ?? m;
}

function formatPhone(phone?: string | null) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function escape(s: string | null | undefined) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function printMotoboyReceipt(order: DeliveryOrder) {
  const w = window.open("", "_blank", "width=380,height=720");
  if (!w) return;

  const isPickup = order.order_type === "pickup";
  const items = order.delivery_order_items ?? [];
  const dateStr = format(new Date(order.created_at), "dd/MM/yyyy HH:mm", {
    locale: ptBR,
  });
  const isPaid = order.payment_status === "paid";

  const itemsHtml = items
    .map((it) => {
      const opts =
        (it.delivery_order_item_options ?? [])
          .map((op) => {
            const qty = Number(op.quantity || 1);
            const qtyPrefix = qty > 1 ? `${qty}× ` : "";
            const totalAdj = Number(op.price_adjustment) * qty;
            return `<div class="opt">+ ${escape(op.option_name)}: ${qtyPrefix}${escape(op.item_name)}${
              totalAdj > 0 ? ` (${formatBRL(totalAdj)})` : ""
            }</div>`;
          })
          .join("") || "";
      const notes = it.notes
        ? `<div class="notes">Obs: ${escape(it.notes)}</div>`
        : "";
      return `
        <div class="item">
          <div class="row">
            <span class="qty">${it.quantity}×</span>
            <span class="name">${escape(it.product_name)}</span>
            <span class="price">${formatBRL(Number(it.subtotal))}</span>
          </div>
          ${opts}
          ${notes}
        </div>
      `;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Comanda Delivery #${escape(order.order_number)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; margin: 0; padding: 6px; }
  h1 { font-size: 16px; margin: 0 0 4px; text-align: center; }
  .sub { text-align: center; font-size: 11px; margin-bottom: 6px; }
  .order-number { font-size: 17px; font-weight: bold; margin: 2px 0 4px; }
  .sec { border-top: 1px dashed #000; padding: 6px 0; }
  .label { font-weight: bold; text-transform: uppercase; font-size: 11px; margin-bottom: 2px; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .qty { width: 28px; flex-shrink: 0; }
  .name { flex: 1; }
  .price { white-space: nowrap; }
  .opt, .notes { font-size: 11px; padding-left: 30px; }
  .notes { font-style: italic; }
  .item { margin-bottom: 4px; }
  .total { font-size: 14px; font-weight: bold; }
  .big { font-size: 13px; font-weight: bold; }
  .center { text-align: center; }
  .badge { display: inline-block; border: 1px solid #000; padding: 1px 6px; font-size: 11px; font-weight: bold; }
  .footer { margin-top: 8px; text-align: center; font-size: 10px; }
</style>
</head>
<body>
  <h1>COMANDA ${isPickup ? "RETIRADA" : "DELIVERY"}</h1>
  <div class="sub">
    <div class="order-number">Pedido #${escape(order.order_number)}</div>
    ${dateStr}
  </div>

  <div class="sec">
    <div class="label">Cliente</div>
    <div class="big">${escape(order.customer_name)}</div>
    <div>${formatPhone(order.customer_phone)}</div>
  </div>

  <div class="sec">
    <div class="label">${isPickup ? "Retirada" : "Endereço de Entrega"}</div>
    ${
      isPickup
        ? `<div class="big">RETIRADA NO BALCÃO</div>`
        : `<div>${escape(order.delivery_address_text) || "—"}</div>`
    }
  </div>

  <div class="sec">
    <div class="label">Itens (${items.length})</div>
    ${itemsHtml}
  </div>

  <div class="sec">
    <div class="row"><span>Subtotal</span><span>${formatBRL(Number(order.subtotal))}</span></div>
    ${
      Number(order.delivery_fee) > 0
        ? `<div class="row"><span>Taxa entrega</span><span>${formatBRL(Number(order.delivery_fee))}</span></div>`
        : ""
    }
    ${
      Number(order.discount) > 0
        ? `<div class="row"><span>Desconto${order.coupon_code ? ` (${escape(order.coupon_code)})` : ""}</span><span>- ${formatBRL(Number(order.discount))}</span></div>`
        : ""
    }
    <div class="row total"><span>TOTAL</span><span>${formatBRL(Number(order.total))}</span></div>
  </div>

  <div class="sec">
    <div class="label">Pagamento</div>
    <div class="row">
      <span>${escape(methodLabel(order.payment_method))}</span>
      <span class="badge">${isPaid ? "PAGO ONLINE" : "A RECEBER"}</span>
    </div>
    ${
      order.change_for && !isPaid
        ? `<div class="row"><span>Troco para</span><span>${formatBRL(Number(order.change_for))}</span></div>
           <div class="row"><span>Levar troco</span><span>${formatBRL(Math.max(0, Number(order.change_for) - Number(order.total)))}</span></div>`
        : ""
    }
  </div>

  ${
    order.notes
      ? `<div class="sec"><div class="label">Observações</div><div>${escape(order.notes)}</div></div>`
      : ""
  }

  <div class="footer">
    Comanda do motoboy — ${dateStr}
  </div>

  <script>
    window.onload = function() {
      window.focus();
      window.print();
      setTimeout(function() { window.close(); }, 500);
    };
  </script>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}
