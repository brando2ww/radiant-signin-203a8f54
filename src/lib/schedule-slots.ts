import { normalizeBusinessHours } from "@/lib/business-hours";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DAY_LABELS: Record<string, string> = {
  sunday: "Domingo",
  monday: "Segunda-feira",
  tuesday: "Terça-feira",
  wednesday: "Quarta-feira",
  thursday: "Quinta-feira",
  friday: "Sexta-feira",
  saturday: "Sábado",
};

export interface ScheduleSlot {
  datetime: Date;
  label: string;
}

export interface ScheduleDay {
  label: string;
  slots: ScheduleSlot[];
}

function nowInSP(): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    0,
  );
}

function toMinutes(hhmm: string): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function generateScheduleSlots(
  rawHours: any,
  {
    minLeadMinutes = 60,
    slotInterval = 30,
    daysAhead = 7,
  }: { minLeadMinutes?: number; slotInterval?: number; daysAhead?: number } = {}
): ScheduleDay[] {
  const hours = normalizeBusinessHours(rawHours);
  const now = nowInSP();
  const nowTotalMin = now.getHours() * 60 + now.getMinutes();
  const cutoffMin = nowTotalMin + minLeadMinutes;

  const result: ScheduleDay[] = [];

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);

    const dayIdx = date.getDay();
    const dayKey = DAYS[dayIdx];
    const cfg = hours[dayKey];

    if (!cfg || cfg.closed || cfg.shifts.length === 0) continue;

    const slots: ScheduleSlot[] = [];

    for (const shift of cfg.shifts) {
      const openMin = toMinutes(shift.open);
      const closeMin = toMinutes(shift.close);
      if (openMin === null || closeMin === null) continue;

      // Handle cross-midnight shifts
      const effectiveClose = closeMin <= openMin ? closeMin + 1440 : closeMin;

      let slotMin = Math.ceil(openMin / slotInterval) * slotInterval;
      while (slotMin < effectiveClose) {
        const actualMin = slotMin % 1440;
        const slotDate = new Date(date);
        const dayAdd = slotMin >= 1440 ? 1 : 0;
        slotDate.setDate(slotDate.getDate() + dayAdd);
        slotDate.setHours(Math.floor(actualMin / 60), actualMin % 60, 0, 0);

        // Skip slots in the past or within lead time (only relevant for today)
        if (dayOffset === 0 && slotMin < cutoffMin) {
          slotMin += slotInterval;
          continue;
        }

        slots.push({
          datetime: slotDate,
          label: `${pad(Math.floor(actualMin / 60))}:${pad(actualMin % 60)}`,
        });

        slotMin += slotInterval;
      }
    }

    if (slots.length === 0) continue;

    const dayLabel =
      dayOffset === 0
        ? "Hoje"
        : dayOffset === 1
        ? "Amanhã"
        : DAY_LABELS[dayKey];

    result.push({ label: dayLabel, slots });
  }

  return result;
}
