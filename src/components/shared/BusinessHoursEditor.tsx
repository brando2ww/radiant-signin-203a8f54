import { useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus, X, Info } from "lucide-react";
import {
  BusinessHoursNormalized,
  DayHours,
  MAX_SHIFTS_PER_DAY,
  Shift,
  WEEK_DAYS,
  hasShiftOverlap,
  normalizeBusinessHours,
} from "@/lib/business-hours";
import { cn } from "@/lib/utils";

interface BusinessHoursEditorProps {
  value: any;
  onChange: (next: BusinessHoursNormalized) => void;
  onValidityChange?: (hasErrors: boolean) => void;
}

const DEFAULT_SHIFT: Shift = { open: "18:00", close: "23:00" };

export function BusinessHoursEditor({ value, onChange, onValidityChange }: BusinessHoursEditorProps) {
  const hours = useMemo(() => normalizeBusinessHours(value), [value]);

  const errors = useMemo(() => {
    const e: Record<string, boolean> = {};
    for (const { key } of WEEK_DAYS) {
      const day = hours[key];
      e[key] = !day.closed && hasShiftOverlap(day.shifts);
    }
    return e;
  }, [hours]);

  useEffect(() => {
    onValidityChange?.(Object.values(errors).some(Boolean));
  }, [errors, onValidityChange]);

  const update = (key: string, patch: Partial<DayHours>) => {
    onChange({ ...hours, [key]: { ...hours[key], ...patch } });
  };

  const updateShift = (key: string, idx: number, patch: Partial<Shift>) => {
    const shifts = hours[key].shifts.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    update(key, { shifts });
  };

  const addShift = (key: string) => {
    const day = hours[key];
    if (day.shifts.length >= MAX_SHIFTS_PER_DAY) return;
    const last = day.shifts[day.shifts.length - 1];
    const next: Shift = last ? { open: last.close, close: last.close } : DEFAULT_SHIFT;
    update(key, { shifts: [...day.shifts, next] });
  };

  const removeShift = (key: string, idx: number) => {
    const day = hours[key];
    if (day.shifts.length <= 1) return;
    update(key, { shifts: day.shifts.filter((_, i) => i !== idx) });
  };

  // Bulk actions
  const openAll = () => {
    const next = { ...hours };
    for (const { key } of WEEK_DAYS) {
      next[key] = { closed: false, shifts: next[key].shifts.length ? next[key].shifts : [DEFAULT_SHIFT] };
    }
    onChange(next);
  };

  const closeAll = () => {
    const next = { ...hours };
    for (const { key } of WEEK_DAYS) {
      next[key] = { ...next[key], closed: true };
    }
    onChange(next);
  };

  const copyMondayToWeekdays = () => {
    const mondayShifts = hours["monday"]?.shifts ?? [DEFAULT_SHIFT];
    const next = { ...hours };
    for (const { key } of WEEK_DAYS) {
      if (["tuesday", "wednesday", "thursday", "friday"].includes(key)) {
        next[key] = { closed: false, shifts: mondayShifts };
      }
    }
    onChange(next);
  };

  const copyMondayToAll = () => {
    const mondayShifts = hours["monday"]?.shifts ?? [DEFAULT_SHIFT];
    const next = { ...hours };
    for (const { key } of WEEK_DAYS) {
      next[key] = { closed: false, shifts: mondayShifts };
    }
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {/* Bulk actions */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={openAll}>
          Abrir todos
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={closeAll}>
          Fechar todos
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={copyMondayToWeekdays}>
          Seg → dias úteis
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={copyMondayToAll}>
          Seg → todos os dias
        </Button>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>Alterações nos horários podem afetar PDV, delivery e disponibilidade online.</span>
      </div>

      {/* Days list */}
      <div className="rounded-lg border divide-y">
        {WEEK_DAYS.map(({ key, label }) => {
          const day = hours[key];
          const overlap = errors[key];

          return (
            <div key={key} className={cn("px-4 py-3", overlap && "bg-destructive/5")}>
              {/* Row */}
              <div className="flex items-start gap-3 min-h-[2.25rem]">
                {/* Day name */}
                <span className="w-32 shrink-0 text-sm font-medium pt-0.5">{label}</span>

                {/* Toggle */}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Switch
                    checked={!day.closed}
                    onCheckedChange={(checked) => {
                      if (checked && day.shifts.length === 0) {
                        update(key, { closed: false, shifts: [DEFAULT_SHIFT] });
                      } else {
                        update(key, { closed: !checked });
                      }
                    }}
                  />
                  <span className={cn("text-xs w-14", day.closed ? "text-muted-foreground" : "text-foreground")}>
                    {day.closed ? "Fechado" : "Aberto"}
                  </span>
                </div>

                {/* Closed state */}
                {day.closed && (
                  <span className="text-xs text-muted-foreground pt-0.5">Fechado neste dia</span>
                )}

                {/* Shifts when open */}
                {!day.closed && (
                  <div className="flex flex-col gap-1.5 flex-1">
                    {day.shifts.map((shift, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <Input
                          type="time"
                          value={shift.open}
                          onChange={(e) => updateShift(key, idx, { open: e.target.value })}
                          className="h-8 w-24 text-xs"
                        />
                        <span className="text-muted-foreground text-xs">→</span>
                        <Input
                          type="time"
                          value={shift.close}
                          onChange={(e) => updateShift(key, idx, { close: e.target.value })}
                          className="h-8 w-24 text-xs"
                        />
                        {day.shifts.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeShift(key, idx)}
                            aria-label="Remover turno"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}

                    {day.shifts.length < MAX_SHIFTS_PER_DAY && (
                      <button
                        type="button"
                        onClick={() => addShift(key)}
                        className="flex items-center gap-1 text-xs text-primary hover:underline w-fit"
                      >
                        <Plus className="h-3 w-3" />
                        Adicionar turno
                      </button>
                    )}

                    {overlap && (
                      <p className="text-xs text-destructive">Turnos sobrepostos — ajuste os horários.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
