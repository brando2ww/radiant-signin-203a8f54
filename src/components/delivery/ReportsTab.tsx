import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { useDeliveryMetrics, useDailySales, useTopProducts } from "@/hooks/use-delivery-reports";
import { useDeliveryMetricsComparison } from "@/hooks/use-delivery-metrics-comparison";
import { usePeakHours } from "@/hooks/use-peak-hours";
import { useNeighborhoodPerformance } from "@/hooks/use-neighborhood-performance";
import { DeliveryMetricsCards } from "./reports/DeliveryMetrics";
import { SalesChart } from "./reports/SalesChart";
import { TopProducts } from "./reports/TopProducts";
import { OrdersAnalysis } from "./reports/OrdersAnalysis";
import { PurchaseFunnel } from "./reports/PurchaseFunnel";
import { PeakHoursHeatmap } from "./reports/PeakHoursHeatmap";
import { NeighborhoodPerformance } from "./reports/NeighborhoodPerformance";
import { ReportsToolbar } from "./reports/ReportsToolbar";
import { subDays, startOfMonth, endOfMonth } from "date-fns";
import { DateRange } from "react-day-picker";
import { Loader2 } from "lucide-react";

export const ReportsTab = () => {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const startDate = dateRange?.from || subDays(new Date(), 30);
  const endDate = dateRange?.to || new Date();
  const userId = user?.id || "";

  const { data: metrics, isLoading: metricsLoading } = useDeliveryMetrics(userId, startDate, endDate);
  const { data: dailySales, isLoading: salesLoading } = useDailySales(userId, startDate, endDate);
  const { data: topProducts, isLoading: productsLoading } = useTopProducts(userId, startDate, endDate);
  const { data: comparison } = useDeliveryMetricsComparison(userId, startDate, endDate, metrics);
  const { data: peakHours } = usePeakHours(userId, startDate, endDate);
  const { data: neighborhoods } = useNeighborhoodPerformance(userId, startDate, endDate);

  const isLoading = metricsLoading || salesLoading || productsLoading;

  const handleQuickPeriod = (days: number) => {
    setDateRange({ from: subDays(new Date(), days), to: new Date() });
  };
  const handleCurrentMonth = () => {
    setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
  };

  return (
    <div className="space-y-6">
      <ReportsToolbar
        disabled={isLoading}
        payload={{
          startDate,
          endDate,
          metrics,
          dailySales,
          topProducts,
          peakHours,
          neighborhoods,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Período de Análise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => handleQuickPeriod(7)}>
              Últimos 7 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleQuickPeriod(15)}>
              Últimos 15 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleQuickPeriod(30)}>
              Últimos 30 dias
            </Button>
            <Button variant="outline" size="sm" onClick={handleCurrentMonth}>
              Mês Atual
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {metrics && <DeliveryMetricsCards metrics={metrics} comparison={comparison} />}

          {dailySales && <SalesChart data={dailySales} />}

          {metrics && <OrdersAnalysis metrics={metrics} />}

          {topProducts && (
            <TopProducts
              products={topProducts}
              userId={userId}
              startDate={startDate}
              endDate={endDate}
            />
          )}

          <PurchaseFunnel userId={userId} startDate={startDate} endDate={endDate} />

          <PeakHoursHeatmap userId={userId} startDate={startDate} endDate={endDate} />

          <NeighborhoodPerformance userId={userId} startDate={startDate} endDate={endDate} />
        </>
      )}
    </div>
  );
};
