/**
 * Returns YYYY-MM-DD using the device local time.
 * Required for Brazil (UTC-3) so dates don't roll over at 21h local.
 */
export function toLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
