// Shared helpers for business hours with multiple shifts per day.
// Backward-compatible: reads legacy { open, close, closed|is_closed } and
// normalizes to { closed, shifts: [{ open, close }] }.

export interface Shift {
  open: string;
  close: string;
}

export interface DayHours {
  closed: boolean;
  shifts: Shift[];
}

export interface BusinessHoursNormalized {
  [day: string]: DayHours;
}

export const WEEK_DAYS = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;

export const MAX_SHIFTS_PER_DAY = 3;

const DEFAULT_SHIFT: Shift = { open: "18:00", close: "23:00" };

export function normalizeDayHours(raw: any): DayHours {
  if (!raw || typeof raw !== "object") {
    return { closed: false, shifts: [{ ...DEFAULT_SHIFT }] };
  }
  const closed = Boolean(raw.closed ?? raw.is_closed ?? false);
  let shifts: Shift[] = [];
  if (Array.isArray(raw.shifts) && raw.shifts.length > 0) {
    shifts = raw.shifts
      .filter((s: any) => s && typeof s === "object")
      .map((s: any) => ({
        open: typeof s.open === "string" ? s.open : DEFAULT_SHIFT.open,
        close: typeof s.close === "string" ? s.close : DEFAULT_SHIFT.close,
      }));
  } else if (typeof raw.open === "string" || typeof raw.close === "string") {
    shifts = [
      {
        open: typeof raw.open === "string" ? raw.open : DEFAULT_SHIFT.open,
        close: typeof raw.close === "string" ? raw.close : DEFAULT_SHIFT.close,
      },
    ];
  }
  if (shifts.length === 0) shifts = [{ ...DEFAULT_SHIFT }];
  return { closed, shifts: shifts.slice(0, MAX_SHIFTS_PER_DAY) };
}

export function normalizeBusinessHours(raw: any): BusinessHoursNormalized {
  const out: BusinessHoursNormalized = {};
  for (const { key } of WEEK_DAYS) {
    out[key] = normalizeDayHours(raw?.[key]);
  }
  return out;
}

// Serialize keeping legacy fields populated from the first shift so older
// consumers that read .open / .close still work.
export function serializeDayHours(day: DayHours): any {
  const first = day.shifts[0] ?? DEFAULT_SHIFT;
  return {
    closed: day.closed,
    is_closed: day.closed,
    open: first.open,
    close: first.close,
    shifts: day.shifts.map((s) => ({ open: s.open, close: s.close })),
  };
}

export function serializeBusinessHours(hours: BusinessHoursNormalized): any {
  const out: Record<string, any> = {};
  for (const { key } of WEEK_DAYS) {
    out[key] = serializeDayHours(hours[key] ?? normalizeDayHours(null));
  }
  return out;
}

function toMinutes(hhmm: string): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Returns intervals in [start, end) over a 0..2880 minute window
// (so cross-midnight shifts span beyond 1440).
function shiftIntervals(s: Shift): Array<[number, number]> {
  const o = toMinutes(s.open);
  const c = toMinutes(s.close);
  if (o === null || c === null) return [];
  if (c > o) return [[o, c]];
  if (c === o) return [];
  // crosses midnight
  return [[o, c + 1440]];
}

export function hasShiftOverlap(shifts: Shift[]): boolean {
  const intervals: Array<[number, number]> = [];
  for (const s of shifts) intervals.push(...shiftIntervals(s));
  intervals.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i][0] < intervals[i - 1][1]) return true;
  }
  return false;
}

function formatHour(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  if (!m || m === "00") return `${Number(h)}h`;
  return `${Number(h)}h${m}`;
}

export function formatShiftsLabel(shifts: Shift[]): string {
  if (shifts.length === 0) return "";
  const parts = shifts.map((s) => `${formatHour(s.open)}–${formatHour(s.close)}`);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

const DAY_ORDER = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function formatTodayShifts(raw: any, today?: Date): string | null {
  const hours = normalizeBusinessHours(raw);
  const d = today ?? new Date();
  const key = DAY_ORDER[d.getDay()];
  const day = hours[key];
  if (!day || day.closed || day.shifts.length === 0) return null;
  return formatShiftsLabel(day.shifts);
}
