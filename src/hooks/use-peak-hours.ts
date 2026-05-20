import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay } from "date-fns";

export interface PeakHoursData {
  // matrix[day 0=Sun..6=Sat][hour 0..23] = orders count
  matrix: number[][];
  byHour: { hour: number; orders: number }[];
  max: number;
  total: number;
}

export const usePeakHours = (userId: string, startDate: Date, endDate: Date) => {
  return useQuery({
    enabled: !!userId,
    queryKey: ["peak-hours", userId, startDate, endDate],
    queryFn: async (): Promise<PeakHoursData> => {
      const { data, error } = await supabase
        .from("delivery_orders")
        .select("created_at")
        .eq("user_id", userId)
        .neq("status", "cancelled")
        .gte("created_at", startOfDay(startDate).toISOString())
        .lte("created_at", endOfDay(endDate).toISOString());

      if (error) throw error;

      const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      const hours: number[] = Array(24).fill(0);

      data.forEach((o) => {
        const d = new Date(o.created_at);
        const dow = d.getDay();
        const h = d.getHours();
        matrix[dow][h] += 1;
        hours[h] += 1;
      });

      const max = Math.max(0, ...matrix.flat());
      return {
        matrix,
        byHour: hours.map((orders, hour) => ({ hour, orders })),
        max,
        total: data.length,
      };
    },
  });
};
