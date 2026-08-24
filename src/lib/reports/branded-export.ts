/**
 * Exportação de relatório em PDF e Excel, com a identidade Velara.
 *
 * Um relatório descreve o que quer imprimir — título, período, filtros, KPIs e
 * seções de tabela — e este módulo resolve o resto. A tela nunca fala com jsPDF
 * nem com o xlsx diretamente.
 *
 * REGRA QUE NÃO PODE SER QUEBRADA: o `BrandedReport` é montado a partir do
 * MESMO dado que já está na tela. Se a exportação for buscar de novo, um filtro
 * esquecido faz o papel dizer uma coisa e a tela outra — e o papel é o que vai
 * para a reunião com o contador.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToXlsx, type XlsxSheet, type XlsxColumn, type XlsxColumnType } from "@/lib/xlsx-export";
import { BRAND_INK, BRAND_MUTED, drawBrandFooter, loadBrandLogo, slugifyFilename } from "./brand";

export type ReportCell = string | number | null | undefined;

export interface ReportSection {
  title?: string;
  columns: string[];
  rows: ReportCell[][];
  /** Alinhamento por índice de coluna. Números à direita, sempre. */
  align?: Record<number, "left" | "right" | "center">;
  /** Tipo por índice de coluna — faz o Excel sair com número, não com texto. */
  types?: Record<number, XlsxColumnType>;
  /** Linha de fechamento, destacada. */
  totals?: ReportCell[];
  /** Frase que substitui a tabela quando não há linha nenhuma. */
  emptyLabel?: string;
}

export interface BrandedReport {
  /** Nome do relatório, como aparece no catálogo. */
  title: string;
  businessName: string;
  /** "01/08/2026 a 24/08/2026" */
  periodLabel: string;
  /** O que estava filtrado na tela. Sem isto, PDF filtrado vira número errado. */
  filtersLabel?: string;
  kpis?: { label: string; value: string }[];
  sections: ReportSection[];
  /**
   * Planilhas no formato nativo do xlsx-export.
   *
   * Quando presentes, o Excel sai delas, preservando tipo e largura de coluna
   * que a tela já definiu. As `sections` seguem servindo ao PDF. Evita que o
   * relatório mantenha duas descrições do mesmo dado.
   */
  xlsxSheets?: XlsxSheet[];
  /** Base do nome do arquivo. Padrão: título + período. */
  filename?: string;
}

const cell = (v: ReportCell): string => (v === null || v === undefined ? "—" : String(v));

function nomeArquivo(r: BrandedReport): string {
  return r.filename ?? slugifyFilename(r.title, r.periodLabel.replace(/\s+a\s+/, "_"));
}

// --------------------------------------------------------------------- Excel

export function exportReportXlsx(r: BrandedReport): void {
  const sheets: XlsxSheet[] = [];

  // Capa: quem gerou, quando, de que período e com quais filtros. É a aba que
  // responde "de onde saiu esse número?" três meses depois.
  const capa: Array<Record<string, unknown>> = [
    { campo: "Relatório", valor: r.title },
    { campo: "Estabelecimento", valor: r.businessName },
    { campo: "Período", valor: r.periodLabel },
  ];
  if (r.filtersLabel) capa.push({ campo: "Filtros aplicados", valor: r.filtersLabel });
  capa.push({ campo: "Gerado em", valor: new Date().toLocaleString("pt-BR") });
  (r.kpis ?? []).forEach((k) => capa.push({ campo: k.label, valor: k.value }));

  sheets.push({
    name: "Resumo",
    rows: capa,
    columns: [
      { key: "campo", label: "Campo", width: 32 },
      { key: "valor", label: "Valor", width: 46 },
    ],
  });

  if (r.xlsxSheets) {
    exportToXlsx(nomeArquivo(r), [...sheets, ...r.xlsxSheets]);
    return;
  }

  r.sections.forEach((s, idx) => {
    const columns: XlsxColumn[] = s.columns.map((label, i) => ({
      key: `c${i}`,
      label,
      type: s.types?.[i],
      width: Math.max(14, label.length + 4),
    }));
    const linhas = [...s.rows, ...(s.totals ? [s.totals] : [])];
    sheets.push({
      name: s.title || `Dados ${idx + 1}`,
      rows: linhas.map((row) =>
        Object.fromEntries(row.map((v, i) => [`c${i}`, v ?? ""])),
      ),
      columns,
    });
  });

  exportToXlsx(nomeArquivo(r), sheets);
}

// ----------------------------------------------------------------------- PDF

export async function exportReportPdf(r: BrandedReport): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();

  const logo = await loadBrandLogo();
  if (logo) {
    const h = 34;
    doc.addImage(logo.dataUrl, "PNG", margin, 26, h * logo.ratio, h);
  }

  doc.setFontSize(16);
  doc.text(r.title, margin, 84);

  doc.setFontSize(10);
  doc.setTextColor(110);
  let y = 100;
  doc.text(`${r.businessName} · ${r.periodLabel}`, margin, y);
  if (r.filtersLabel) {
    y += 14;
    // Filtro longo quebra em várias linhas em vez de sumir na borda.
    const linhas = doc.splitTextToSize(r.filtersLabel, pageW - margin * 2);
    doc.text(linhas, margin, y);
    y += (linhas.length - 1) * 12;
  }
  doc.setTextColor(0);

  let cursor = y + 18;

  if (r.kpis?.length) {
    autoTable(doc, {
      startY: cursor,
      head: [r.kpis.map((k) => k.label)],
      body: [r.kpis.map((k) => k.value)],
      theme: "grid",
      headStyles: { fillColor: BRAND_INK, fontSize: 8 },
      styles: { fontSize: 10, halign: "center" },
    });
    cursor = (doc as any).lastAutoTable.finalY + 20;
  }

  r.sections.forEach((s) => {
    if (s.title) {
      doc.setFontSize(11);
      doc.text(s.title, margin, cursor);
      cursor += 12;
    }

    if (s.rows.length === 0) {
      doc.setFontSize(9);
      doc.setTextColor(130);
      doc.text(s.emptyLabel ?? "Sem dados no período.", margin, cursor + 6);
      doc.setTextColor(0);
      cursor += 30;
      return;
    }

    const columnStyles: Record<number, { halign: "left" | "right" | "center" }> = {};
    Object.entries(s.align ?? {}).forEach(([i, a]) => {
      columnStyles[Number(i)] = { halign: a };
    });

    autoTable(doc, {
      startY: cursor,
      head: [s.columns],
      body: s.rows.map((row) => row.map(cell)),
      foot: s.totals ? [s.totals.map(cell)] : undefined,
      theme: "striped",
      headStyles: { fillColor: BRAND_INK, fontSize: 8 },
      footStyles: { fillColor: BRAND_MUTED, textColor: 30, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles,
      margin: { left: margin, right: margin },
    });
    cursor = (doc as any).lastAutoTable.finalY + 22;
  });

  drawBrandFooter(doc, margin);
  doc.save(`${nomeArquivo(r)}.pdf`);
}

/** Atalho para as telas: um clique, o formato escolhido. */
export async function exportReport(kind: "pdf" | "xlsx", r: BrandedReport): Promise<void> {
  if (kind === "pdf") await exportReportPdf(r);
  else exportReportXlsx(r);
}

// ------------------------------------------------------- Ponte com o xlsx

/**
 * Como cada tipo de coluna vira texto no PDF.
 *
 * O Excel guarda o número cru e formata na célula; o PDF é papel e precisa do
 * texto pronto. Sem isto, uma coluna de dinheiro sairia "159.8" no relatório
 * que vai para a reunião.
 */
function textoDaCelula(v: unknown, tipo?: XlsxColumnType): string {
  if (v === null || v === undefined || v === "") return "—";
  if (tipo === "currency" && typeof v === "number") {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (tipo === "percent" && typeof v === "number") {
    return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  }
  if (tipo === "number" && typeof v === "number") {
    return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  if (tipo === "date" || tipo === "datetime") {
    const d = v instanceof Date ? v : new Date(String(v));
    if (!isNaN(d.getTime())) {
      return tipo === "date" ? d.toLocaleDateString("pt-BR") : d.toLocaleString("pt-BR");
    }
  }
  return String(v);
}

const NUMERICO: XlsxColumnType[] = ["currency", "number", "percent"];

/**
 * Monta o relatório de marca a partir das planilhas que a tela já constrói.
 *
 * É o caminho de menor risco para ligar PDF nos relatórios que hoje só têm
 * Excel: o dado é o mesmo, a planilha continua idêntica, e o PDF nasce da
 * mesma fonte — que é a regra que impede tela e papel de divergirem.
 */
export function brandedFromSheets(
  meta: Omit<BrandedReport, "sections" | "xlsxSheets">,
  sheets: XlsxSheet[],
): BrandedReport {
  const sections: ReportSection[] = sheets.map((sheet) => {
    const columns: XlsxColumn[] =
      sheet.columns ??
      (sheet.rows[0]
        ? Object.keys(sheet.rows[0]).map((k) => ({ key: k, label: k }))
        : []);

    const align: Record<number, "left" | "right"> = {};
    columns.forEach((c, i) => {
      if (c.type && NUMERICO.includes(c.type)) align[i] = "right";
    });

    return {
      title: sheet.name,
      columns: columns.map((c) => c.label),
      rows: sheet.rows.map((row) => columns.map((c) => textoDaCelula(row[c.key], c.type))),
      align,
      emptyLabel: "Sem movimento no período.",
    };
  });

  return { ...meta, sections, xlsxSheets: sheets };
}
