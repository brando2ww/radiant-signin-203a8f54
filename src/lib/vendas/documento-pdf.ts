/**
 * Força de vendas · PDF da proposta e do pedido, com a marca do ESTABELECIMENTO (não a do Velara).
 *
 * Gerado no navegador. As telas chamam `gerarPdfProposta(id)` / `gerarPdfPedido(id)`, que buscam o que precisam; a
 * página pública monta o documento a partir do que a função anônima devolve (`gerarPdfPropostaPublica`). Imagem que
 * não carrega (CORS, link quebrado) some do PDF em vez de travar o download.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { slugifyFilename } from "@/lib/reports/brand";
import { formatBRL } from "@/lib/format";
import { PEDIDO_STATUS_LABEL, PROPOSTA_STATUS_LABEL, type PedidoStatus, type PropostaStatus } from "./types";
import {
  calcularParcelas,
  dataBR,
  enderecoCliente,
  formatarDocumento,
  formatarPercent,
  formatarQtd,
  nomeCliente,
  num,
  rotuloForma,
} from "@/components/vendas/propostas/calculos";

const db = supabase as any;

// ── Contrato do documento ─────────────────────────────────────────────────────

export interface MarcaDoc {
  nome: string;
  logoUrl?: string | null;
  cor?: string | null;
  cnpj?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
}

export interface ClienteDoc {
  nome: string;
  razaoSocial?: string | null;
  documento?: string | null;
  ie?: string | null;
  endereco?: string | null;
  contato?: string | null;
  telefone?: string | null;
  email?: string | null;
}

export interface ItemDoc {
  descricao: string;
  imagemUrl?: string | null;
  unidade?: string | null;
  quantidade: number;
  precoUnitario: number;
  descontoPercent: number;
  total: number;
}

export interface ParcelaDoc {
  numero: number;
  /** Data real (pedido) ou nula (proposta: "30 dias após a aprovação"). */
  vencimento: string | Date | null;
  dias?: number;
  valor: number;
  situacao?: string | null;
}

export interface DocumentoPdf {
  tipo: "proposta" | "pedido";
  numero: string;
  situacao?: string | null;
  emitidoEm: string;
  validade?: string | null;
  marca: MarcaDoc;
  cliente: ClienteDoc;
  representante?: { nome: string; telefone?: string | null; email?: string | null } | null;
  itens: ItemDoc[];
  subtotal: number;
  desconto: number;
  frete: number;
  total: number;
  formaPagamento?: string | null;
  parcelas: number;
  primeiroVencimentoDias: number;
  intervaloDias: number;
  condicaoPagamento?: string | null;
  /** Quando ausente, o cronograma é calculado a partir das condições. */
  cronograma?: ParcelaDoc[];
  entregaData?: string | null;
  entregaCondicao?: string | null;
  observacoes?: string | null;
  /** "Aprovada por Fulano em 05/10/2026". */
  aprovacao?: string | null;
  /** Pedido: "Proposta ORC-2026-0001". */
  origem?: string | null;
}

// ── Imagens ──────────────────────────────────────────────────────────────────

interface Imagem {
  dataUrl: string;
  ratio: number;
  formato: "PNG" | "JPEG";
}

/**
 * Baixa a imagem por fetch (CORS explícito) e redesenha num canvas: o jsPDF só aceita PNG/JPEG e o canvas também
 * resolve WebP e foto gigante. Qualquer falha devolve null.
 */
async function carregarImagem(url: string | null | undefined, maxLado: number, formato: "PNG" | "JPEG"): Promise<Imagem | null> {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    // no-store: a mesma imagem já exibida na tela fica no cache sem o cabeçalho de CORS e o fetch falharia.
    const res = await fetch(url, { mode: "cors", cache: "no-store", signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = objectUrl;
      });
      const w0 = img.naturalWidth || 1;
      const h0 = img.naturalHeight || 1;
      const escala = Math.min(1, maxLado / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * escala));
      const h = Math.max(1, Math.round(h0 * escala));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      if (formato === "JPEG") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL(formato === "PNG" ? "image/png" : "image/jpeg", 0.86);
      return { dataUrl, ratio: w0 / h0, formato };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

// ── Cores ────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const TINTA: RGB = [30, 41, 59];
const CINZA: RGB = [100, 116, 139];
const CINZA_CLARO: RGB = [226, 232, 240];
const FUNDO: RGB = [248, 250, 252];

function hexParaRgb(hex: string | null | undefined): RGB | null {
  if (!hex) return null;
  const m = hex.trim().replace("#", "");
  const h = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const luminancia = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// ── Montagem ─────────────────────────────────────────────────────────────────

const M = 40;
const RODAPE = 48;

/** O PDF pronto (para baixar ou anexar). */
export async function montarPdf(d: DocumentoPdf): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const largura = W - M * 2;

  // Cor clara demais (branco, amarelo-claro) não serve para texto em fundo branco: cai na tinta neutra.
  const corMarca = hexParaRgb(d.marca.cor);
  const cor: RGB = corMarca && luminancia(corMarca) < 0.78 ? corMarca : TINTA;
  const textoSobreCor: RGB = luminancia(cor) > 0.6 ? TINTA : [255, 255, 255];

  const temImagem = d.itens.some((i) => !!i.imagemUrl);
  const [logo, ...miniaturas] = await Promise.all([
    carregarImagem(d.marca.logoUrl, 480, "PNG"),
    ...d.itens.map((i) => (temImagem ? carregarImagem(i.imagemUrl, 120, "JPEG") : Promise.resolve(null))),
  ]);
  const comMiniatura = miniaturas.some(Boolean);

  const texto = (s: string | string[], x: number, y: number, opts?: Parameters<jsPDF["text"]>[3]) => doc.text(s, x, y, opts);
  const fonte = (tam: number, estilo: "normal" | "bold" = "normal", c: RGB = TINTA) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tam);
    doc.setTextColor(c[0], c[1], c[2]);
  };

  let y = 0;
  const garantir = (altura: number) => {
    if (y + altura > H - RODAPE - 8) {
      doc.addPage();
      y = M;
    }
  };

  // Faixa da marca.
  doc.setFillColor(cor[0], cor[1], cor[2]);
  doc.rect(0, 0, W, 6, "F");

  // ── Cabeçalho: marca à esquerda, documento à direita ──
  y = 30;
  let xMarca = M;
  const alturaLogo = 48;
  if (logo) {
    let lw = alturaLogo * logo.ratio;
    let lh = alturaLogo;
    if (lw > 150) {
      lw = 150;
      lh = lw / logo.ratio;
    }
    doc.addImage(logo.dataUrl, logo.formato, M, y, lw, lh);
    xMarca = M + lw + 12;
  } else {
    doc.setFillColor(cor[0], cor[1], cor[2]);
    doc.roundedRect(M, y, alturaLogo, alturaLogo, 8, 8, "F");
    fonte(22, "bold", textoSobreCor);
    texto((d.marca.nome || "?").trim().charAt(0).toUpperCase(), M + alturaLogo / 2, y + 32, { align: "center" });
    xMarca = M + alturaLogo + 12;
  }

  const larguraBlocoDoc = 170;
  const larguraMarca = W - M - larguraBlocoDoc - xMarca - 10;
  fonte(13, "bold");
  const nomeLinhas = doc.splitTextToSize(d.marca.nome || "", larguraMarca) as string[];
  texto(nomeLinhas.slice(0, 2), xMarca, y + 13);
  let yMarca = y + 13 + 15 * Math.min(2, nomeLinhas.length);
  fonte(8.5, "normal", CINZA);
  const local = [d.marca.cidade, d.marca.estado].filter(Boolean).join("/");
  const linhasMarca = [
    d.marca.cnpj ? `CNPJ ${formatarDocumento(d.marca.cnpj)}` : "",
    [d.marca.endereco, local && !(d.marca.endereco ?? "").includes(local) ? local : ""].filter(Boolean).join(" · "),
    d.marca.telefone ? `Telefone ${d.marca.telefone}` : "",
  ].filter(Boolean);
  for (const l of linhasMarca) {
    const partes = doc.splitTextToSize(l, larguraMarca) as string[];
    texto(partes, xMarca, yMarca);
    yMarca += 11 * partes.length;
  }

  const xDir = W - M;
  fonte(8.5, "bold", cor);
  texto(d.tipo === "proposta" ? "PROPOSTA COMERCIAL" : "PEDIDO DE VENDA", xDir, y + 8, { align: "right" });
  fonte(17, "bold");
  texto(d.numero, xDir, y + 28, { align: "right" });
  fonte(8.5, "normal", CINZA);
  let yDoc = y + 43;
  const linhasDoc = [
    `${d.tipo === "proposta" ? "Emitida" : "Confirmado"} em ${dataBR(d.emitidoEm)}`,
    d.validade ? `Válida até ${dataBR(d.validade)}` : "",
    d.origem ?? "",
    d.situacao ? `Situação: ${d.situacao}` : "",
  ].filter(Boolean);
  for (const l of linhasDoc) {
    texto(l, xDir, yDoc, { align: "right" });
    yDoc += 11;
  }

  y = Math.max(y + alturaLogo, yMarca - 4, yDoc - 4) + 14;
  doc.setDrawColor(CINZA_CLARO[0], CINZA_CLARO[1], CINZA_CLARO[2]);
  doc.setLineWidth(0.8);
  doc.line(M, y, W - M, y);
  y += 14;

  // ── Cliente e atendimento ──
  const gap = 12;
  const wCli = Math.round(largura * 0.6);
  const wRep = largura - wCli - gap;
  const pad = 10;

  const cli = d.cliente;
  const linhasCli: { t: string; b?: boolean }[] = [{ t: cli.nome, b: true }];
  if (cli.razaoSocial && cli.razaoSocial !== cli.nome) linhasCli.push({ t: cli.razaoSocial });
  const docs = [
    cli.documento ? `${(cli.documento.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ")} ${formatarDocumento(cli.documento)}` : "",
    cli.ie ? `IE ${cli.ie}` : "",
  ].filter(Boolean);
  if (docs.length) linhasCli.push({ t: docs.join(" · ") });
  if (cli.endereco) linhasCli.push({ t: cli.endereco });
  const contato = [cli.contato, cli.telefone, cli.email].filter(Boolean).join(" · ");
  if (contato) linhasCli.push({ t: `Contato: ${contato}` });

  const rep = d.representante;
  const linhasRep: { t: string; b?: boolean }[] = rep
    ? [{ t: rep.nome, b: true }, ...(rep.telefone ? [{ t: rep.telefone }] : []), ...(rep.email ? [{ t: rep.email }] : [])]
    : [{ t: d.marca.nome, b: true }, ...(d.marca.telefone ? [{ t: d.marca.telefone }] : [])];

  const quebrar = (linhas: { t: string; b?: boolean }[], w: number) =>
    linhas.flatMap((l) => {
      fonte(l.b ? 9.5 : 8.5, l.b ? "bold" : "normal");
      return (doc.splitTextToSize(l.t, w - pad * 2) as string[]).map((t) => ({ t, b: l.b }));
    });
  const cliQ = quebrar(linhasCli, wCli);
  const repQ = quebrar(linhasRep, wRep);
  const alturaCaixa = 26 + Math.max(cliQ.length, repQ.length) * 11.5 + 6;
  garantir(alturaCaixa);

  const caixa = (x: number, w: number, titulo: string, linhas: { t: string; b?: boolean }[]) => {
    doc.setFillColor(FUNDO[0], FUNDO[1], FUNDO[2]);
    doc.setDrawColor(CINZA_CLARO[0], CINZA_CLARO[1], CINZA_CLARO[2]);
    doc.roundedRect(x, y, w, alturaCaixa, 6, 6, "FD");
    fonte(7.5, "bold", cor);
    texto(titulo.toUpperCase(), x + pad, y + 15);
    let yy = y + 29;
    for (const l of linhas) {
      fonte(l.b ? 9.5 : 8.5, l.b ? "bold" : "normal", l.b ? TINTA : [51, 65, 85]);
      texto(l.t, x + pad, yy);
      yy += 11.5;
    }
  };
  caixa(M, wCli, "Cliente", cliQ);
  caixa(M + wCli + gap, wRep, rep ? "Representante" : "Atendimento", repQ);
  y += alturaCaixa + 18;

  // ── Itens ──
  const temDesconto = d.itens.some((i) => num(i.descontoPercent) > 0);
  const head = [
    ...(comMiniatura ? [""] : []),
    "#",
    "Produto",
    "Un.",
    "Qtd",
    "Preço un.",
    ...(temDesconto ? ["Desc."] : []),
    "Total",
  ];
  const body = d.itens.map((i, idx) => [
    ...(comMiniatura ? [""] : []),
    String(idx + 1),
    i.descricao,
    i.unidade || "",
    formatarQtd(i.quantidade),
    formatBRL(i.precoUnitario),
    ...(temDesconto ? [num(i.descontoPercent) > 0 ? formatarPercent(i.descontoPercent) : ""] : []),
    formatBRL(i.total),
  ]);
  const off = comMiniatura ? 1 : 0;
  const columnStyles: Record<number, any> = {
    [off]: { cellWidth: 20, halign: "center", textColor: CINZA },
    [off + 2]: { cellWidth: 40 },
    [off + 3]: { cellWidth: 40, halign: "right" },
    [off + 4]: { cellWidth: 64, halign: "right" },
    ...(temDesconto ? { [off + 5]: { cellWidth: 40, halign: "right" } } : {}),
    [off + (temDesconto ? 6 : 5)]: { cellWidth: 70, halign: "right", fontStyle: "bold" },
  };
  if (comMiniatura) columnStyles[0] = { cellWidth: 38 };

  garantir(60);
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    theme: "plain",
    margin: { left: M, right: M, top: M, bottom: RODAPE + 8 },
    headStyles: { fillColor: cor, textColor: textoSobreCor, fontSize: 8, fontStyle: "bold", cellPadding: 6 },
    bodyStyles: {
      fontSize: 8.5,
      textColor: TINTA,
      cellPadding: { top: 6, bottom: 6, left: 5, right: 5 },
      valign: "middle",
      minCellHeight: comMiniatura ? 38 : 0,
      lineColor: CINZA_CLARO,
      lineWidth: { bottom: 0.5 },
    },
    alternateRowStyles: { fillColor: FUNDO },
    columnStyles,
    didParseCell: (h) => {
      if (h.section === "head" && h.column.index >= off + 3) h.cell.styles.halign = "right";
    },
    didDrawCell: (h) => {
      if (!comMiniatura || h.section !== "body" || h.column.index !== 0) return;
      const m = miniaturas[h.row.index];
      if (!m) return;
      const lado = 30;
      let w = lado;
      let hh = lado;
      if (m.ratio > 1) hh = lado / m.ratio;
      else w = lado * m.ratio;
      const x = h.cell.x + (h.cell.width - w) / 2;
      const yy = h.cell.y + (h.cell.height - hh) / 2;
      doc.addImage(m.dataUrl, m.formato, x, yy, w, hh);
    },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // ── Totais ──
  const linhasTotais: [string, string][] = [["Subtotal", formatBRL(d.subtotal)]];
  if (num(d.desconto) > 0) linhasTotais.push(["Desconto", `- ${formatBRL(d.desconto)}`]);
  if (num(d.frete) > 0) linhasTotais.push(["Frete", formatBRL(d.frete)]);
  const wTot = 210;
  garantir(linhasTotais.length * 14 + 40);
  const xTot = W - M - wTot;
  for (const [rot, val] of linhasTotais) {
    fonte(9, "normal", CINZA);
    texto(rot, xTot + 8, y + 10);
    fonte(9, "normal");
    texto(val, W - M - 8, y + 10, { align: "right" });
    y += 14;
  }
  y += 4;
  doc.setFillColor(cor[0], cor[1], cor[2]);
  doc.roundedRect(xTot, y, wTot, 28, 5, 5, "F");
  fonte(9, "bold", textoSobreCor);
  texto("TOTAL", xTot + 10, y + 18);
  fonte(13, "bold", textoSobreCor);
  texto(formatBRL(d.total), W - M - 10, y + 19, { align: "right" });
  y += 46;

  // ── Seções de texto ──
  const titulo = (t: string) => {
    garantir(40);
    fonte(9.5, "bold", cor);
    texto(t.toUpperCase(), M, y);
    y += 6;
    doc.setDrawColor(cor[0], cor[1], cor[2]);
    doc.setLineWidth(0.6);
    doc.line(M, y, M + 28, y);
    y += 13;
  };
  const paragrafo = (t: string, tam = 9, c: RGB = [51, 65, 85]) => {
    fonte(tam, "normal", c);
    const linhas = doc.splitTextToSize(t, largura) as string[];
    for (const l of linhas) {
      garantir(12);
      texto(l, M, y);
      y += 12;
    }
  };

  // Pagamento e cronograma.
  titulo("Condições de pagamento");
  const n = Math.max(1, num(d.parcelas, 1));
  const resumoPag = [
    `Forma: ${rotuloForma(d.formaPagamento)}`,
    n > 1 ? `${n} parcelas` : "Parcela única",
  ];
  paragrafo(resumoPag.join(" · "));
  if (d.condicaoPagamento) paragrafo(d.condicaoPagamento);
  const cronograma: ParcelaDoc[] =
    d.cronograma && d.cronograma.length
      ? d.cronograma
      : calcularParcelas({
          total: d.total,
          parcelas: n,
          primeiroVencimentoDias: d.primeiroVencimentoDias,
          intervaloDias: d.intervaloDias,
        }).map((p) => ({ numero: p.numero, vencimento: null, dias: p.dias, valor: p.valor }));
  if (cronograma.length) {
    const comSituacao = cronograma.some((p) => p.situacao);
    garantir(40);
    autoTable(doc, {
      startY: y + 2,
      head: [["Parcela", "Vencimento", ...(comSituacao ? ["Situação"] : []), "Valor"]],
      body: cronograma.map((p) => [
        `${p.numero}/${cronograma.length}`,
        p.vencimento
          ? dataBR(p.vencimento)
          : p.dias === 0
            ? `Na ${d.tipo === "proposta" ? "aprovação" : "confirmação"}`
            : `${p.dias} dias após a ${d.tipo === "proposta" ? "aprovação" : "confirmação"}`,
        ...(comSituacao ? [p.situacao ?? ""] : []),
        formatBRL(p.valor),
      ]),
      theme: "plain",
      tableWidth: Math.min(largura, comSituacao ? 380 : 300),
      margin: { left: M, right: M, top: M, bottom: RODAPE + 8 },
      headStyles: { fillColor: FUNDO, textColor: CINZA, fontSize: 7.5, fontStyle: "bold", cellPadding: 4 },
      bodyStyles: { fontSize: 8.5, textColor: TINTA, cellPadding: 4, lineColor: CINZA_CLARO, lineWidth: { bottom: 0.5 } },
      columnStyles: { [comSituacao ? 3 : 2]: { halign: "right" } },
      didParseCell: (h) => {
        if (h.section === "head" && h.column.index === (comSituacao ? 3 : 2)) h.cell.styles.halign = "right";
      },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  } else {
    y += 8;
  }

  if (d.entregaData || d.entregaCondicao) {
    titulo("Entrega");
    if (d.entregaData) paragrafo(`Previsão: ${dataBR(d.entregaData)}`);
    if (d.entregaCondicao) paragrafo(d.entregaCondicao);
    y += 8;
  }

  if (d.observacoes) {
    titulo("Observações");
    paragrafo(d.observacoes);
    y += 8;
  }

  // Aceite (proposta ainda aberta) ou registro da aprovação.
  if (d.aprovacao) {
    garantir(30);
    fonte(9, "bold", [21, 128, 61]);
    texto(d.aprovacao, M, y + 4);
    y += 22;
  } else if (d.tipo === "proposta") {
    garantir(70);
    y += 26;
    doc.setDrawColor(CINZA[0], CINZA[1], CINZA[2]);
    doc.setLineWidth(0.6);
    doc.line(M, y, M + 230, y);
    doc.line(M + 260, y, M + 360, y);
    fonte(8, "normal", CINZA);
    texto("De acordo (nome e assinatura do cliente)", M, y + 11);
    texto("Data", M + 260, y + 11);
    y += 24;
  }

  // ── Rodapé em todas as páginas ──
  const paginas = doc.getNumberOfPages();
  const rotuloDoc = `${d.tipo === "proposta" ? "Proposta" : "Pedido"} ${d.numero}`;
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    const yr = H - 26;
    doc.setDrawColor(CINZA_CLARO[0], CINZA_CLARO[1], CINZA_CLARO[2]);
    doc.setLineWidth(0.6);
    doc.line(M, yr - 12, W - M, yr - 12);
    fonte(7.5, "normal", CINZA);
    texto(`${d.marca.nome} · ${rotuloDoc}`, M, yr);
    texto(`Página ${p} de ${paginas}`, W - M, yr, { align: "right" });
  }
  return doc;
}

export function nomeDoArquivo(d: Pick<DocumentoPdf, "tipo" | "numero" | "cliente">) {
  return `${slugifyFilename(d.tipo, d.numero, d.cliente.nome)}.pdf`;
}

export async function baixarPdf(d: DocumentoPdf) {
  const doc = await montarPdf(d);
  doc.save(nomeDoArquivo(d));
}

// ── Carregadores (telas logadas) ─────────────────────────────────────────────

async function carregarMarcaDoc(owner: string): Promise<MarcaDoc> {
  const { data } = await db.rpc("vendas_marca", { p_owner: owner });
  let m = data as any;
  if (!m) {
    const { data: b } = await db.from("business_settings").select("business_name, logo_url, primary_color").eq("user_id", owner).maybeSingle();
    m = { name: b?.business_name, logo_url: b?.logo_url, primary_color: b?.primary_color };
  }
  return {
    nome: m?.name || "Proposta",
    logoUrl: m?.logo_url ?? null,
    cor: m?.primary_color ?? null,
    cnpj: m?.cnpj ?? null,
    telefone: m?.phone ?? null,
    endereco: m?.address ?? null,
    cidade: m?.city ?? null,
    estado: m?.state ?? null,
  };
}

function clienteDoc(c: any): ClienteDoc {
  if (!c) return { nome: "Cliente" };
  return {
    nome: nomeCliente(c),
    razaoSocial: c.company_name || (c.trade_name && c.name !== c.trade_name ? c.name : null),
    documento: c.cnpj || c.cpf || null,
    ie: c.state_registration || null,
    endereco: enderecoCliente(c) || null,
    contato: c.contact_name || null,
    telefone: c.whatsapp || c.phone || null,
    email: c.email || null,
  };
}

const itemDoc = (i: any): ItemDoc => ({
  descricao: i.description,
  imagemUrl: i.image_url,
  unidade: i.unit,
  quantidade: num(i.quantity),
  precoUnitario: num(i.unit_price),
  descontoPercent: num(i.discount_percent),
  total: num(i.total),
});

export async function gerarPdfProposta(id: string) {
  const [{ data: p, error }, { data: itens, error: e2 }] = await Promise.all([
    db
      .from("vendas_propostas")
      .select("*, customer:pdv_customers(*), rep:vendas_representantes(name, phone, email)")
      .eq("id", id)
      .maybeSingle(),
    db.from("vendas_proposta_itens").select("*").eq("proposta_id", id).order("position"),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  if (!p) throw new Error("Proposta não encontrada.");
  const marca = await carregarMarcaDoc(p.user_id);
  const status = p.status as PropostaStatus;
  const aprovada = status === "approved" || status === "converted";
  await baixarPdf({
    tipo: "proposta",
    numero: p.number,
    situacao: status === "draft" ? "Rascunho" : status === "sent" ? null : PROPOSTA_STATUS_LABEL[status],
    emitidoEm: p.sent_at || p.created_at,
    validade: p.valid_until,
    marca,
    cliente: clienteDoc(p.customer),
    representante: p.rep ? { nome: p.rep.name, telefone: p.rep.phone, email: p.rep.email } : null,
    itens: (itens ?? []).map(itemDoc),
    subtotal: num(p.subtotal),
    desconto: num(p.discount_amount),
    frete: num(p.shipping_amount),
    total: num(p.total),
    formaPagamento: p.payment_method,
    parcelas: p.installments,
    primeiroVencimentoDias: p.first_due_days,
    intervaloDias: p.interval_days,
    condicaoPagamento: p.payment_terms,
    entregaData: p.delivery_date,
    entregaCondicao: p.delivery_terms,
    observacoes: p.notes,
    aprovacao: aprovada
      ? `Aprovada${p.responder_name ? ` por ${p.responder_name}` : ""}${p.responded_at ? ` em ${dataBR(p.responded_at)}` : ""}.`
      : null,
  });
}

export async function gerarPdfPedido(id: string) {
  const [{ data: p, error }, { data: itens, error: e2 }, { data: parcelas }] = await Promise.all([
    db
      .from("vendas_pedidos")
      .select(
        "*, customer:pdv_customers(*), rep:vendas_representantes(name, phone, email), proposta:vendas_propostas!vendas_pedidos_proposta_id_fkey(number, responder_name, responded_at)",
      )
      .eq("id", id)
      .maybeSingle(),
    db.from("vendas_pedido_itens").select("*").eq("pedido_id", id).order("position"),
    db
      .from("pdv_financial_transactions")
      .select("amount, due_date, status, installment_number")
      .eq("vendas_pedido_id", id)
      .eq("transaction_type", "receivable")
      .order("due_date"),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  if (!p) throw new Error("Pedido não encontrado.");
  const marca = await carregarMarcaDoc(p.user_id);
  const SIT: Record<string, string> = { pending: "Em aberto", paid: "Recebida", overdue: "Vencida", cancelled: "Cancelada" };
  const reais = (parcelas ?? []) as any[];
  // Sem acesso ao financeiro (representante), o cronograma sai calculado a partir da confirmação.
  const cronograma: ParcelaDoc[] = reais.length
    ? reais.map((r, idx) => ({
        numero: r.installment_number ?? idx + 1,
        vencimento: r.due_date,
        valor: num(r.amount),
        situacao: SIT[r.status] ?? r.status,
      }))
    : calcularParcelas({
        total: num(p.total),
        parcelas: p.installments,
        primeiroVencimentoDias: p.first_due_days,
        intervaloDias: p.interval_days,
        base: new Date(p.confirmed_at),
      }).map((x) => ({ numero: x.numero, vencimento: x.vencimento, valor: x.valor }));
  const status = p.status as PedidoStatus;
  await baixarPdf({
    tipo: "pedido",
    numero: p.number,
    situacao: PEDIDO_STATUS_LABEL[status],
    emitidoEm: p.confirmed_at,
    marca,
    cliente: clienteDoc(p.customer),
    representante: p.rep ? { nome: p.rep.name, telefone: p.rep.phone, email: p.rep.email } : null,
    itens: (itens ?? []).map(itemDoc),
    subtotal: num(p.subtotal),
    desconto: num(p.discount_amount),
    frete: num(p.shipping_amount),
    total: num(p.total),
    formaPagamento: p.payment_method,
    parcelas: p.installments,
    primeiroVencimentoDias: p.first_due_days,
    intervaloDias: p.interval_days,
    condicaoPagamento: p.payment_terms,
    cronograma,
    entregaData: p.delivery_date,
    entregaCondicao: p.delivery_terms,
    observacoes: p.notes,
    origem: p.proposta?.number ? `Proposta ${p.proposta.number}` : null,
    aprovacao: p.proposta?.responder_name
      ? `Proposta aprovada por ${p.proposta.responder_name}${p.proposta.responded_at ? ` em ${dataBR(p.proposta.responded_at)}` : ""}.`
      : null,
  });
}

// ── Página pública (sem login): o documento sai do que a função anônima devolve ──

export interface PropostaPublicaPayload {
  proposta: {
    number: string;
    status: PropostaStatus;
    valid_until: string | null;
    payment_method: string | null;
    installments: number;
    first_due_days: number;
    interval_days: number;
    payment_terms: string | null;
    delivery_date: string | null;
    delivery_terms: string | null;
    notes: string | null;
    subtotal: number;
    discount_amount: number;
    shipping_amount: number;
    total: number;
    created_at: string;
    responded_at: string | null;
    responder_name: string | null;
    order_number: string | null;
  };
  itens: {
    description: string;
    image_url: string | null;
    unit: string | null;
    quantity: number;
    unit_price: number;
    discount_percent: number;
    total: number;
  }[];
  cliente: { name: string | null; company_name: string | null; document: string | null } | null;
  representante: { name: string; phone: string | null; email: string | null } | null;
  marca: {
    name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    cnpj: string | null;
    phone: string | null;
    address: string | null;
  } | null;
}

export async function gerarPdfPropostaPublica(r: PropostaPublicaPayload) {
  const p = r.proposta;
  const aprovada = p.status === "approved" || p.status === "converted";
  await baixarPdf({
    tipo: "proposta",
    numero: p.number,
    situacao: p.status === "sent" ? null : PROPOSTA_STATUS_LABEL[p.status],
    emitidoEm: p.created_at,
    validade: p.valid_until,
    marca: {
      nome: r.marca?.name || "Proposta",
      logoUrl: r.marca?.logo_url,
      cor: r.marca?.primary_color,
      cnpj: r.marca?.cnpj,
      telefone: r.marca?.phone,
      endereco: r.marca?.address,
    },
    cliente: {
      nome: r.cliente?.name || "Cliente",
      razaoSocial: r.cliente?.company_name,
      documento: r.cliente?.document,
    },
    representante: r.representante ? { nome: r.representante.name, telefone: r.representante.phone, email: r.representante.email } : null,
    itens: r.itens.map(itemDoc),
    subtotal: num(p.subtotal),
    desconto: num(p.discount_amount),
    frete: num(p.shipping_amount),
    total: num(p.total),
    formaPagamento: p.payment_method,
    parcelas: p.installments,
    primeiroVencimentoDias: p.first_due_days,
    intervaloDias: p.interval_days,
    condicaoPagamento: p.payment_terms,
    entregaData: p.delivery_date,
    entregaCondicao: p.delivery_terms,
    observacoes: p.notes,
    aprovacao: aprovada
      ? `Aprovada${p.responder_name ? ` por ${p.responder_name}` : ""}${p.responded_at ? ` em ${dataBR(p.responded_at)}` : ""}${p.order_number ? ` · pedido ${p.order_number}` : ""}.`
      : null,
  });
}
