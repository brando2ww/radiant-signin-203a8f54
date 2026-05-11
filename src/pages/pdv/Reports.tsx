import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { usePDVReports } from "@/hooks/use-pdv-reports";
import { ReportSummaryCards } from "@/components/pdv/ReportSummaryCards";
import { PaymentMethodChart } from "@/components/pdv/PaymentMethodChart";
import { ProductsTable } from "@/components/pdv/ProductsTable";
import { HourlySalesChart } from "@/components/pdv/HourlySalesChart";
import { MonthlyRevenueSection } from "@/components/pdv/MonthlyRevenueSection";

export default function PDVReports() {
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));

  const {
    salesReport,
    paymentReport,
    productReport,
    hourlyReport,
    isLoading,
  } = usePDVReports(startDate, endDate);

  const quickFilters = [
    { label: "Hoje", days: 0 },
    { label: "Últimos 7 dias", days: 7 },
    { label: "Últimos 30 dias", days: 30 },
    { label: "Este mês", special: "month" },
  ];

  const handleQuickFilter = (filter: any) => {
    if (filter.special === "month") {
      setStartDate(startOfMonth(new Date()));
      setEndDate(endOfMonth(new Date()));
    } else {
      setStartDate(subDays(new Date(), filter.days));
      setEndDate(new Date());
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-muted-foreground">
            Análise detalhada de vendas e performance
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP", { locale: ptBR }) : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <span className="text-muted-foreground">até</span>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP", { locale: ptBR }) : "Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex gap-2 flex-wrap">
              {quickFilters.map((filter) => (
                <Button
                  key={filter.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickFilter(filter)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

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
