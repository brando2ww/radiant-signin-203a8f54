// Helpers for "previous period" comparisons in reports
export function previousPeriod(start: Date, end: Date): { prevStart: Date; prevEnd: Date } {
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - ms);
  return { prevStart, prevEnd };
}

export function pctDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

export function fmtDelta(delta: number): string {
  const s = (delta * 100).toFixed(1);
  return delta >= 0 ? `+${s}%` : `${s}%`;
}

// Bucket by day given an ISO date string range
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function eachDay(start: Date, end: Date): string[] {
  const days: string[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (d <= last) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return days;
}
