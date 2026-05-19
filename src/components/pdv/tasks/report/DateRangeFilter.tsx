import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfWeek,
  endOfWeek,
  subWeeks,
  subDays,
  differenceInCalendarDays,
  startOfYear,
  subYears,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface RangeValue {
  from: Date;
  to: Date;
  comparison: { from: Date; to: Date } | null;
  presetLabel: string;
}

interface Preset {
  key: string;
  label: string;
  compute: (now: Date) => { from: Date; to: Date };
}

const PRESETS: Preset[] = [
  { key: "hoje", label: "Hoje", compute: (n) => ({ from: n, to: n }) },
  { key: "ontem", label: "Ontem", compute: (n) => ({ from: subDays(n, 1), to: subDays(n, 1) }) },
  { key: "hoje_ontem", label: "Hoje e ontem", compute: (n) => ({ from: subDays(n, 1), to: n }) },
  { key: "7d", label: "Últimos 7 dias", compute: (n) => ({ from: subDays(n, 6), to: n }) },
  { key: "14d", label: "Últimos 14 dias", compute: (n) => ({ from: subDays(n, 13), to: n }) },
  { key: "28d", label: "Últimos 28 dias", compute: (n) => ({ from: subDays(n, 27), to: n }) },
  { key: "30d", label: "Últimos 30 dias", compute: (n) => ({ from: subDays(n, 29), to: n }) },
  {
    key: "esta_semana",
    label: "Esta semana",
    compute: (n) => ({ from: startOfWeek(n, { weekStartsOn: 1 }), to: endOfWeek(n, { weekStartsOn: 1 }) }),
  },
  {
    key: "semana_passada",
    label: "Semana passada",
    compute: (n) => {
      const s = startOfWeek(subWeeks(n, 1), { weekStartsOn: 1 });
      return { from: s, to: endOfWeek(s, { weekStartsOn: 1 }) };
    },
  },
  { key: "este_mes", label: "Este mês", compute: (n) => ({ from: startOfMonth(n), to: endOfMonth(n) }) },
  {
    key: "mes_passado",
    label: "Mês passado",
    compute: (n) => {
      const d = subMonths(n, 1);
      return { from: startOfMonth(d), to: endOfMonth(d) };
    },
  },
  { key: "maximo", label: "Máximo", compute: (n) => ({ from: subYears(n, 2), to: n }) },
];

type ComparisonType = "previous" | "year" | "custom" | "none";

function computeComparison(from: Date, to: Date, type: ComparisonType): { from: Date; to: Date } | null {
  if (type === "none") return null;
  if (type === "year") return { from: subYears(from, 1), to: subYears(to, 1) };
  if (type === "previous" || type === "custom") {
    const days = differenceInCalendarDays(to, from) + 1;
    const prevTo = subDays(from, 1);
    const prevFrom = subDays(prevTo, days - 1);
    return { from: prevFrom, to: prevTo };
  }
  return null;
}

const RECENT_KEY = "operational-report-recent-presets";

interface Props {
  value: RangeValue;
  onChange: (v: RangeValue) => void;
}

export function DateRangeFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>("30d");
  const [draftFrom, setDraftFrom] = useState<Date>(value.from);
  const [draftTo, setDraftTo] = useState<Date>(value.to);
  const [compare, setCompare] = useState(value.comparison !== null);
  const [compareType, setCompareType] = useState<ComparisonType>("previous");
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      setDraftFrom(value.from);
      setDraftTo(value.to);
      setCompare(value.comparison !== null);
    }
  }, [open, value]);

  const recentPresets = useMemo(
    () => recent.map((k) => PRESETS.find((p) => p.key === k)).filter(Boolean).slice(0, 3) as Preset[],
    [recent]
  );

  const applyPreset = (p: Preset) => {
    const now = new Date();
    const { from, to } = p.compute(now);
    setDraftFrom(from);
    setDraftTo(to);
    setSelectedPreset(p.key);
  };

  const apply = () => {
    const finalLabel =
      PRESETS.find((p) => p.key === selectedPreset)?.label ?? "Personalizado";
    const comparison = compare ? computeComparison(draftFrom, draftTo, compareType) : null;
    onChange({ from: draftFrom, to: draftTo, comparison, presetLabel: finalLabel });
    // persist recent
    const next = [selectedPreset, ...recent.filter((k) => k !== selectedPreset)].slice(0, 3);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
    setOpen(false);
  };

  const triggerLabel = `${value.presetLabel}: ${format(value.from, "dd 'de' MMM 'de' yyyy", { locale: ptBR })} a ${format(value.to, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}`;

  const comparison = compare ? computeComparison(draftFrom, draftTo, compareType) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start gap-2 font-normal">
          <CalendarIcon className="h-4 w-4" />
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[900px] max-w-[95vw] p-0" align="start">
        <div className="flex flex-col md:flex-row">
          {/* LEFT: presets */}
          <div className="w-full md:w-56 shrink-0 border-r border-border max-h-[420px] overflow-y-auto p-3">
            {recentPresets.length > 0 && (
              <>
                <div className="px-2 pb-1 text-xs font-semibold text-muted-foreground">
                  Usados recentemente
                </div>
                {recentPresets.map((p) => (
                  <PresetItem
                    key={`r-${p.key}`}
                    label={p.label}
                    active={selectedPreset === p.key}
                    onClick={() => applyPreset(p)}
                  />
                ))}
                <Separator className="my-2" />
              </>
            )}
            {PRESETS.map((p) => (
              <PresetItem
                key={p.key}
                label={p.label}
                active={selectedPreset === p.key}
                onClick={() => applyPreset(p)}
              />
            ))}
            <PresetItem
              label="Personalizado"
              active={selectedPreset === "custom"}
              onClick={() => setSelectedPreset("custom")}
            />
          </div>

          {/* RIGHT: calendar */}
          <div className="flex-1 p-3 space-y-3">
            <Calendar
              mode="range"
              numberOfMonths={2}
              locale={ptBR}
              selected={{ from: draftFrom, to: draftTo }}
              onSelect={(r) => {
                if (r?.from) setDraftFrom(r.from);
                if (r?.to) setDraftTo(r.to);
                if (r?.from || r?.to) setSelectedPreset("custom");
              }}
              className={cn("p-0 pointer-events-auto")}
            />

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="cmp"
                checked={compare}
                onCheckedChange={(c) => setCompare(c === true)}
              />
              <label htmlFor="cmp" className="text-sm cursor-pointer">
                Comparar
              </label>
            </div>

            {compare && (
              <div className="grid grid-cols-3 gap-2 items-center">
                <Select value={compareType} onValueChange={(v) => setCompareType(v as ComparisonType)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="previous">Período anterior</SelectItem>
                    <SelectItem value="year">Ano anterior</SelectItem>
                  </SelectContent>
                </Select>
                <div className="h-9 rounded-md border border-input bg-background px-3 flex items-center text-sm text-muted-foreground">
                  {comparison ? format(comparison.from, "dd 'de' MMM 'de' yy", { locale: ptBR }) : "—"}
                </div>
                <div className="h-9 rounded-md border border-input bg-background px-3 flex items-center text-sm text-muted-foreground">
                  {comparison ? format(comparison.to, "dd 'de' MMM 'de' yy", { locale: ptBR }) : "—"}
                </div>
              </div>
            )}

            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Fuso horário das datas: Horário de São Paulo
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={apply}>
                  Atualizar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PresetItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors",
        active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60"
      )}
    >
      <span
        className={cn(
          "h-3.5 w-3.5 rounded-full border",
          active ? "border-primary bg-primary" : "border-muted-foreground/40"
        )}
      />
      {label}
    </button>
  );
}

export function defaultRange(): RangeValue {
  const now = new Date();
  const from = subDays(now, 29);
  return {
    from,
    to: now,
    comparison: computeComparison(from, now, "previous"),
    presetLabel: "Últimos 30 dias",
  };
}
