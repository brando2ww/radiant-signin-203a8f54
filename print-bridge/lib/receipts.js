"use strict";

// Renderização ESC/POS. Módulo puro: entra payload, sai Buffer. Nenhuma rede,
// nenhum estado, nenhum I/O — é o que permite testar por snapshot no macOS,
// sem impressora e sem Windows (ver tools/ e test/bridge.test.js).
//
// Os layouts seguem a mesma linguagem visual do demonstrativo de fechamento
// (src/components/pdv/CloseCashierDialog.tsx): título em corpo grande entre
// duas réguas, seção em caixa alta sublinhada, valor sempre em negrito à
// direita e o número que importa dentro de um card. Mexer no espaçamento aqui
// muda papel impresso em produção — confira com tools/fake-printer.js.

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Colunas por linha na fonte A. 48 é a bobina de 80mm, 32 a de 58mm — quem
// manda é config.printCols, que chega pelo ctx; este valor só vale para quem
// chamar o módulo sem contexto (testes de unidade e ferramentas).
const W_PADRAO = 48;

// A fonte B é condensada: na mesma bobina cabe ~4/3 do que cabe na fonte A.
const proporcaoFonteB = (w) => Math.floor((w * 4) / 3);

// Coluna em que a descrição começa: a quantidade ocupa as duas primeiras
// posições e o texto alinha a partir daqui, inclusive nas quebras de linha.
const QTD_COL = 5;

function stripAccents(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function formatDateTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatHora(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDiaHora(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fmtNum = (v) => Number(v || 0).toFixed(2).replace(".", ",");

/** Quebra em linhas de no máximo `w` colunas, sem cortar palavra no meio. */
function wrap(s, w, indent = "") {
  const palavras = stripAccents(String(s ?? "")).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];
  const linhas = [];
  let atual = "";
  for (const p of palavras) {
    const candidato = atual ? `${atual} ${p}` : p;
    if ((indent + candidato).length > w && atual) {
      linhas.push(indent + atual);
      atual = p;
    } else {
      atual = candidato;
    }
  }
  if (atual) linhas.push(indent + atual);
  return linhas;
}

/** Escritor ESC/POS: guarda os bytes e oferece os primitivos de layout. */
function makeWriter(W = W_PADRAO) {
  const WB = proporcaoFonteB(W);
  const chunks = [];
  const push = (...bytes) => chunks.push(Buffer.from(bytes));
  const raw = (buf) => chunks.push(buf);
  const text = (s) => chunks.push(Buffer.from(stripAccents(String(s ?? "")), "utf8"));
  const line = () => push(LF);
  const write = (s) => { text(s); line(); };

  const reset = () => push(ESC, 0x40);
  const align = (n) => push(ESC, 0x61, n); // 0 esquerda, 1 centro, 2 direita
  const size = (n) => push(GS, 0x21, n); // 0x00 normal, 0x01 altura 2x, 0x11 2x2
  // ESC E sozinho sai fraco em boa parte das térmicas; o ESC G (double
  // strike) é o que de fato engrossa o traço. Os dois juntos dão o mesmo
  // peso que o demonstrativo de fechamento tem no papel.
  const bold = (on) => {
    push(ESC, 0x45, on ? 1 : 0);
    push(ESC, 0x47, on ? 1 : 0);
  };
  const fontB = (on) => push(ESC, 0x4d, on ? 1 : 0);

  const rule = (w = W, c = "-") => write(c.repeat(w));

  // ─── Tokens de estilo ──────────────────────────────────────────────────
  // Espelham o CSS do demonstrativo de fechamento (CloseCashierDialog), que
  // é a referência de legibilidade do PDV: título entre duas réguas grossas,
  // seção em caixa alta sublinhada, valor sempre em negrito à direita e
  // número que importa dentro de uma moldura, em corpo grande.

  /** h1: 2x2 em negrito, centralizado, entre réguas grossas. */
  const titulo = (s, w = W) => {
    rule(w, "=");
    align(1);
    size(0x11);
    bold(true);
    write(s);
    bold(false);
    size(0x00);
    align(0);
    rule(w, "=");
  };

  /** .subtitle: centralizado, negrito, corpo dobrado só na altura. */
  const subtitulo = (s) => {
    align(1);
    size(0x01);
    bold(true);
    write(s);
    bold(false);
    size(0x00);
    align(0);
  };

  /** .divider + .section-title: régua grossa, título em caixa alta e sublinha. */
  const secao = (s, w = W) => {
    rule(w, "=");
    bold(true);
    write(String(s).toUpperCase());
    bold(false);
    rule(w, "-");
  };

  /** .row: rótulo à esquerda, valor em negrito encostado à direita. */
  const linha = (label, valor, w = W) => {
    const l = stripAccents(String(label ?? ""));
    const v = stripAccents(String(valor ?? ""));
    if (!v) return write(l);
    const espaco = w - l.length - v.length;
    if (espaco < 1) {
      write(l);
      align(2);
      bold(true);
      write(v);
      bold(false);
      align(0);
      return;
    }
    text(l + " ".repeat(espaco));
    bold(true);
    text(v);
    bold(false);
    line();
  };

  /**
   * .highlight: moldura com rótulo pequeno e o valor em corpo grande.
   * O corpo grande ocupa duas colunas por caractere, então o miolo útil da
   * linha do valor é metade da largura — daí o cálculo separado.
   */
  const card = (label, valor, w = W) => {
    const miolo = w - 2;
    const v = stripAccents(String(valor ?? ""));
    const metade = Math.floor(miolo / 2);

    write("+" + "-".repeat(miolo) + "+");
    write("|" + (" " + stripAccents(String(label)).toUpperCase()).padEnd(miolo) + "|");

    text("|");
    if (v.length <= metade) {
      size(0x11);
      bold(true);
      text(v.padStart(metade));
      bold(false);
      size(0x00);
      write(" ".repeat(miolo - metade * 2) + "|");
    } else {
      // Nome comprido não cabe em corpo grande. Cortar o cliente no meio é
      // pior que reduzir o corpo, então cai para o tamanho normal em negrito.
      bold(true);
      text(v.slice(0, miolo - 1).padStart(miolo - 1));
      bold(false);
      write(" |");
    }
    write("+" + "-".repeat(miolo) + "+");
  };

  /** .footer: régua grossa e o rodapé centralizado, em fonte condensada. */
  const rodape = (s) => {
    rule(W, "=");
    align(1);
    fontB(true);
    write(s);
    fontB(false);
    align(0);
  };

  /** Texto à esquerda e à direita na mesma linha, encostados nas bordas. */
  const row = (left, right, w = W) => {
    const l = stripAccents(String(left ?? ""));
    const r = stripAccents(String(right ?? ""));
    if (!r) return write(l);
    if (l.length + r.length + 1 > w) {
      write(l);
      write(r.padStart(w));
      return;
    }
    write(l.padEnd(w - r.length) + r);
  };

  const cut = () => {
    push(LF, LF, LF, LF);
    push(GS, 0x56, 0x41, 0x05);
  };

  return {
    push, raw, text, line, write, reset, align, size, bold, fontB,
    rule, row, cut,
    titulo, subtitulo, secao, linha, card, rodape,
    done: () => Buffer.concat(chunks),
  };
}

/**
 * Itens da cozinha: quantidade + produto em destaque, complementos recuados.
 *
 * `espacarModificadores` separa cada complemento por uma linha em branco — é
 * como sai na comanda de entrega, onde cada componente do prato vira uma
 * etapa de montagem. Na comanda de mesa eles vêm colados, como no balcão.
 */
function escreverItensCozinha(w, items, largura, espacarModificadores = false) {
  items.forEach((item, idx) => {
    if (idx > 0) {
      // Separador pontilhado entre itens, como no cupom de referência.
      w.write("- ".repeat(Math.floor(largura / 2)).trimEnd());
    }
    if (item.composition_group_label) {
      w.write(`[${String(item.composition_group_label).toUpperCase()}]`);
    }

    // Quantidade numa coluna própria e descrição sempre a partir da mesma
    // posição, inclusive nas quebras de linha e nos complementos.
    const recuo = " ".repeat(QTD_COL);
    const prefixo = String(item.quantity ?? 1).padStart(2) + "   ";

    w.size(0x01);
    w.bold(true);
    wrap(String(item.product_name || "").toUpperCase(), largura - QTD_COL)
      .forEach((l, i) => w.write((i === 0 ? prefixo : recuo) + l));
    w.bold(false);
    w.size(0x00);

    if (!item.composition_group_label && item.parent_product_name) {
      w.write(`${recuo}(parte de: ${String(item.parent_product_name).toUpperCase()})`);
    }
    if (item.notes) {
      wrap(`OBS: ${item.notes}`, largura, recuo).forEach((l) => w.write(l));
    }

    normalizarModificadores(item.modifiers).forEach((label) => {
      if (espacarModificadores) w.line();
      w.size(0x01);
      w.bold(true);
      wrap(String(label).toUpperCase(), largura, recuo).forEach((l) => w.write(l));
      w.bold(false);
      w.size(0x00);
    });
  });
}

function normalizarModificadores(modifiers) {
  if (!modifiers || typeof modifiers !== "object") return [];
  const mods = Array.isArray(modifiers) ? modifiers : Object.values(modifiers);
  return mods
    .flat()
    .map((m) => {
      if (!m) return null;
      return typeof m === "string" ? m : m.name || m.label || null;
    })
    .filter(Boolean);
}

/**
 * Comanda de mesa (salão).
 *
 *   [ tarja preta: MESA 21 ]
 *   Vitor                   Pessoas 8
 *   Qtd  Descricao              20:37
 *   ...itens...
 *   Velara 2.1.0 - Vitor  11/09 20:37
 */
function buildComandaMesa(p, ctx) {
  const W = ctx.cols || W_PADRAO;
  const w = makeWriter(W);
  w.reset();

  w.titulo("SALAO");
  w.subtitulo(p.mesaLabel);
  w.line();

  if (p.nome) w.card("Cliente", p.nome);

  if (p.pessoas != null) w.linha("Pessoas:", String(p.pessoas));
  if (p.garcom) w.linha("Garcom:", p.garcom);
  w.linha("Hora:", p.hora);
  w.line();

  w.secao(`Itens (${p.items.length})`);
  escreverItensCozinha(w, p.items, W, false);

  w.rodape(`${ctx.version ? `Velara ${ctx.version}` : "Velara"} - ${p.diaHora}`);
  w.cut();
  return w.done();
}

/**
 * Comanda de entrega para a produção (cozinha/bar).
 *
 *   TELENTREGA                     #3
 *   **IFOOD** - #2233  NOME - ENDERECO
 *   QTD DESCRICAO               18:06
 *   ...itens...
 *   Comanda #3 - Imp: cozinha
 */
function buildComandaEntrega(p, ctx) {
  const W = ctx.cols || W_PADRAO;
  const w = makeWriter(W);
  w.reset();

  w.titulo(p.titulo);
  if (p.numero) w.subtitulo(`PEDIDO #${p.numero}`);
  w.line();

  if (p.nome) w.card("Cliente", p.nome);

  if (p.externalCode) w.linha("iFood:", `#${p.externalCode}`);
  if (p.telefone) w.linha("Fone:", p.telefone);
  w.linha("Hora:", p.hora);
  w.line();

  // Endereço fica em seção própria: é o que o balcão confere na hora de
  // despachar, e vinha espremido junto do resto do cabeçalho.
  if (p.endereco) {
    w.secao("Endereco");
    wrap(p.endereco, W).forEach((l) => w.write(l));
    if (p.complemento) wrap(p.complemento, W).forEach((l) => w.write(l));
    w.line();
  }

  w.secao(`Itens (${p.items.length})`);
  escreverItensCozinha(w, p.items, W, true);

  w.rodape(`${p.centro ? `Imp: ${p.centro} - ` : ""}${ctx.version ? `Velara ${ctx.version}` : "Velara"} - ${p.diaHora}`);
  w.cut();
  return w.done();
}

/**
 * Cupom do pedido (caixa) e a 2ª via do motoboy.
 *
 *   BUSCAR / TELENTREGA / BALCAO
 *   #003                 iFood #1407
 *   Joel Longaray
 *   ...endereco...
 *   [ codigo coleta 3755 ]
 *   Qtd  Produto              Total
 *   ...itens com preco...
 *              Subtotal        42,00
 *           Valor Total        22,99
 *          Pagto Online        22,99
 *                 Troco         0,00
 */
function buildCupomPedido(p, ctx) {
  const W = ctx.cols || W_PADRAO;
  const w = makeWriter(W);
  w.reset();

  const via = (titulo, comItens) => {
    w.titulo(titulo);
    if (p.numero) w.subtitulo(`PEDIDO #${p.numero}`);
    w.line();

    if (p.nome) w.card("Cliente", p.nome);

    if (p.externalCode) w.linha("iFood:", `#${p.externalCode}`);
    if (p.telefone) w.linha("Fone:", p.telefone);
    w.linha("Hora:", p.hora);
    w.line();

    if (p.endereco) {
      w.secao("Endereco");
      wrap(p.endereco, W).forEach((l) => w.write(l));
      if (p.complemento) wrap(p.complemento, W).forEach((l) => w.write(l));
      if (p.referencia) wrap(p.referencia, W).forEach((l) => w.write(l));
      if (p.regiao) wrap(p.regiao, W).forEach((l) => w.write(l));
      w.line();
    }

    if (p.codigoColeta) w.card("Codigo de coleta", p.codigoColeta);

    if (comItens) {
      w.secao(`Itens (${p.items.length})`);
      w.row("Qtd  Produto", "Total", W);
      p.items.forEach((it) => {
        const nome = String(it.product_name || "").trim();
        const preco = Number(it.subtotal) > 0 ? fmtNum(it.subtotal) : "";
        const prefixo = String(it.quantity ?? 1).padStart(2) + "   ";
        const recuo = " ".repeat(QTD_COL);
        // O preço fica na primeira linha do item; o nome que não coube segue
        // recuado abaixo, sem empurrar o valor da coluna da direita.
        wrap(nome, W - QTD_COL - (preco ? preco.length + 1 : 0)).forEach((l, i) => {
          if (i > 0) return w.write(recuo + l);
          const inicio = prefixo + l;
          if (!preco) return w.write(inicio);
          w.text(inicio.padEnd(W - preco.length));
          w.bold(true);
          w.text(preco);
          w.bold(false);
          w.line();
        });
        normalizarModificadores(it.modifiers).forEach((m) => {
          wrap(m, W, recuo).forEach((l) => w.write(l));
        });
      });
    }

    w.secao("Valores");
    if (p.subtotal != null) w.linha("Subtotal:", fmtNum(p.subtotal));
    if (Number(p.taxaEntrega) > 0) w.linha("Taxa de entrega:", fmtNum(p.taxaEntrega));
    if (Number(p.desconto) > 0) w.linha("Desconto:", "-" + fmtNum(p.desconto));
    if (Number(p.descontoPlataforma) > 0) w.linha("Desconto da plataforma:", "-" + fmtNum(p.descontoPlataforma));
    w.line();

    w.card("Valor total", fmtNum(p.total));

    if (p.pagamentoLabel) w.linha(`${p.pagamentoLabel}:`, fmtNum(p.pagamentoValor));
    w.linha("Troco:", fmtNum(p.troco));

    w.rodape(`${ctx.version ? `Velara ${ctx.version}` : "Velara"} - ${p.diaHora}`);
  };

  via(p.titulo, true);

  // 2ª via do motoboy: mesmo cabeçalho e valores, sem a lista de itens — é o
  // que o entregador confere na porta, não precisa do detalhe do pedido.
  // Vai depois de um corte: uma via fica no caixa e a outra sai com a moto,
  // então não pode sair tudo grudado numa tira só.
  if (p.viaMotoboy) {
    w.cut();
    via("VIA MOTOBOY", false);
  }

  w.cut();
  return w.done();
}

/**
 * Cupom de teste: régua de colunas e uma amostra de cada estilo.
 *
 * A régua existe porque a largura da bobina não dá para adivinhar — 80mm
 * costuma ser 48 colunas e 58mm 32, mas há impressora configurada fora do
 * padrão. Se o último número da régua não encostar na borda do papel, é
 * PRINT_COLS no .env que precisa mudar, não o código.
 */
function buildTestePapel(cols, ctx = {}) {
  const W = cols || W_PADRAO;
  const w = makeWriter(W);
  w.reset();

  w.titulo("TESTE");
  w.subtitulo(`${W} COLUNAS`);
  w.line();

  // Régua: dezenas em cima, unidades embaixo.
  let dezenas = "";
  let unidades = "";
  for (let i = 1; i <= W; i++) {
    dezenas += i % 10 === 0 ? String(Math.floor(i / 10)) : " ";
    unidades += String(i % 10);
  }
  w.write(dezenas);
  w.write(unidades);
  w.write("=".repeat(W));

  w.secao("Amostra");
  w.linha("Valor em negrito:", "R$ 123,45");
  w.linha("Texto normal:", "sem negrito");
  w.card("Card de destaque", "123,45");

  w.rodape(`${ctx.establishmentName || "Velara"} - ${ctx.version || ""} - ${formatDiaHora()}`);
  w.cut();
  return w.done();
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

/** Itens do payload, aceitando o formato antigo com os campos no topo. */
function extrairItens(p) {
  if (Array.isArray(p.items) && p.items.length > 0) return p.items;
  return [{
    product_name: p.product_name,
    quantity: p.quantity,
    notes: p.notes,
    modifiers: p.modifiers,
    parent_product_name: p.parent_product_name,
    is_composite_child: p.is_composite_child,
    composition_group_label: p.composition_group_label,
  }];
}

function normalizarItens(items) {
  return items.map((it) => ({
    product_name: it.product_name,
    quantity: it.quantity,
    notes: it.notes,
    modifiers: it.modifiers,
    subtotal: it.subtotal,
    unit_price: it.unit_price,
    parent_product_name: it.is_composite_child ? it.parent_product_name : null,
    composition_group_label: it.is_composite_child ? (it.composition_group_label || null) : null,
  }));
}

const PAGAMENTOS = {
  pix: "PIX",
  cash: "Dinheiro", dinheiro: "Dinheiro", money: "Dinheiro",
  credit: "Cartao de credito", credito: "Cartao de credito", credit_card: "Cartao de credito",
  debit: "Cartao de debito", debito: "Cartao de debito", debit_card: "Cartao de debito",
  cartao: "Cartao", card: "Cartao",
  voucher: "Vale-refeicao", vale_refeicao: "Vale-refeicao",
  online: "Pagto Online",
};

/**
 * Um job da fila vira bytes. Concentra aqui a decisão de layout e a
 * normalização do payload, que antes moravam no meio de processJob e não
 * tinham como ser testadas sem uma impressora do outro lado.
 */
function buildJobReceipt(job, establishmentName, version, cols) {
  const p = job.payload || {};
  const kind = p.kind || job.source_kind || "comanda";
  const ctx = { establishmentName, version, cols };
  const agora = new Date();

  if (kind === "danfe") return buildDanfeReceipt(p);

  if (kind === "comanda_caixa") {
    // Desconto: quando o pedido vem de marketplace o banco guarda quem banca
    // cada parte. Somar os dois numa linha só esconde o que o iFood pagou.
    const temSplit = Number(p.discount_sponsor_ifood) > 0 || Number(p.discount_sponsor_merchant) > 0;
    const pagoOnline = String(p.payment_method || "").toLowerCase() === "online" || p.payment_status === "paid";
    const trocoPara = Number(p.change_amount) || 0;
    return buildCupomPedido({
      titulo: p.order_type === "pickup" ? "RETIRADA" : "TELE-ENTREGA",
      hora: formatHora(agora),
      numero: p.order_number ?? p.ticket_number ?? null,
      externalCode: p.external_code || null,
      externalId: p.external_order_id || null,
      nome: p.customer_name || null,
      telefone: p.customer_phone || null,
      endereco: p.order_type === "pickup" ? null : (p.delivery_address || null),
      complemento: p.delivery_complement || null,
      referencia: p.delivery_reference || null,
      regiao: p.delivery_region || null,
      codigoColeta: p.external_collection_code || null,
      previsto: p.previsto || null,
      pedidosCliente: p.pedidos_cliente ?? null,
      items: normalizarItens(extrairItens(p)),
      subtotal: p.subtotal,
      taxaEntrega: p.delivery_fee,
      desconto: temSplit ? p.discount_sponsor_merchant : p.discount_amount,
      descontoPlataforma: temSplit ? p.discount_sponsor_ifood : 0,
      total: p.total,
      pagamentoLabel: PAGAMENTOS[String(p.payment_method || "").toLowerCase()] || (pagoOnline ? "Pagto Online" : "A Receber"),
      pagamentoValor: trocoPara > 0 ? trocoPara : Number(p.total || 0),
      troco: trocoPara > 0 ? Math.max(0, trocoPara - Number(p.total || 0)) : 0,
      viaMotoboy: p.order_type !== "pickup",
      diaHora: formatDiaHora(agora),
    }, ctx);
  }

  const items = normalizarItens(extrairItens(p));

  if (kind === "delivery") {
    return buildComandaEntrega({
      titulo: p.order_type === "pickup" ? "RETIRADA" : "TELE-ENTREGA",
      numero: p.order_number ?? p.ticket_number ?? null,
      externalCode: p.external_code || null,
      externalId: p.external_order_id || null,
      nome: p.customer_name || null,
      telefone: p.customer_phone || null,
      endereco: p.order_type === "pickup" ? null : (p.delivery_address || null),
      complemento: p.delivery_complement || null,
      centro: job.center_name || null,
      items,
      hora: formatHora(agora),
      diaHora: formatDiaHora(agora),
    }, ctx);
  }

  // Salão: mesa numerada, balcão ou avulsa.
  const mesaRaw = p.mesa_numero
    ?? (p.table_number ? String(p.table_number) : null)
    ?? (kind === "order" ? (p.customer_name || "BALCAO") : null)
    ?? "AVULSA";
  const mesaLabel = p.is_counter || /^balc[aã]o$/i.test(String(mesaRaw))
    ? "BALCAO"
    : (/^mesa\b/i.test(String(mesaRaw)) ? String(mesaRaw) : `MESA ${mesaRaw}`);

  return buildComandaMesa({
    mesaLabel,
    nome: p.comanda_nome || p.customer_name || (p.comanda_number ? `Comanda ${p.comanda_number}` : ""),
    pessoas: p.person_number ?? null,
    garcom: p.waiter_name || null,
    items,
    hora: formatHora(agora),
    diaHora: formatDiaHora(agora),
  }, ctx);
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
  buildComandaMesa,
  buildTestePapel,
  buildComandaEntrega,
  buildCupomPedido,
  buildDanfeReceipt,
  buildJobReceipt,
  jobSummary,
  formatDateTime,
  escposQrCode,
  stripAccents,
  wrap,
};
