import { useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { usePDVReports } from "@/hooks/use-pdv-reports";
import { ReportSummaryCards } from "@/components/pdv/ReportSummaryCards";
import { PaymentMethodChart } from "@/components/pdv/PaymentMethodChart";
import { ProductsTable } from "@/components/pdv/ProductsTable";
import { HourlySalesChart } from "@/components/pdv/HourlySalesChart";
import { MonthlyRevenueSection } from "@/components/pdv/MonthlyRevenueSection";
import { ReportDateFilter } from "@/components/pdv/reports/ReportDateFilter";
import { ReportPageHeader } from "@/components/pdv/reports/ReportPageHeader";
import { exportToXlsx } from "@/lib/xlsx-export";

export default function OverviewReport() {
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const { salesReport, paymentReport, productReport, hourlyReport, isLoading } = usePDVReports(startDate, endDate);

  const onExport = () => {
    exportToXlsx(`visao-geral-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}`, [
      {
        name: "Resumo",
        rows: [
          { metrica: "Total de vendas", valor: salesReport?.totalSales ?? 0 },
          { metrica: "Total de pedidos", valor: salesReport?.totalOrders ?? 0 },
          { metrica: "Ticket médio", valor: salesReport?.averageTicket ?? 0 },
          { metrica: "Pedidos cancelados", valor: salesReport?.cancelledOrders ?? 0 },
          { metrica: "Valor cancelado", valor: salesReport?.cancelledValue ?? 0 },
        ],
        columns: [
          { key: "metrica", label: "Métrica", width: 28 },
          { key: "valor", label: "Valor", width: 16, type: "number" },
        ],
      },
      {
        name: "Pagamentos",
        rows: (paymentReport || []).map((p) => ({ metodo: p.method, qtd: p.count, total: p.total, participacao: p.percentage / 100 })),
        columns: [
          { key: "metodo", label: "Método", width: 22 },
          { key: "qtd", label: "Qtd", width: 10, type: "number" },
          { key: "total", label: "Total", width: 14, type: "currency" },
          { key: "participacao", label: "%", width: 10, type: "percent" },
        ],
      },
      {
        name: "Produtos",
        rows: (productReport || []).map((p) => ({ produto: p.product_name, qtd: p.quantity, receita: p.revenue, pedidos: p.orders })),
        columns: [
          { key: "produto", label: "Produto", width: 30 },
          { key: "qtd", label: "Qtd", width: 10, type: "number" },
          { key: "receita", label: "Receita", width: 14, type: "currency" },
          { key: "pedidos", label: "Pedidos", width: 10, type: "number" },
        ],
      },
      {
        name: "Por hora",
        rows: (hourlyReport || []).map((h) => ({ hora: `${h.hour}h`, pedidos: h.orders, vendas: h.sales, ticket_medio: h.averageTicket })),
        columns: [
          { key: "hora", label: "Hora", width: 10 },
          { key: "pedidos", label: "Pedidos", width: 10, type: "number" },
          { key: "vendas", label: "Vendas", width: 14, type: "currency" },
          { key: "ticket_medio", label: "Ticket médio", width: 14, type: "currency" },
        ],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportPageHeader
        title="Visão Geral"
        description={`Período: ${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`}
        onExport={onExport}
        exportDisabled={isLoading}
      />
      <ReportDateFilter startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
      <ReportSummaryCards data={salesReport} isLoading={isLoading} />
      <div className="grid gap-4 md:grid-cols-2">
        <PaymentMethodChart data={paymentReport} isLoading={isLoading} />
        <HourlySalesChart data={hourlyReport} isLoading={isLoading} />
      </div>
      <ProductsTable data={productReport} isLoading={isLoading} />
      <MonthlyRevenueSection />
    </div>
  );
}
