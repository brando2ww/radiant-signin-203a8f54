import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subDays,
  subMonths,
  subYears,
  differenceInCalendarDays,
} from "date-fns";
import type { DateRange } from "react-day-picker";

export type PresetKey =
  | "today"
  | "yesterday"
  | "today_yesterday"
  | "last_7"
  | "last_14"
  | "last_28"
  | "last_30"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

export interface DatePreset {
  key: PresetKey;
  label: string;
  group: "recent" | "main";
  compute: () => DateRange;
}

const now = () => new Date();
const wkOpts = { weekStartsOn: 0 as const };

export const PRESETS: DatePreset[] = [
  { key: "today", label: "Hoje", group: "main", compute: () => ({ from: startOfDay(now()), to: endOfDay(now()) }) },
  { key: "yesterday", label: "Ontem", group: "main", compute: () => {
    const y = subDays(now(), 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }},
  { key: "today_yesterday", label: "Hoje e ontem", group: "main", compute: () => ({
    from: startOfDay(subDays(now(), 1)),
    to: endOfDay(now()),
  })},
  { key: "last_7", label: "Últimos 7 dias", group: "main", compute: () => ({
    from: startOfDay(subDays(now(), 6)), to: endOfDay(now()),
  })},
  { key: "last_14", label: "Últimos 14 dias", group: "main", compute: () => ({
    from: startOfDay(subDays(now(), 13)), to: endOfDay(now()),
  })},
  { key: "last_28", label: "Últimos 28 dias", group: "main", compute: () => ({
    from: startOfDay(subDays(now(), 27)), to: endOfDay(now()),
  })},
  { key: "last_30", label: "Últimos 30 dias", group: "main", compute: () => ({
    from: startOfDay(subDays(now(), 29)), to: endOfDay(now()),
  })},
  { key: "this_week", label: "Esta semana", group: "main", compute: () => ({
    from: startOfWeek(now(), wkOpts), to: endOfWeek(now(), wkOpts),
  })},
  { key: "last_week", label: "Semana passada", group: "main", compute: () => {
    const lw = subDays(now(), 7);
    return { from: startOfWeek(lw, wkOpts), to: endOfWeek(lw, wkOpts) };
  }},
  { key: "this_month", label: "Este mês", group: "main", compute: () => ({
    from: startOfMonth(now()), to: endOfMonth(now()),
  })},
  { key: "last_month", label: "Mês passado", group: "main", compute: () => {
    const lm = subMonths(now(), 1);
    return { from: startOfMonth(lm), to: endOfMonth(lm) };
  }},
  { key: "this_year", label: "Este ano", group: "main", compute: () => ({
    from: startOfYear(now()), to: endOfYear(now()),
  })},
  { key: "custom", label: "Personalizado", group: "main", compute: () => ({ from: undefined, to: undefined }) },
];

export const PRESET_MAP: Record<PresetKey, DatePreset> = PRESETS.reduce((acc, p) => {
  acc[p.key] = p;
  return acc;
}, {} as Record<PresetKey, DatePreset>);

export type CompareMode = "previous" | "previous_year" | "custom";

export interface CompareSelection {
  mode: CompareMode;
  range: DateRange;
}

export function computeCompareRange(range: DateRange | undefined, mode: CompareMode): DateRange | undefined {
  if (!range?.from || !range?.to) return undefined;
  if (mode === "previous_year") {
    return { from: subYears(range.from, 1), to: subYears(range.to, 1) };
  }
  // previous: same length immediately before
  const days = differenceInCalendarDays(range.to, range.from) + 1;
  const prevEnd = subDays(range.from, 1);
  const prevStart = subDays(prevEnd, days - 1);
  return { from: startOfDay(prevStart), to: endOfDay(prevEnd) };
}

const RECENT_KEY = "date-range-picker:recent";

export function getRecentPresets(): PresetKey[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PresetKey[];
    return arr.filter((k) => k in PRESET_MAP).slice(0, 2);
  } catch {
    return [];
  }
}

export function pushRecentPreset(key: PresetKey) {
  if (key === "custom") return;
  try {
    const current = getRecentPresets();
    const next = [key, ...current.filter((k) => k !== key)].slice(0, 2);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
