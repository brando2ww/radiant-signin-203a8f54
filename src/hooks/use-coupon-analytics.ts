import { useMemo } from "react";
import { useCouponUsageHistory, CouponUsageRow } from "./use-coupon-usage-history";

export interface CouponAnalytics {
  rows: CouponUsageRow[];
  isLoading: boolean;
  totals: {
    uses: number;
    savings: number;
    revenue: number;
    avgTicket: number;
    avgDiscount: number;
    firstUse: Date | null;
    lastUse: Date | null;
  };
  perDay: Array<{ date: string; label: string; uses: number; savings: number }>;
  perWeekday: Array<{ weekday: string; uses: number }>;
  perTimeBucket: Array<{ bucket: string; uses: number }>;
  topCustomers: Array<{ name: string; uses: number; savings: number }>;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TIME_BUCKETS = [
  { label: "Madrugada (00-06)", from: 0, to: 6 },
  { label: "Manhã (06-12)", from: 6, to: 12 },
  { label: "Tarde (12-18)", from: 12, to: 18 },
  { label: "Noite (18-24)", from: 18, to: 24 },
];

export function useCouponAnalytics(code: string | null, enabled = true): CouponAnalytics {
  const { data: rows = [], isLoading } = useCouponUsageHistory(code, enabled);

  return useMemo(() => {
    const totals = {
      uses: rows.length,
      savings: 0,
      revenue: 0,
      avgTicket: 0,
      avgDiscount: 0,
      firstUse: null as Date | null,
      lastUse: null as Date | null,
    };

    const dayMap = new Map<string, { date: string; uses: number; savings: number }>();
    const weekdayMap = new Map<number, number>();
    const bucketMap = new Map<string, number>();
    const customerMap = new Map<string, { uses: number; savings: number }>();

    // Seed last 30 days so chart shows continuous timeline
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { date: key, uses: 0, savings: 0 });
    }

    for (const r of rows) {
      const d = new Date(r.created_at);
      const disc = Number(r.discount || 0);
      const total = Number(r.total || 0);
      totals.savings += disc;
      totals.revenue += total;
      if (!totals.firstUse || d < totals.firstUse) totals.firstUse = d;
      if (!totals.lastUse || d > totals.lastUse) totals.lastUse = d;

      const dayKey = d.toISOString().slice(0, 10);
      if (dayMap.has(dayKey)) {
        const cur = dayMap.get(dayKey)!;
        cur.uses += 1;
        cur.savings += disc;
      }

      weekdayMap.set(d.getDay(), (weekdayMap.get(d.getDay()) ?? 0) + 1);

      const hr = d.getHours();
      const bucket = TIME_BUCKETS.find((b) => hr >= b.from && hr < b.to)?.label ?? TIME_BUCKETS[3].label;
      bucketMap.set(bucket, (bucketMap.get(bucket) ?? 0) + 1);

      const name = (r.customer_name || "Sem nome").trim() || "Sem nome";
      const cur = customerMap.get(name) ?? { uses: 0, savings: 0 };
      cur.uses += 1;
      cur.savings += disc;
      customerMap.set(name, cur);
    }

    totals.avgTicket = totals.uses ? totals.revenue / totals.uses : 0;
    totals.avgDiscount = totals.uses ? totals.savings / totals.uses : 0;

    const perDay = Array.from(dayMap.values()).map((d) => {
      const [, m, day] = d.date.split("-");
      return { ...d, label: `${day}/${m}` };
    });

    const perWeekday = WEEKDAYS.map((w, i) => ({
      weekday: w,
      uses: weekdayMap.get(i) ?? 0,
    }));

    const perTimeBucket = TIME_BUCKETS.map((b) => ({
      bucket: b.label,
      uses: bucketMap.get(b.label) ?? 0,
    }));

    const topCustomers = Array.from(customerMap.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.uses - a.uses || b.savings - a.savings)
      .slice(0, 5);

    return {
      rows,
      isLoading,
      totals,
      perDay,
      perWeekday,
      perTimeBucket,
      topCustomers,
    };
  }, [rows, isLoading]);
}
