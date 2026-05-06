import type { BusinessHours } from "@/hooks/use-delivery-settings";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DAY_LABELS: Record<string, string> = {
  sunday: "domingo",
  monday: "segunda-feira",
  tuesday: "terça-feira",
  wednesday: "quarta-feira",
  thursday: "quinta-feira",
  friday: "sexta-feira",
  saturday: "sábado",
};

type Reason = "open" | "manual_closed" | "outside_hours" | "no_hours";

export interface StoreOpenStatus {
  open: boolean;
  reason: Reason;
  nextOpenLabel?: string;
}

interface SettingsLike {
  is_open?: boolean | null;
  business_hours?: BusinessHours | null | any;
}

function nowInSP(): Date {
  // Convert current instant to America/Sao_Paulo wall clock
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
    Number(parts.second),
  );
}

function toMinutes(hhmm: string): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function isStoreCurrentlyOpen(settings?: SettingsLike | null): StoreOpenStatus {
  if (!settings) return { open: false, reason: "manual_closed" };
  if (settings.is_open === false) {
    return { open: false, reason: "manual_closed", nextOpenLabel: getNextOpenLabel(settings.business_hours) };
  }

  const hours = settings.business_hours || {};
  const now = nowInSP();
  const dayIdx = now.getDay();
  const today = DAYS[dayIdx];
  const yesterday = DAYS[(dayIdx + 6) % 7];
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Check today's window
  const todayCfg = hours[today];
  if (todayCfg && !todayCfg.closed) {
    const open = toMinutes(todayCfg.open);
    const close = toMinutes(todayCfg.close);
    if (open !== null && close !== null) {
      if (close > open && nowMin >= open && nowMin < close) {
        return { open: true, reason: "open" };
      }
      // Crosses midnight: open today until tomorrow
      if (close <= open && nowMin >= open) {
        return { open: true, reason: "open" };
      }
    }
  }

  // Check yesterday's window crossing midnight
  const yCfg = hours[yesterday];
  if (yCfg && !yCfg.closed) {
    const open = toMinutes(yCfg.open);
    const close = toMinutes(yCfg.close);
    if (open !== null && close !== null && close <= open && nowMin < close) {
      return { open: true, reason: "open" };
    }
  }

  return {
    open: false,
    reason: Object.keys(hours).length === 0 ? "no_hours" : "outside_hours",
    nextOpenLabel: getNextOpenLabel(hours),
  };
}

function getNextOpenLabel(hours?: BusinessHours | null): string | undefined {
  if (!hours) return undefined;
  const now = nowInSP();
  const dayIdx = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  for (let i = 0; i < 7; i++) {
    const idx = (dayIdx + i) % 7;
    const day = DAYS[idx];
    const cfg = hours[day];
    if (!cfg || cfg.closed) continue;
    const open = toMinutes(cfg.open);
    if (open === null) continue;
    if (i === 0 && nowMin >= open) continue;
    const label = i === 0 ? "hoje" : i === 1 ? "amanhã" : DAY_LABELS[day];
    return `${label} às ${cfg.open}`;
  }
  return undefined;
}
