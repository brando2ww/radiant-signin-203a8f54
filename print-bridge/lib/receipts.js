"use strict";

// Renderização ESC/POS. Módulo puro: entra payload, sai Buffer. Nenhuma rede,
// nenhum estado, nenhum I/O — é o que permite testar por snapshot no macOS,
// sem impressora e sem Windows (ver tools/ e test/receipts.test.js).

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function stripAccents(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatDateTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildReceipt({ mesa, comanda, subheader, body, centerName, establishmentName }) {
  const chunks = [];
  const push = (...bytes) => chunks.push(Buffer.from(bytes));
  const text = (s) => chunks.push(Buffer.from(stripAccents(s), "utf8"));
  const line = () => push(LF);

  push(ESC, 0x40);
  // Estabelecimento
  push(ESC, 0x61, 0x01);
  push(GS, 0x21, 0x11);
  text(establishmentName || "Estabelecimento");
  line();
  push(GS, 0x21, 0x00);
  text("================================");
  line();

  // MESA — destaque (largura+altura 4x)
  push(GS, 0x21, 0x33);
  text(String(mesa || "AVULSA").toUpperCase());
  line();

  // Comanda — destaque médio (2x)
  if (comanda) {
    push(GS, 0x21, 0x11);
    text(String(comanda));
    line();
  }
  push(GS, 0x21, 0x00);
  push(ESC, 0x61, 0x00);

  text("================================");
  line();
  (subheader || []).forEach((l) => {
    text(l);
    line();
  });
  text("--------------------------------");
  line();
  body.forEach((item, idx) => {
    if (idx > 0) {
      text("--------------------------------");
      line();
    }
    // Rótulo do grupo de composição (ex.: "Etapa 1") logo antes do filho
    if (item.composition_group_label) {
      push(GS, 0x21, 0x00);
      text(`[${String(item.composition_group_label).toUpperCase()}]`);
      line();
    }
    push(GS, 0x21, 0x01);
    text(`${item.quantity}x ${String(item.product_name).toUpperCase()}`);
    line();
    push(GS, 0x21, 0x00);
    if (!item.composition_group_label && item.parent_product_name) {
      text(`  (parte de: ${String(item.parent_product_name).toUpperCase()})`);
      line();
    }

    if (item.notes) {
      text(`  OBS: ${item.notes}`);
      line();
    }
    if (item.modifiers && typeof item.modifiers === "object") {
      const mods = Array.isArray(item.modifiers)
        ? item.modifiers
        : Object.values(item.modifiers);
      mods.flat().forEach((m) => {
        if (!m) return;
        const label = typeof m === "string" ? m : m.name || m.label || JSON.stringify(m);
        text(`  + ${label}`);
        line();
      });
    }
  });
  text("================================");
  line();
  if (centerName) {
    push(ESC, 0x61, 0x01);
    text(`>> ${centerName} <<`);
    line();
    push(ESC, 0x61, 0x00);
  }
  push(LF, LF, LF, LF);
  push(GS, 0x56, 0x41, 0x05);

  return Buffer.concat(chunks);
}

/**
 * QR Code em ESC/POS (GS ( k), modelo 2.
 *
 * O DANFE da NFC-e é obrigado por lei a trazer o QR Code — sem isso o cupom
 * não vale. Não dava para reaproveitar nenhum renderer existente porque o
 * bridge só imprimia texto.
 */
function escposQrCode(data, size = 6) {
  const bytes = Buffer.from(String(data || ""), "utf8");
  if (bytes.length === 0) return Buffer.alloc(0);

  const chunks = [];
  // Modelo 2
  chunks.push(Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));
  // Tamanho do módulo (1..16) — 6 dá ~25mm em 80mm, legível por celular.
  chunks.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size]));
  // Correção de erro nível M (49=L, 50=M, 51=Q, 52=H)
  chunks.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]));
  // Armazena os dados: pL/pH contam os bytes + 3
  const len = bytes.length + 3;
  chunks.push(Buffer.from([GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30]));
  chunks.push(bytes);
  // Imprime o símbolo
  chunks.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]));
  return Buffer.concat(chunks);
}

/** Chave de acesso em blocos de 4, como manda o layout do DANFE. */
function formatChaveAcesso(chave) {
  const d = String(chave || "").replace(/\D/g, "");
  return d.replace(/(.{4})/g, "$1 ").trim();
}

const DANFE_FORMA_PAGAMENTO = {
  "01": "Dinheiro",
  "02": "Cheque",
  "03": "Cartao de credito",
  "04": "Cartao de debito",
  "05": "Credito loja",
  "10": "Vale-refeicao",
  "11": "Vale-alimentacao",
  "15": "Boleto",
  "17": "PIX",
  "99": "Outros",
};

/**
 * DANFE NFC-e simplificado, 80mm.
 *
 * Layout conforme o Manual de Padrões Técnicos do DANFE-NFC-e: itens, totais,
 * forma de pagamento, dados do consumidor, chave de acesso e QR Code.
 */
function buildDanfeReceipt(p) {
  const chunks = [];
  const push = (...bytes) => chunks.push(Buffer.from(bytes));
  const raw = (buf) => chunks.push(buf);
  const text = (s) => chunks.push(Buffer.from(stripAccents(String(s ?? "")), "utf8"));
  const line = () => push(LF);
  const divider = (c = "-") => { text(c.repeat(32)); line(); };
  const fmtBRL = (v) => Number(v || 0).toFixed(2).replace(".", ",");
  const center = (on) => push(ESC, 0x61, on ? 0x01 : 0x00);
  const bold = (on) => push(GS, 0x21, on ? 0x01 : 0x00);
  const padRow = (label, val, isBold) => {
    const l = stripAccents(String(label)).slice(0, 20);
    const r = String(val).slice(-12);
    if (isBold) bold(true);
    text(l.padEnd(20) + r.padStart(12));
    line();
    if (isBold) bold(false);
  };

  push(ESC, 0x40); // reset

  center(true);
  bold(true);
  text("DANFE NFC-e");
  line();
  bold(false);
  text("Documento Auxiliar da Nota");
  line();
  text("Fiscal de Consumidor Eletronica");
  line();
  if (p.reimpressao) {
    line();
    bold(true);
    text(">> REIMPRESSAO <<");
    line();
    bold(false);
  }
  center(false);
  divider("=");

  // Itens: código | descrição / qtd x unitário = total
  text("ITEM DESCRICAO");
  line();
  text("QTD UN  VL UNIT      VL TOTAL");
  line();
  divider("-");

  (p.items || []).forEach((it, idx) => {
    const total = Number(it.valor_bruto || 0) - Number(it.valor_desconto || 0);
    text(`${String(idx + 1).padStart(3, "0")} ${stripAccents(String(it.descricao || "")).slice(0, 27)}`);
    line();
    const q = Number(it.quantidade || 0);
    const qtdStr = (Number.isInteger(q) ? String(q) : q.toFixed(3)).padStart(5);
    const un = String(it.unidade || "UN").slice(0, 3).padEnd(3);
    const vu = fmtBRL(it.valor_unitario).padStart(9);
    const vt = fmtBRL(total).padStart(11);
    text(`${qtdStr} ${un}${vu}${vt}`);
    line();
    if (Number(it.valor_desconto) > 0) {
      padRow("  Desconto item", "-" + fmtBRL(it.valor_desconto));
    }
  });

  divider("-");
  const qtdItens = (p.items || []).length;
  padRow("Qtd. total de itens", String(qtdItens));
  if (Number(p.valor_produtos) > 0) padRow("Valor dos produtos", fmtBRL(p.valor_produtos));
  if (Number(p.valor_desconto) > 0) padRow("Desconto", "-" + fmtBRL(p.valor_desconto));
  if (Number(p.valor_frete) > 0) padRow("Taxa de entrega", fmtBRL(p.valor_frete));
  if (Number(p.valor_outras_despesas) > 0) padRow("Outras despesas", fmtBRL(p.valor_outras_despesas));
  push(GS, 0x21, 0x11);
  const totalLabel = "TOTAL R$";
  const totalVal = fmtBRL(p.valor_total);
  text(totalLabel.padEnd(8) + totalVal.padStart(8));
  line();
  push(GS, 0x21, 0x00);

  divider("-");
  // 32 colunas é a largura do papel de 80mm; passar disso quebra a linha.
  text("FORMA PAGAMENTO       VALOR PAGO");
  line();
  (p.formas_pagamento || []).forEach((f) => {
    const nome = DANFE_FORMA_PAGAMENTO[String(f.forma_pagamento)] || "Outros";
    padRow(nome, fmtBRL(f.valor));
  });

  divider("=");
  center(true);
  if (p.destinatario_documento) {
    text(`CONSUMIDOR CPF: ${p.destinatario_documento}`);
    line();
    if (p.destinatario_nome) { text(stripAccents(p.destinatario_nome)); line(); }
  } else {
    text("CONSUMIDOR NAO IDENTIFICADO");
    line();
  }
  divider("-");

  if (p.numero || p.serie) {
    text(`Numero: ${p.numero || "-"}   Serie: ${p.serie || "-"}`);
    line();
  }
  text(formatDateTime(p.emitida_em ? new Date(p.emitida_em) : new Date()));
  line();
  line();
  text("Consulte pela chave de acesso em");
  line();
  // A URL de consulta da SEFAZ passa de 32 colunas; sem quebrar, a impressora
  // corta o resto e o cliente fica sem o endereço.
  stripAccents(p.url_consulta || "www.nfce.fazenda.gov.br")
    .match(/.{1,32}/g)
    ?.forEach((parte) => { text(parte); line(); });
  line();
  bold(true);
  text("CHAVE DE ACESSO");
  line();
  bold(false);
  // A chave quebra em duas linhas de 44 caracteres formatados.
  const chaveFmt = formatChaveAcesso(p.chave_acesso);
  chaveFmt.match(/.{1,29}/g)?.forEach((parte) => { text(parte.trim()); line(); });

  if (p.protocolo) {
    line();
    text(`Protocolo: ${p.protocolo}`);
    line();
  }

  // QR Code — obrigatório no DANFE NFC-e.
  if (p.qrcode) {
    line();
    raw(escposQrCode(p.qrcode, 6));
    line();
  } else {
    line();
    text("(QR Code indisponivel)");
    line();
  }

  center(false);
  push(LF, LF, LF, LF);
  push(GS, 0x56, 0x41, 0x05); // corte parcial
  return Buffer.concat(chunks);
}

function buildCaixaReceipt(p) {
  const chunks = [];
  const push = (...bytes) => chunks.push(Buffer.from(bytes));
  const text = (s) => chunks.push(Buffer.from(stripAccents(String(s || "")), "utf8"));
  const line = () => push(LF);
  const divider = (c = "=") => { text(c.repeat(32)); line(); };
  const fmtBRL = (v) => "R$ " + Number(v || 0).toFixed(2).replace(".", ",");
  const padRow = (label, val, bold) => {
    const l = stripAccents(String(label)).slice(0, 20);
    const r = String(val).slice(-12);
    if (bold) push(GS, 0x21, 0x01);
    text(l.padEnd(20) + r.padStart(12));
    line();
    if (bold) push(GS, 0x21, 0x00);
  };

  push(ESC, 0x40);
  push(ESC, 0x61, 0x01);
  push(GS, 0x21, 0x11);
  text("COMANDA CAIXA");
  line();
  push(GS, 0x21, 0x00);
  divider();

  push(ESC, 0x61, 0x00);
  const ticketStr = p.ticket_number != null ? `T#${String(p.ticket_number).padStart(3, "0")}` : null;
  const orderStr = p.order_number ? `Pedido #${p.order_number}` : null;
  text([orderStr, ticketStr].filter(Boolean).join("  ") || "Pedido");
  line();
  text(formatDateTime());
  line();

  // Entrega ou retirada em destaque: e a primeira coisa que o caixa precisa
  // saber, e antes so dava para deduzir pela presenca do endereco.
  push(ESC, 0x61, 0x01);
  push(GS, 0x21, 0x01);
  text(p.order_type === "pickup" ? ">> RETIRADA NO LOCAL <<" : ">> ENTREGA <<");
  line();
  push(GS, 0x21, 0x00);
  push(ESC, 0x61, 0x00);
  divider("-");

  if (p.customer_name) {
    push(GS, 0x21, 0x01);
    text(p.customer_name);
    line();
    push(GS, 0x21, 0x00);
    if (p.customer_phone) { text(p.customer_phone); line(); }
  }

  if (p.order_type !== "pickup" && p.delivery_address) {
    divider("-");
    text("ENDERECO:");
    line();
    push(GS, 0x21, 0x01);
    text(p.delivery_address);
    line();
    push(GS, 0x21, 0x00);
    if (p.delivery_complement) { text("Compl.: " + p.delivery_complement); line(); }
    if (p.delivery_reference) { text("Ref.: " + p.delivery_reference); line(); }
  }

  if (p.notes) { divider("-"); text("OBS: " + p.notes); line(); }

  divider("-");
  const items = Array.isArray(p.items) ? p.items : [];
  text(`ITENS (${items.length}):`);
  line();
  items.forEach((it) => {
    push(GS, 0x21, 0x01);
    text(`${it.quantity}x ${String(it.product_name || "").toUpperCase()}`);
    line();
    push(GS, 0x21, 0x00);
    if (it.notes) { text(`  OBS: ${it.notes}`); line(); }
    (Array.isArray(it.modifiers) ? it.modifiers : []).forEach((m) => {
      const lbl = typeof m === "string" ? m : (m && (m.name || m.label)) || "";
      if (lbl) { text(`  + ${lbl}`); line(); }
    });
  });

  divider("=");
  if (p.subtotal != null) padRow("Subtotal:", fmtBRL(p.subtotal));
  if (Number(p.delivery_fee) > 0) padRow("Taxa de entrega:", fmtBRL(p.delivery_fee));
  if (Number(p.discount_amount) > 0) padRow("Desconto:", "-" + fmtBRL(p.discount_amount));
  padRow("TOTAL:", fmtBRL(p.total), true);

  divider("-");
  // O banco grava em ingles (cash/credit/debit/pix). O mapa antigo so conhecia
  // os termos em portugues, entao o cupom saia com "Pagamento: cash".
  const PM = {
    pix: "PIX",
    cash: "Dinheiro", dinheiro: "Dinheiro", money: "Dinheiro",
    credit: "Cartao de credito", credito: "Cartao de credito",
    credit_card: "Cartao de credito",
    debit: "Cartao de debito", debito: "Cartao de debito",
    debit_card: "Cartao de debito",
    cartao: "Cartao", card: "Cartao",
    voucher: "Vale-refeicao", vale_refeicao: "Vale-refeicao",
    online: "Online (ja pago)",
  };
  const pm = PM[String(p.payment_method || "").toLowerCase()] || p.payment_method || "N/D";
  const paid = p.payment_status === "paid" ? "PAGO" : "A RECEBER";
  push(GS, 0x21, 0x01);
  text(`Pagamento: ${pm}`);
  line();
  push(GS, 0x21, 0x00);
  text(`Situacao: ${paid}`);
  line();
  // "Troco para" e o valor que o cliente vai entregar, nao o troco em si.
  if (Number(p.change_amount) > 0) {
    text(`Troco para: ${fmtBRL(p.change_amount)}`);
    line();
    const troco = Number(p.change_amount) - Number(p.total || 0);
    if (troco > 0) { text(`Levar de troco: ${fmtBRL(troco)}`); line(); }
  }

  divider("=");
  push(LF, LF, LF, LF);
  push(GS, 0x56, 0x41, 0x05);
  return Buffer.concat(chunks);
}

/**
 * Um job da fila vira bytes. Concentra aqui a decisão de layout e a
 * normalização do payload, que antes moravam no meio de processJob e não
 * tinham como ser testadas sem uma impressora do outro lado.
 */
function buildJobReceipt(job, establishmentName) {
  const p = job.payload || {};
  const kind = p.kind || job.source_kind || "comanda";

  if (kind === "danfe") return buildDanfeReceipt(p);
  if (kind === "comanda_caixa") return buildCaixaReceipt(p);

  // Suporta dois formatos de payload:
  //  - novo: p.items = [{ product_name, quantity, notes, modifiers, ... }, ...]
  //  - antigo (retrocompat): campos no topo
  const items = Array.isArray(p.items) && p.items.length > 0
    ? p.items
    : [{
        product_name: p.product_name,
        quantity: p.quantity,
        notes: p.notes,
        modifiers: p.modifiers,
        parent_product_name: p.parent_product_name,
        is_composite_child: p.is_composite_child,
        composition_group_label: p.composition_group_label,
      }];

  // Cabeçalho hierárquico: MESA destacada, comanda média
  const mesaRaw = p.mesa_numero
    ?? (p.table_number ? String(p.table_number) : null)
    ?? (kind === "order" ? (p.customer_name || "BALCÃO") : null)
    ?? "AVULSA";
  const mesa = kind === "delivery" || /^delivery$/i.test(String(mesaRaw))
    ? "DELIVERY"
    : (p.is_counter || /^balc[aã]o$/i.test(String(mesaRaw))
        ? "BALCÃO"
        : (/^mesa\b/i.test(String(mesaRaw)) ? String(mesaRaw) : `MESA ${mesaRaw}`));

  const comanda = p.comanda_nome
    || p.customer_name
    || (p.comanda_number ? `Comanda ${p.comanda_number}` : null)
    || (p.order_number ? `Pedido #${p.order_number}` : "");

  const ticketLabel = p.ticket_number != null
    ? `Pedido #${String(p.ticket_number).padStart(3, "0")}`
    : (p.order_number ? `Pedido #${p.order_number}` : null);
  const subheader = [
    `Centro: ${job.center_name ?? "—"}`,
    kind === "order"
      ? (ticketLabel || `Pedido #${p.order_number}`)
      : (ticketLabel || `Comanda #${p.comanda_number}`),
    formatDateTime(),
  ];
  if (kind !== "delivery" && p.waiter_name) subheader.push(`Garçom: ${p.waiter_name}`);
  if (items.length > 1) subheader.push(`Itens: ${items.length}`);

  const body = items.map((it) => ({
    product_name: it.product_name,
    quantity: it.quantity,
    notes: it.notes,
    modifiers: it.modifiers,
    parent_product_name: it.is_composite_child ? it.parent_product_name : null,
    composition_group_label: it.is_composite_child ? (it.composition_group_label || null) : null,
  }));

  return buildReceipt({
    mesa,
    comanda,
    subheader,
    body,
    centerName: job.center_name,
    establishmentName,
  });
}

/** Resumo curto do job para o log, sem despejar o payload inteiro. */
function jobSummary(job) {
  const p = job.payload || {};
  const kind = p.kind || job.source_kind;
  if (kind === "danfe") {
    return `NFC-e ${p.numero ?? "?"}/${p.serie ?? "?"} (${(p.items || []).length} itens)`;
  }
  const items = Array.isArray(p.items) && p.items.length > 0 ? p.items : [p];
  if (items.length === 1) return `${items[0].quantity}x ${items[0].product_name}`;
  return `${items.length} itens (${items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)} un)`;
}

module.exports = {
  buildReceipt,
  buildDanfeReceipt,
  buildCaixaReceipt,
  buildJobReceipt,
  jobSummary,
  formatDateTime,
  escposQrCode,
  stripAccents,
};
