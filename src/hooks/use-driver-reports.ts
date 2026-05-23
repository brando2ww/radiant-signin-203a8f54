import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

export interface DriverOrderRow {
  id: string;
  order_number: string;
  driver_id: string;
  status: string;
  total: number;
  delivery_fee: number;
  created_at: string;
  driver_assigned_at: string | null;
  delivered_at: string | null;
}

export interface DriverPerf {
  driver_id: string;
  deliveries: number;
  inRoute: number;
  cancelled: number;
  revenue: number;
  fees: number;
  avgTicket: number;
  avgRouteMinutes: number | null;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const BUCKETS = [
  { label: "Madrugada (00-06)", from: 0, to: 6 },
  { label: "Manhã (06-12)", from: 6, to: 12 },
  { label: "Tarde (12-18)", from: 12, to: 18 },
  { label: "Noite (18-24)", from: 18, to: 24 },
];

export interface DriverReportRange {
  from: Date;
  to: Date;
}

export function useDriverReports(
  range: DriverReportRange,
  driverId: string | "all" = "all",
) {
  const { visibleUserId } = useEstablishmentId();

  const fromStart = useMemo(() => {
    const d = new Date(range.from);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [range.from]);

  const toEnd = useMemo(() => {
    const d = new Date(range.to);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [range.to]);

  const query = useQuery({
    queryKey: ["driver-reports", visibleUserId, fromStart.toISOString(), toEnd.toISOString()],
    queryFn: async (): Promise<DriverOrderRow[]> => {
      if (!visibleUserId) return [];
      const { data, error } = await supabase
        .from("delivery_orders")
        .select(
          "id, order_number, driver_id, status, total, delivery_fee, created_at, driver_assigned_at, delivered_at",
        )
        .eq("user_id", visibleUserId)
        .not("driver_id", "is", null)
        .gte("created_at", fromStart.toISOString())
        .lte("created_at", toEnd.toISOString())
        .limit(5000);
      if (error) throw error;
      return (data || []) as DriverOrderRow[];
    },
    enabled: !!visibleUserId,
    refetchInterval: 60_000,
  });

  return useMemo(() => {
    const rows = (query.data || []).filter(
      (r) => driverId === "all" || r.driver_id === driverId,
    );

    const totals = {
      deliveries: 0,
      inRoute: 0,
      cancelled: 0,
      revenue: 0,
      fees: 0,
      avgTicket: 0,
      avgRouteMinutes: null as number | null,
      cancellationRate: 0,
    };

    const perDay = new Map<string, { date: string; label: string; uses: number; revenue: number }>();
    const dayMs = 24 * 60 * 60 * 1000;
    const daysSpan = Math.max(
      1,
      Math.round((fromStart.getTime() && toEnd.getTime() ? (new Date(toEnd).setHours(0, 0, 0, 0) - fromStart.getTime()) / dayMs : 0)) + 1,
    );
    for (let i = 0; i < daysSpan; i++) {
      const d = new Date(fromStart);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const [, m, day] = key.split("-");
      perDay.set(key, { date: key, label: `${day}/${m}`, uses: 0, revenue: 0 });
    }

    const weekday = new Map<number, number>();
    const bucket = new Map<string, number>();
    const perDriver = new Map<string, DriverPerf & { _routeSum: number; _routeCount: number }>();

    let routeSum = 0;
    let routeCount = 0;

    for (const r of rows) {
      const d = new Date(r.created_at);
      const isCompleted = r.status === "completed";
      const isCancelled = r.status === "cancelled";
      const isInRoute = r.status === "delivering";

      if (isCompleted) {
        totals.deliveries += 1;
        totals.revenue += Number(r.total || 0);
        totals.fees += Number(r.delivery_fee || 0);
        const dayKey = d.toISOString().slice(0, 10);
        if (perDay.has(dayKey)) {
          const cur = perDay.get(dayKey)!;
          cur.uses += 1;
          cur.revenue += Number(r.total || 0);
        }
        weekday.set(d.getDay(), (weekday.get(d.getDay()) ?? 0) + 1);
        const hr = d.getHours();
        const bk = BUCKETS.find((b) => hr >= b.from && hr < b.to)?.label ?? BUCKETS[3].label;
        bucket.set(bk, (bucket.get(bk) ?? 0) + 1);

        if (r.driver_assigned_at && r.delivered_at) {
          const minutes =
            (new Date(r.delivered_at).getTime() - new Date(r.driver_assigned_at).getTime()) /
            60000;
          if (minutes > 0 && minutes < 600) {
            routeSum += minutes;
            routeCount += 1;
          }
        }
      } else if (isCancelled) {
        totals.cancelled += 1;
      } else if (isInRoute) {
        totals.inRoute += 1;
      }

      const did = r.driver_id;
      if (!perDriver.has(did)) {
        perDriver.set(did, {
          driver_id: did,
          deliveries: 0,
          inRoute: 0,
          cancelled: 0,
          revenue: 0,
          fees: 0,
          avgTicket: 0,
          avgRouteMinutes: null,
          _routeSum: 0,
          _routeCount: 0,
        });
      }
      const dp = perDriver.get(did)!;
      if (isCompleted) {
        dp.deliveries += 1;
        dp.revenue += Number(r.total || 0);
        dp.fees += Number(r.delivery_fee || 0);
        if (r.driver_assigned_at && r.delivered_at) {
          const minutes =
            (new Date(r.delivered_at).getTime() - new Date(r.driver_assigned_at).getTime()) /
            60000;
          if (minutes > 0 && minutes < 600) {
            dp._routeSum += minutes;
            dp._routeCount += 1;
          }
        }
      } else if (isCancelled) dp.cancelled += 1;
      else if (isInRoute) dp.inRoute += 1;
    }

    totals.avgTicket = totals.deliveries ? totals.revenue / totals.deliveries : 0;
    totals.avgRouteMinutes = routeCount ? routeSum / routeCount : null;
    const totalConsidered = totals.deliveries + totals.cancelled;
    totals.cancellationRate = totalConsidered ? (totals.cancelled / totalConsidered) * 100 : 0;

    const drivers = Array.from(perDriver.values()).map((dp) => ({
      ...dp,
      avgTicket: dp.deliveries ? dp.revenue / dp.deliveries : 0,
      avgRouteMinutes: dp._routeCount ? dp._routeSum / dp._routeCount : null,
    }));

    return {
      isLoading: query.isLoading,
      totals,
      perDay: Array.from(perDay.values()),
      perWeekday: WEEKDAYS.map((w, i) => ({ weekday: w, uses: weekday.get(i) ?? 0 })),
      perBucket: BUCKETS.map((b) => ({ bucket: b.label, uses: bucket.get(b.label) ?? 0 })),
      drivers,
    };
  }, [query.data, query.isLoading, fromStart, toEnd, driverId]);
}
