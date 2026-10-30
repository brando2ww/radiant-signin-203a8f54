import { eachDay } from "@/lib/report-period";
import { brtDateKey } from "@/lib/reports-data-source";

export function cancellationDays(
  orders: { cancelled_at: string | null; opened_at: string | null; total: number }[],
  startDate: Date,
  endDate: Date,
) {
  const byDay = new Map(eachDay(startDate, endDate).map((day) => [day, { day, count: 0, value: 0 }]));
  for (const order of orders) {
    const timestamp = order.cancelled_at || order.opened_at;
    const row = timestamp ? byDay.get(brtDateKey(timestamp)) : undefined;
    if (row) { row.count += 1; row.value += order.total; }
  }
  return [...byDay.values()];
}
