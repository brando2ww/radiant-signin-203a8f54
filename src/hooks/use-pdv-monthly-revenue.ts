import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "./use-establishment-id";
import { format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface MonthlyRevenuePoint {
  month: string; // "2025-01"
  label: string; // "jan/25"
  year: number;
  monthIndex: number; // 0-11
  salao: number;
  balcao: number;
  delivery: number;
  total: number;
}

export interface MonthlyRevenueSummary {
  currentMonth: number;
  previousMonth: number;
  sameMonthLastYear: number;
  momChange: number | null;
  yoyChange: number | null;
  ytdCurrent: number;
  ytdPrevious: number;
  ytdChange: number | null;
}

export interface MonthlyRevenueResult {
  months: MonthlyRevenuePoint[];
  summary: MonthlyRevenueSummary;
}

const PAGE_SIZE = 1000;

async function fetchAllPaged<T>(
  build: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function usePdvMonthlyRevenue() {
  const { visibleUserId, isLoading: loadingId } = useEstablishmentId();

  return useQuery({
    queryKey: ["pdv-monthly-revenue", visibleUserId],
    enabled: !!visibleUserId && !loadingId,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<MonthlyRevenueResult> => {
      const userId = visibleUserId!;
      const now = new Date();
      // Build 24-month window ending at end-of-current-month
      const startWindow = startOfMonth(subMonths(now, 23));
      const startISO = startWindow.toISOString();

      // 1) PDV orders (salão + balcão)
      const pdvRows = await fetchAllPaged<{
        total: number | null;
        source: string | null;
        status: string | null;
        closed_at: string | null;
        created_at: string;
      }>((from, to) =>
        supabase
          .from("pdv_orders")
          .select("total, source, status, closed_at, created_at")
          .eq("user_id", userId)
          .eq("status", "fechada")
          .gte("created_at", startISO)
          .order("created_at", { ascending: true })
          .range(from, to)
      );

      // 2) Delivery orders
      const deliveryRows = await fetchAllPaged<{
        total: number | null;
        status: string | null;
        payment_status: string | null;
        created_at: string;
      }>((from, to) =>
        supabase
          .from("delivery_orders")
          .select("total, status, payment_status, created_at")
          .eq("user_id", userId)
          .in("status", ["completed", "delivered"])
          .eq("payment_status", "paid")
          .gte("created_at", startISO)
          .order("created_at", { ascending: true })
          .range(from, to)
      );

      // Initialize 24 months
      const months: MonthlyRevenuePoint[] = [];
      for (let i = 23; i >= 0; i--) {
        const d = startOfMonth(subMonths(now, i));
        months.push({
          month: monthKey(d),
          label: format(d, "LLL/yy", { locale: ptBR }),
          year: d.getFullYear(),
          monthIndex: d.getMonth(),
          salao: 0,
          balcao: 0,
          delivery: 0,
          total: 0,
        });
      }
      const idx: Record<string, MonthlyRevenuePoint> = {};
      for (const m of months) idx[m.month] = m;

      // Aggregate PDV
      for (const r of pdvRows) {
        const dateStr = r.closed_at || r.created_at;
        if (!dateStr) continue;
        const key = monthKey(new Date(dateStr));
        const bucket = idx[key];
        if (!bucket) continue;
        const value = Number(r.total || 0);
        if (r.source === "balcao") bucket.balcao += value;
        else bucket.salao += value; // salao + outros (default)
        bucket.total += value;
      }

      // Aggregate delivery
      for (const r of deliveryRows) {
        const key = monthKey(new Date(r.created_at));
        const bucket = idx[key];
        if (!bucket) continue;
        const value = Number(r.total || 0);
        bucket.delivery += value;
        bucket.total += value;
      }

      // Summary
      const currentKey = monthKey(startOfMonth(now));
      const prevKey = monthKey(startOfMonth(subMonths(now, 1)));
      const yoyKey = monthKey(startOfMonth(subMonths(now, 12)));

      const currentMonth = idx[currentKey]?.total ?? 0;
      const previousMonth = idx[prevKey]?.total ?? 0;
      const sameMonthLastYear = idx[yoyKey]?.total ?? 0;

      const currentYear = now.getFullYear();
      const ytdCurrent = months
        .filter((m) => m.year === currentYear && m.monthIndex <= now.getMonth())
        .reduce((s, m) => s + m.total, 0);
      const ytdPrevious = months
        .filter((m) => m.year === currentYear - 1 && m.monthIndex <= now.getMonth())
        .reduce((s, m) => s + m.total, 0);

      return {
        months,
        summary: {
          currentMonth,
          previousMonth,
          sameMonthLastYear,
          momChange: pctChange(currentMonth, previousMonth),
          yoyChange: pctChange(currentMonth, sameMonthLastYear),
          ytdCurrent,
          ytdPrevious,
          ytdChange: pctChange(ytdCurrent, ytdPrevious),
        },
      };
    },
  });
}
