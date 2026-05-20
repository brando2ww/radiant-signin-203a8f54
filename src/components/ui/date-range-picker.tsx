import * as React from "react";
import { format, isEqual, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PRESETS,
  PRESET_MAP,
  PresetKey,
  CompareSelection,
  CompareMode,
  computeCompareRange,
  getRecentPresets,
  pushRecentPreset,
} from "@/lib/date-range-presets";

export type { CompareSelection } from "@/lib/date-range-presets";

interface DatePickerWithRangeProps {
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
  className?: string;
  compare?: CompareSelection | null;
  onCompareChange?: (compare: CompareSelection | null) => void;
  enableCompare?: boolean;
}

function sameRange(a?: DateRange, b?: DateRange) {
  if (!a?.from || !a?.to || !b?.from || !b?.to) return false;
  return isEqual(startOfDay(a.from), startOfDay(b.from)) && isEqual(startOfDay(a.to), startOfDay(b.to));
}

function detectPreset(range: DateRange | undefined): PresetKey {
  if (!range?.from || !range?.to) return "custom";
  for (const p of PRESETS) {
    if (p.key === "custom") continue;
    if (sameRange(p.compute(), range)) return p.key;
  }
  return "custom";
}

const fmtTrigger = (d: Date) => format(d, "dd 'de' MMM 'de' yyyy", { locale: ptBR });
const fmtShort = (d: Date) => format(d, "dd 'de' MMM 'de' yy", { locale: ptBR });

export function DatePickerWithRange({
  date,
  setDate,
  className,
  compare = null,
  onCompareChange,
  enableCompare = true,
}: DatePickerWithRangeProps) {
  const [open, setOpen] = React.useState(false);
  const [draftRange, setDraftRange] = React.useState<DateRange | undefined>(date);
  const [draftPreset, setDraftPreset] = React.useState<PresetKey>(detectPreset(date));
  const [compareOn, setCompareOn] = React.useState<boolean>(!!compare);
  const [compareMode, setCompareMode] = React.useState<CompareMode>(compare?.mode ?? "previous");
  const [recent, setRecent] = React.useState<PresetKey[]>([]);

  // Reset draft when opening
  React.useEffect(() => {
    if (open) {
      setDraftRange(date);
      setDraftPreset(detectPreset(date));
      setCompareOn(!!compare);
      setCompareMode(compare?.mode ?? "previous");
      setRecent(getRecentPresets());
    }
  }, [open, date, compare]);

  const handlePreset = (key: PresetKey) => {
    setDraftPreset(key);
    if (key !== "custom") {
      setDraftRange(PRESET_MAP[key].compute());
    }
  };

  const handleCalendarChange = (r: DateRange | undefined) => {
    setDraftRange(r);
    setDraftPreset(detectPreset(r));
  };

  const compareRange = React.useMemo(
    () => computeCompareRange(draftRange, compareMode),
    [draftRange, compareMode]
  );

  const handleApply = () => {
    if (draftRange?.from && draftRange?.to) {
      setDate(draftRange);
      if (draftPreset !== "custom") pushRecentPreset(draftPreset);
      if (onCompareChange) {
        if (compareOn && compareRange) {
          onCompareChange({ mode: compareMode, range: compareRange });
        } else {
          onCompareChange(null);
        }
      }
    }
    setOpen(false);
  };

  const triggerLabel = React.useMemo(() => {
    if (!date?.from || !date?.to) return "Selecione um período";
    const presetKey = detectPreset(date);
    const rangeStr = `${fmtTrigger(date.from)} a ${fmtTrigger(date.to)}`;
    if (presetKey === "custom") return rangeStr;
    return `${PRESET_MAP[presetKey].label}: ${rangeStr}`;
  }, [date]);

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              "min-w-[280px] max-w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">{triggerLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            {/* Sidebar */}
            <ScrollArea className="h-[420px] w-[200px] border-r">
              <div className="p-3 space-y-3">
                {recent.length > 0 && (
                  <div>
                    <p className="px-2 pb-2 text-xs font-semibold text-muted-foreground">
                      Usados recentemente
                    </p>
                    <div className="space-y-0.5">
                      {recent.map((k) => (
                        <PresetButton
                          key={`recent-${k}`}
                          label={PRESET_MAP[k].label}
                          active={draftPreset === k}
                          onClick={() => handlePreset(k)}
                        />
                      ))}
                    </div>
                    <div className="my-2 border-t" />
                  </div>
                )}
                <div className="space-y-0.5">
                  {PRESETS.map((p) => (
                    <PresetButton
                      key={p.key}
                      label={p.label}
                      active={draftPreset === p.key}
                      onClick={() => handlePreset(p.key)}
                    />
                  ))}
                </div>
              </div>
            </ScrollArea>

            {/* Calendar */}
            <div className="p-3">
              <Calendar
                mode="range"
                defaultMonth={draftRange?.from}
                selected={draftRange}
                onSelect={handleCalendarChange}
                numberOfMonths={2}
                locale={ptBR}
                className="pointer-events-auto"
              />
            </div>
          </div>

          {/* Compare row */}
          {enableCompare && onCompareChange && (
            <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3 bg-muted/30">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={compareOn}
                  onCheckedChange={(v) => setCompareOn(!!v)}
                />
                Comparar
              </label>
              <Select
                value={compareMode}
                onValueChange={(v) => setCompareMode(v as CompareMode)}
                disabled={!compareOn}
              >
                <SelectTrigger className="h-9 w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="previous">Período anterior</SelectItem>
                  <SelectItem value="previous_year">Mesmo período do ano passado</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <div className="h-9 min-w-[140px] rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                  {compareRange?.from ? fmtShort(compareRange.from) : "—"}
                </div>
                <div className="h-9 min-w-[140px] rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                  {compareRange?.to ? fmtShort(compareRange.to) : "—"}
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Fuso horário das datas: Horário de São Paulo
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={!draftRange?.from || !draftRange?.to}
              >
                Atualizar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
      )}
    >
      <span
        className={cn(
          "h-3 w-3 rounded-full border",
          active ? "border-primary-foreground bg-primary-foreground/30" : "border-muted-foreground/40"
        )}
      />
      {label}
    </button>
  );
}
