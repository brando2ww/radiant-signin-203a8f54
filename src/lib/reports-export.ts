import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import type { DeliveryMetrics, DailySales, TopProduct } from "@/hooks/use-delivery-reports";
import type { PeakHoursData } from "@/hooks/use-peak-hours";
import type { NeighborhoodRow } from "@/hooks/use-neighborhood-performance";

export interface ReportPayload {
  startDate: Date;
  endDate: Date;
  metrics?: DeliveryMetrics;
  dailySales?: DailySales[];
  topProducts?: TopProduct[];
  peakHours?: PeakHoursData;
  neighborhoods?: NeighborhoodRow[];
}

function fmtRange(p: ReportPayload) {
  return `${format(p.startDate, "dd/MM/yyyy", { locale: ptBR })} – ${format(
    p.endDate,
    "dd/MM/yyyy",
    { locale: ptBR }
  )}`;
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportReportCSV(p: ReportPayload) {
  const lines: string[] = [];
  lines.push(`Relatório de Delivery;${fmtRange(p)}`);
  lines.push("");

  if (p.metrics) {
    lines.push("Indicadores");
    lines.push("Métrica;Valor");
    lines.push(`Total de pedidos;${p.metrics.totalOrders}`);
    lines.push(`Receita total;${p.metrics.totalRevenue.toFixed(2)}`);
    lines.push(`Ticket médio;${p.metrics.averageTicket.toFixed(2)}`);
    lines.push(`Concluídos;${p.metrics.completedOrders}`);
    lines.push(`Cancelados;${p.metrics.cancelledOrders}`);
    lines.push(`Taxa de cancelamento (%);${p.metrics.cancellationRate.toFixed(2)}`);
    lines.push(`Tempo médio de entrega (min);${p.metrics.avgDeliveryTimeMin.toFixed(1)}`);
    lines.push(`Pedidos delivery;${p.metrics.deliveryOrders}`);
    lines.push(`Retiradas;${p.metrics.pickupOrders}`);
    lines.push("");
  }

  if (p.dailySales?.length) {
    lines.push("Evolução de vendas");
    lines.push("Data;Pedidos;Receita;Ticket médio");
    p.dailySales.forEach((d) => {
      lines.push(
        `${d.date};${d.orders};${d.revenue.toFixed(2)};${d.averageTicket.toFixed(2)}`
      );
    });
    lines.push("");
  }

  if (p.topProducts?.length) {
    lines.push("Produtos mais vendidos");
    lines.push("Produto;Categoria;Quantidade;Receita;% Receita");
    p.topProducts.forEach((t) => {
      lines.push(
        [t.productName, t.category ?? "", t.quantity, t.revenue.toFixed(2), t.revenueShare.toFixed(2)]
          .map(csvEscape)
          .join(";")
      );
    });
    lines.push("");
  }

  if (p.peakHours) {
    lines.push("Pedidos por hora do dia");
    lines.push("Hora;Pedidos");
    p.peakHours.byHour.forEach((h) =>
      lines.push(`${h.hour.toString().padStart(2, "0")}h;${h.orders}`)
    );
    lines.push("");
  }

  if (p.neighborhoods?.length) {
    lines.push("Desempenho por bairro");
    lines.push("Bairro;Pedidos;Receita;Ticket médio;Taxa cancel (%);% Total");
    p.neighborhoods.forEach((n) => {
      lines.push(
        [
          n.neighborhood,
          n.orders,
          n.revenue.toFixed(2),
          n.averageTicket.toFixed(2),
          n.cancellationRate.toFixed(2),
          n.share.toFixed(2),
        ]
          .map(csvEscape)
          .join(";")
      );
    });
  }

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  download(`relatorio-delivery-${format(p.startDate, "yyyyMMdd")}-${format(p.endDate, "yyyyMMdd")}.csv`, blob);
}

export function exportReportPDF(p: ReportPayload) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = margin;

  doc.setFontSize(16);
  doc.text("Relatório de Delivery", margin, y);
  y += 18;
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Período: ${fmtRange(p)}`, margin, y);
  doc.setTextColor(0);
  y += 16;

  if (p.metrics) {
    autoTable(doc, {
      startY: y,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de pedidos", String(p.metrics.totalOrders)],
        ["Receita total", formatBRL(p.metrics.totalRevenue)],
        ["Ticket médio", formatBRL(p.metrics.averageTicket)],
        ["Concluídos", String(p.metrics.completedOrders)],
        ["Cancelados", String(p.metrics.cancelledOrders)],
        ["Taxa de cancelamento", `${p.metrics.cancellationRate.toFixed(1)}%`],
        ["Tempo médio de entrega", `${Math.round(p.metrics.avgDeliveryTimeMin)} min`],
        ["Pedidos delivery", String(p.metrics.deliveryOrders)],
        ["Retiradas no local", String(p.metrics.pickupOrders)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 30, 30] },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  if (p.dailySales?.length) {
    autoTable(doc, {
      startY: y,
      head: [["Data", "Pedidos", "Receita", "Ticket médio"]],
      body: p.dailySales.map((d) => [
        format(new Date(d.date + "T00:00:00"), "dd/MM/yyyy"),
        d.orders,
        formatBRL(d.revenue),
        formatBRL(d.averageTicket),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
      didDrawPage: () => {},
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  if (p.topProducts?.length) {
    autoTable(doc, {
      startY: y,
      head: [["#", "Produto", "Categoria", "Qtd", "Receita", "% Receita"]],
      body: p.topProducts.map((t, i) => [
        i + 1,
        t.productName,
        t.category ?? "—",
        t.quantity,
        formatBRL(t.revenue),
        `${t.revenueShare.toFixed(1)}%`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  if (p.peakHours) {
    autoTable(doc, {
      startY: y,
      head: [["Hora", "Pedidos"]],
      body: p.peakHours.byHour.map((h) => [
        `${h.hour.toString().padStart(2, "0")}h`,
        h.orders,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  if (p.neighborhoods?.length) {
    autoTable(doc, {
      startY: y,
      head: [["Bairro", "Pedidos", "Receita", "Ticket Médio", "Cancel %", "% Total"]],
      body: p.neighborhoods.map((n) => [
        n.neighborhood,
        n.orders,
        formatBRL(n.revenue),
        formatBRL(n.averageTicket),
        `${n.cancellationRate.toFixed(1)}%`,
        `${n.share.toFixed(1)}%`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
    });
  }

  doc.save(
    `relatorio-delivery-${format(p.startDate, "yyyyMMdd")}-${format(p.endDate, "yyyyMMdd")}.pdf`
  );
}
