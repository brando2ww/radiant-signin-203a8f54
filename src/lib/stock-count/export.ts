/**
 * Exportação da contagem de estoque: Excel e PDF, com a marca Velara.
 *
 * Segue o mesmo caminho dos relatórios de compras — mesmo exportador de xlsx,
 * mesmo cabeçalho no PDF — para os dois saírem com a mesma cara na mão do
 * contador.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToXlsx, type XlsxSheet } from "@/lib/xlsx-export";
import { formatBRL } from "@/lib/format";
import logoVelara from "@/assets/logo_velara_preto.png";
import type { StockCount, StockCountItem } from "@/hooks/use-stock-count";

export interface StockCountExportContext {
  businessName: string;
  count: StockCount;
  items: StockCountItem[];
}

interface Linha extends StockCountItem {
  delta: number;
  valor: number;
}

function preparar(items: StockCountItem[]) {
  const contados = items.filter((i) => i.counted_qty != null);
  const linhas: Linha[] = contados.map((i) => {
    const delta = (i.counted_qty ?? 0) - i.expected_qty;
    return { ...i, delta, valor: delta * i.unit_cost };
  });
  // Ordem por dinheiro: é onde a conversa começa.
  const divergentes = linhas
    .filter((l) => Math.abs(l.delta) > 0.0001)
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  const naoContados = items.filter((i) => i.counted_qty == null);

  const sobra = divergentes.filter((l) => l.delta > 0).reduce((s, l) => s + l.valor, 0);
  const falta = divergentes.filter((l) => l.delta < 0).reduce((s, l) => s + Math.abs(l.valor), 0);

  return { linhas, divergentes, naoContados, contados, sobra, falta, liquido: sobra - falta };
}

// ------------------------------------------------------------------- Excel

export function exportStockCountXlsx(ctx: StockCountExportContext) {
  const { count, items } = ctx;
  const p = preparar(items);

  const sheets: XlsxSheet[] = [
    {
      name: "Resumo",
      rows: [
        { metrica: "Contagem", valor: count.name },
        { metrica: "Itens no escopo", valor: items.length },
        { metrica: "Contados", valor: p.contados.length },
        { metrica: "Não contados", valor: p.naoContados.length },
        { metrica: "Com divergência", valor: p.divergentes.length },
        { metrica: "Sobra (R$)", valor: p.sobra },
        { metrica: "Falta (R$)", valor: p.falta },
        { metrica: "Impacto líquido (R$)", valor: p.liquido },
      ],
      columns: [
        { key: "metrica", label: "Métrica", width: 26 },
        { key: "valor", label: "Valor", width: 18 },
      ],
    },
    {
      name: "Divergências",
      rows: p.divergentes.map((l) => ({
        insumo: l.ingredient_name,
        setor: l.sector ?? "—",
        unidade: l.unit,
        sistema: l.expected_qty,
        contado: l.counted_qty ?? 0,
        diferenca: l.delta,
        impacto: l.valor,
        contou: l.counted_by ?? "—",
      })),
      columns: [
        { key: "insumo", label: "Insumo", width: 30 },
        { key: "setor", label: "Setor", width: 16 },
        { key: "unidade", label: "Un.", width: 8 },
        { key: "sistema", label: "Sistema", width: 12, type: "number" },
        { key: "contado", label: "Contado", width: 12, type: "number" },
        { key: "diferenca", label: "Diferença", width: 12, type: "number" },
        { key: "impacto", label: "Impacto", width: 14, type: "currency" },
        { key: "contou", label: "Quem contou", width: 20 },
      ],
    },
    {
      name: "Contagem completa",
      rows: p.linhas.map((l) => ({
        insumo: l.ingredient_name,
        setor: l.sector ?? "—",
        unidade: l.unit,
        sistema: l.expected_qty,
        contado: l.counted_qty ?? 0,
        diferenca: l.delta,
        contou: l.counted_by ?? "—",
      })),
      columns: [
        { key: "insumo", label: "Insumo", width: 30 },
        { key: "setor", label: "Setor", width: 16 },
        { key: "unidade", label: "Un.", width: 8 },
        { key: "sistema", label: "Sistema", width: 12, type: "number" },
        { key: "contado", label: "Contado", width: 12, type: "number" },
        { key: "diferenca", label: "Diferença", width: 12, type: "number" },
        { key: "contou", label: "Quem contou", width: 20 },
      ],
    },
  ];

  // A aba dos não contados só existe quando há o que mostrar — aba vazia numa
  // planilha passa a impressão de que nada ficou de fora.
  if (p.naoContados.length > 0) {
    sheets.push({
      name: "Não contados",
      rows: p.naoContados.map((i) => ({
        insumo: i.ingredient_name,
        setor: i.sector ?? "—",
        unidade: i.unit,
        sistema: i.expected_qty,
      })),
      columns: [
        { key: "insumo", label: "Insumo", width: 30 },
        { key: "setor", label: "Setor", width: 16 },
        { key: "unidade", label: "Un.", width: 8 },
        { key: "sistema", label: "Sistema", width: 12, type: "number" },
      ],
    });
  }

  exportToXlsx(`contagem-${count.name.replace(/[^\w-]+/g, "-").toLowerCase()}`, sheets);
}

// --------------------------------------------------------------------- PDF

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
    return null; // sem logo o relatório ainda sai
  }
}

export async function exportStockCountPdf(ctx: StockCountExportContext) {
  const { businessName, count, items } = ctx;
  const p = preparar(items);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;

  const logo = await loadLogo();
  if (logo) {
    const h = 34;
    doc.addImage(logo.dataUrl, "PNG", margin, 26, h * logo.ratio, h);
  }

  doc.setFontSize(16);
  doc.text("Contagem de Estoque", margin, 84);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`${businessName} · ${count.name}`, margin, 100);
  doc.text(
    `${p.contados.length} de ${items.length} contados · ${p.divergentes.length} divergências`,
    margin,
    114,
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 132,
    head: [["Sobra", "Falta", "Impacto líquido"]],
    body: [[formatBRL(p.sobra), formatBRL(p.falta), formatBRL(p.liquido)]],
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 10 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [["Insumo", "Setor", "Sistema", "Contado", "Dif.", "Impacto", "Contou"]],
    body: p.divergentes.map((l) => [
      l.ingredient_name,
      l.sector ?? "—",
      `${l.expected_qty.toLocaleString("pt-BR")} ${l.unit}`,
      `${(l.counted_qty ?? 0).toLocaleString("pt-BR")} ${l.unit}`,
      `${l.delta > 0 ? "+" : ""}${l.delta.toLocaleString("pt-BR")}`,
      formatBRL(l.valor),
      l.counted_by ?? "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 5: { halign: "right" } },
  });

  if (p.naoContados.length > 0) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [[`Não contados (${p.naoContados.length})`, "Setor"]],
      body: p.naoContados.map((i) => [i.ingredient_name, i.sector ?? "—"]),
      theme: "plain",
      headStyles: { fillColor: [244, 244, 245], textColor: 60 },
      styles: { fontSize: 8, cellPadding: 2 },
    });
  }

  doc.save(`contagem-${count.name.replace(/[^\w-]+/g, "-").toLowerCase()}.pdf`);
}
