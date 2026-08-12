/**
 * Exportação dos relatórios de compras: Excel (uma aba por bloco) e PDF.
 *
 * O PDF leva a marca Velara no cabeçalho. O logo é importado pelo Vite e
 * convertido para dataURL no navegador — jsPDF precisa dos bytes, não da URL.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToXlsx, type XlsxSheet } from "@/lib/xlsx-export";
import { formatBRL } from "@/lib/format";
import { formatDateOnly } from "./dates";
import logoVelara from "@/assets/logo_velara_preto.png";
import type {
  PurchaseReportsData, QuotationBlock,
} from "./types";

const pctText = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export interface ExportContext {
  businessName: string;
  periodLabel: string;
  data: PurchaseReportsData;
  quotations: QuotationBlock | null;
}

// ------------------------------------------------------------------- Excel

export function buildSheets({ data, quotations }: ExportContext): XlsxSheet[] {
  const sheets: XlsxSheet[] = [];

  sheets.push({
    name: "Resumo",
    columns: [
      { key: "indicador", label: "Indicador", width: 34 },
      { key: "valor", label: "Valor", width: 18 },
    ],
    rows: [
      { indicador: "Total comprado", valor: data.kpis.spend },
      { indicador: "Pedidos", valor: data.kpis.orders },
      { indicador: "Ticket médio por pedido", valor: data.kpis.avgOrder },
      { indicador: "Frete", valor: data.kpis.freight },
      { indicador: "Fornecedores", valor: data.kpis.suppliers },
      { indicador: "Insumos", valor: data.kpis.ingredients },
      { indicador: "Custo a mais (altas de preço)", valor: data.price.totals.impactUp },
      { indicador: "Economia (baixas de preço)", valor: Math.abs(data.price.totals.impactDown) },
      { indicador: "Insumos comparáveis", valor: data.price.sample.comparable },
      { indicador: "Insumos sem base de comparação", valor: data.price.sample.noBase },
    ],
  });

  sheets.push({
    name: "Variação de preço",
    columns: [
      { key: "insumo", label: "Insumo", width: 32 },
      { key: "unidade", label: "Unidade", width: 10 },
      { key: "preco_anterior", label: "Preço anterior", type: "currency", width: 15 },
      { key: "data_anterior", label: "Data anterior", width: 13 },
      { key: "preco_atual", label: "Preço atual", type: "currency", width: 15 },
      { key: "data_atual", label: "Data atual", width: 13 },
      { key: "variacao", label: "Variação", type: "percent", width: 11 },
      { key: "impacto", label: "Impacto R$", type: "currency", width: 15 },
      { key: "qtd_periodo", label: "Qtd no período", type: "number", width: 14 },
      { key: "compras", label: "Compras (total)", type: "number", width: 14 },
      { key: "confianca", label: "Confiança", width: 11 },
      { key: "fornecedor", label: "Fornecedor atual", width: 26 },
      { key: "alerta", label: "Alerta", width: 28 },
    ],
    rows: data.price.rows.map((r) => ({
      insumo: r.ingredient_name,
      unidade: r.unit,
      preco_anterior: r.prev_price,
      data_anterior: formatDateOnly(r.prev_date),
      preco_atual: r.last_price,
      data_atual: formatDateOnly(r.last_date),
      variacao: r.delta_pct,
      impacto: r.impact_brl,
      qtd_periodo: r.qty_period,
      compras: r.purchases_lifetime,
      confianca: r.confidence,
      fornecedor: r.last_supplier_name ?? "",
      alerta: [
        r.suspect_packaging ? "possível troca de embalagem" : "",
        r.supplier_changed ? "trocou de fornecedor" : "",
        r.multi_unit ? "insumo com mais de uma unidade" : "",
      ].filter(Boolean).join(" · "),
    })),
  });

  sheets.push({
    name: "Fornecedores",
    columns: [
      { key: "fornecedor", label: "Fornecedor", width: 28 },
      { key: "categoria", label: "Categoria", width: 16 },
      { key: "pedidos", label: "Pedidos", type: "number", width: 10 },
      { key: "gasto", label: "Gasto", type: "currency", width: 16 },
      { key: "participacao", label: "Participação", type: "percent", width: 13 },
      { key: "prazo_real", label: "Prazo real (dias)", type: "number", width: 15 },
      { key: "prazo_prometido", label: "Prazo prometido", type: "number", width: 15 },
      { key: "no_prazo", label: "% no prazo", type: "percent", width: 12 },
      { key: "medidos", label: "Pedidos medidos", type: "number", width: 15 },
      { key: "recebido", label: "% recebido", type: "percent", width: 12 },
      { key: "minimo", label: "Pedido mínimo", type: "currency", width: 15 },
      { key: "abaixo", label: "Pedidos abaixo do mínimo", type: "number", width: 22 },
    ],
    rows: data.suppliers.rows.map((r) => ({
      fornecedor: r.name,
      categoria: r.category ?? "",
      pedidos: r.orders,
      gasto: r.spend,
      participacao: r.share,
      prazo_real: r.avg_lead_days,
      prazo_prometido: r.promised_lead_days,
      no_prazo: r.on_time_pct,
      medidos: r.measurable,
      recebido: r.fill_rate,
      minimo: r.minimum_order,
      abaixo: r.below_minimum_orders,
    })),
  });

  sheets.push({
    name: "Curva ABC",
    columns: [
      { key: "classe", label: "Classe", width: 8 },
      { key: "insumo", label: "Insumo", width: 32 },
      { key: "gasto", label: "Gasto", type: "currency", width: 16 },
      { key: "participacao", label: "Participação", type: "percent", width: 13 },
      { key: "acumulado", label: "Acumulado", type: "percent", width: 12 },
      { key: "qtd", label: "Quantidade", type: "number", width: 12 },
      { key: "unidade", label: "Unidade", width: 10 },
      { key: "preco_medio", label: "Preço médio", type: "currency", width: 14 },
      { key: "compras", label: "Compras", type: "number", width: 10 },
    ],
    rows: data.abc.rows.map((r) => ({
      classe: r.abc,
      insumo: r.name,
      gasto: r.spend,
      participacao: r.share,
      acumulado: r.cum_share,
      qtd: r.qty,
      unidade: r.unit,
      preco_medio: r.avg_price,
      compras: r.purchases,
    })),
  });

  sheets.push({
    name: "Recebimentos",
    columns: [
      { key: "pedido", label: "Pedido", width: 16 },
      { key: "fornecedor", label: "Fornecedor", width: 26 },
      { key: "insumo", label: "Insumo", width: 30 },
      { key: "pedido_qtd", label: "Qtd pedida", type: "number", width: 12 },
      { key: "recebido_qtd", label: "Qtd recebida", type: "number", width: 13 },
      { key: "tipo", label: "Tipo", width: 10 },
      { key: "valor", label: "Valor da diferença", type: "currency", width: 18 },
    ],
    rows: data.receiving.divergences.map((d) => ({
      pedido: d.order_number,
      fornecedor: d.supplier,
      insumo: d.ingredient,
      pedido_qtd: d.ordered,
      recebido_qtd: d.received,
      tipo: d.kind,
      valor: d.value_diff,
    })),
  });

  if (quotations) {
    sheets.push({
      name: "Cotações",
      columns: [
        { key: "fornecedor", label: "Fornecedor", width: 28 },
        { key: "convites", label: "Convites", type: "number", width: 11 },
        { key: "respostas", label: "Respostas", type: "number", width: 11 },
        { key: "taxa", label: "Taxa de resposta", type: "percent", width: 16 },
        { key: "vitorias", label: "Vitórias", type: "number", width: 10 },
        { key: "recusas", label: "Recusas", type: "number", width: 10 },
        { key: "tempo", label: "Tempo médio (h)", type: "number", width: 15 },
      ],
      rows: quotations.bySupplier.map((s) => ({
        fornecedor: s.name,
        convites: s.invited,
        respostas: s.responded,
        taxa: s.response_rate,
        vitorias: s.wins,
        recusas: s.refusals,
        tempo: s.avg_response_hours,
      })),
    });
  }

  sheets.push({
    name: "Linhas",
    columns: [
      { key: "data", label: "Data efetiva", width: 13 },
      { key: "pedido", label: "Pedido", width: 16 },
      { key: "status", label: "Status", width: 12 },
      { key: "fornecedor", label: "Fornecedor", width: 26 },
      { key: "insumo", label: "Insumo", width: 30 },
      { key: "qtd", label: "Quantidade", type: "number", width: 12 },
      { key: "unidade", label: "Unidade", width: 10 },
      { key: "preco", label: "Preço unitário", type: "currency", width: 15 },
      { key: "total", label: "Total", type: "currency", width: 15 },
    ],
    rows: data.lines
      .filter((l) => l.in_period)
      .map((l) => ({
        data: formatDateOnly(l.effective_date),
        pedido: l.order_number,
        status: l.status,
        fornecedor: l.supplier_name,
        insumo: l.ingredient_name,
        qtd: l.quantity,
        unidade: l.unit,
        preco: l.unit_price,
        total: l.total_price,
      })),
  });

  return sheets;
}

export function exportPurchaseReportsXlsx(ctx: ExportContext) {
  exportToXlsx(`relatorio-compras-${ctx.periodLabel}`, buildSheets(ctx));
}

// --------------------------------------------------------------------- PDF

/**
 * jsPDF precisa dos bytes da imagem, não da URL servida pelo Vite — e precisa
 * das dimensões em pt. A proporção vem do próprio arquivo: fixar largura e
 * altura na mão achata o logo se a arte mudar.
 */
async function loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const res = await fetch(logoVelara);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const ratio = await new Promise<number>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1);
      img.onerror = () => resolve(1);
      img.src = dataUrl;
    });
    return { dataUrl, ratio };
  } catch {
    return null; // sem logo o relatório ainda sai — não vale abortar por isso
  }
}

export async function exportPurchaseReportsPdf(ctx: ExportContext) {
  const { data, quotations, businessName, periodLabel } = ctx;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  const logo = await loadLogo();
  if (logo) {
    const h = 34; // altura fixa; a largura acompanha a proporção do arquivo
    doc.addImage(logo.dataUrl, "PNG", margin, 26, h * logo.ratio, h);
  }

  doc.setFontSize(16);
  doc.text("Relatório de Compras", margin, 82);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`${businessName} · período ${periodLabel}`, margin, 98);
  doc.setTextColor(0);
  doc.setDrawColor(210);
  doc.line(margin, 108, pageW - margin, 108);

  let y = 128;

  const section = (title: string, head: string[], body: (string | number)[][]) => {
    if (!body.length) return;
    doc.setFontSize(12);
    doc.text(title, margin, y);
    autoTable(doc, {
      startY: y + 8,
      head: [head],
      body,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 24;
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = 60;
    }
  };

  section(
    "Resumo",
    ["Indicador", "Valor"],
    [
      ["Total comprado", formatBRL(data.kpis.spend)],
      ["Pedidos", String(data.kpis.orders)],
      ["Ticket médio por pedido", formatBRL(data.kpis.avgOrder)],
      ["Custo a mais (altas de preço)", formatBRL(data.price.totals.impactUp)],
      ["Economia (baixas de preço)", formatBRL(Math.abs(data.price.totals.impactDown))],
      ["Insumos comparáveis", String(data.price.sample.comparable)],
    ],
  );

  section(
    "Maiores altas de preço",
    ["Insumo", "Antes", "Agora", "Variação", "Custo a mais"],
    data.price.topIncreases.slice(0, 15).map((r) => [
      `${r.ingredient_name} (${r.unit})`,
      r.prev_price != null ? formatBRL(r.prev_price) : "—",
      formatBRL(r.last_price),
      pctText(r.delta_pct),
      r.impact_brl != null ? formatBRL(r.impact_brl) : "—",
    ]),
  );

  section(
    "Maiores baixas de preço",
    ["Insumo", "Antes", "Agora", "Variação", "Economia"],
    data.price.topDecreases.slice(0, 15).map((r) => [
      `${r.ingredient_name} (${r.unit})`,
      r.prev_price != null ? formatBRL(r.prev_price) : "—",
      formatBRL(r.last_price),
      pctText(r.delta_pct),
      r.impact_brl != null ? formatBRL(Math.abs(r.impact_brl)) : "—",
    ]),
  );

  section(
    "Fornecedores",
    ["Fornecedor", "Pedidos", "Gasto", "Part.", "No prazo", "Recebido"],
    data.suppliers.rows.slice(0, 20).map((r) => [
      r.name,
      String(r.orders),
      formatBRL(r.spend),
      pctText(r.share),
      r.on_time_pct != null ? `${pctText(r.on_time_pct)} (${r.measurable})` : "sem base",
      pctText(r.fill_rate),
    ]),
  );

  section(
    "Curva ABC · classe A",
    ["Insumo", "Gasto", "Part.", "Acum."],
    data.abc.rows
      .filter((r) => r.abc === "A")
      .slice(0, 25)
      .map((r) => [r.name, formatBRL(r.spend), pctText(r.share), pctText(r.cum_share)]),
  );

  if (quotations && quotations.requests > 0) {
    section(
      "Cotações",
      ["Indicador", "Valor"],
      [
        ["Cotações no período", String(quotations.requests)],
        ["Taxa de resposta", `${pctText(quotations.responseRate)} (${quotations.linksSubmitted}/${quotations.linksSent})`],
        ["Itens sem nenhuma oferta", String(quotations.itemsWithoutOffer)],
        ["Economia na decisão", formatBRL(quotations.savingsVsAvg)],
        ["Economia potencial (teto)", formatBRL(quotations.savingsVsMax)],
        ["Deixou de economizar", formatBRL(quotations.overpayVsMin)],
      ],
    );
  }

  section(
    "Recebimentos",
    ["Indicador", "Valor"],
    [
      ["Pedidos no período", String(data.receiving.ordersInPeriod)],
      [
        "Entrega no prazo",
        data.receiving.onTimePct != null
          ? `${pctText(data.receiving.onTimePct)} (${data.receiving.onTime}/${data.receiving.measurable})`
          : "sem base",
      ],
      ["Divergências de quantidade", String(data.receiving.divergences.length)],
      ["Pedidos encerrados incompletos", String(data.receiving.closedIncomplete.length)],
    ],
  );

  // Rodapé com paginação, escrito no fim para saber o total de páginas.
  const pages = doc.getNumberOfPages();
  const generated = new Date().toLocaleString("pt-BR");
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(
      `Gerado pelo Velara em ${generated}`,
      margin,
      doc.internal.pageSize.getHeight() - 24,
    );
    doc.text(
      `${p} de ${pages}`,
      pageW - margin,
      doc.internal.pageSize.getHeight() - 24,
      { align: "right" },
    );
  }

  doc.save(`relatorio-compras-${periodLabel}.pdf`);
}
