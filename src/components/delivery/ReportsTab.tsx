import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DatePickerWithRange, type CompareSelection } from "@/components/ui/date-range-picker";
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
import { CancelledOrders } from "./reports/CancelledOrders";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { Loader2 } from "lucide-react";

export const ReportsTab = () => {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(subDays(new Date(), 29)),
    to: endOfDay(new Date()),
  });
  const [compare, setCompare] = useState<CompareSelection | null>({
    mode: "previous",
    range: {
      from: startOfDay(subDays(new Date(), 59)),
      to: endOfDay(subDays(new Date(), 30)),
    },
  });

  const startDate = dateRange?.from || subDays(new Date(), 30);
  const endDate = dateRange?.to || new Date();
  const userId = user?.id || "";

  const { data: metrics, isLoading: metricsLoading } = useDeliveryMetrics(userId, startDate, endDate);
  const { data: dailySales, isLoading: salesLoading } = useDailySales(userId, startDate, endDate);
  const { data: topProducts, isLoading: productsLoading } = useTopProducts(userId, startDate, endDate);
  const { data: comparison } = useDeliveryMetricsComparison(
    userId,
    startDate,
    endDate,
    metrics,
    compare && compare.range.from && compare.range.to
      ? { from: compare.range.from, to: compare.range.to }
      : compare === null
        ? null
        : undefined
  );
  const { data: peakHours } = usePeakHours(userId, startDate, endDate);
  const { data: neighborhoods } = useNeighborhoodPerformance(userId, startDate, endDate);

  const isLoading = metricsLoading || salesLoading || productsLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DatePickerWithRange
          date={dateRange}
          setDate={setDateRange}
          compare={compare}
          onCompareChange={setCompare}
        />
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
      </div>

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

          <CancelledOrders userId={userId} startDate={startDate} endDate={endDate} />

        </>
      )}
    </div>
  );
};

