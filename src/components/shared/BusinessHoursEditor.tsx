import { useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import {
  BusinessHoursNormalized,
  DayHours,
  MAX_SHIFTS_PER_DAY,
  Shift,
  WEEK_DAYS,
  hasShiftOverlap,
  normalizeBusinessHours,
} from "@/lib/business-hours";

interface BusinessHoursEditorProps {
  value: any;
  onChange: (next: BusinessHoursNormalized) => void;
  onValidityChange?: (hasErrors: boolean) => void;
}

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
    const next: Shift = last ? { open: last.close, close: last.close } : { open: "18:00", close: "23:00" };
    update(key, { shifts: [...day.shifts, next] });
  };

  const removeShift = (key: string, idx: number) => {
    const day = hours[key];
    if (day.shifts.length <= 1) return;
    update(key, { shifts: day.shifts.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-6">
      {WEEK_DAYS.map(({ key, label }) => {
        const day = hours[key];
        const canRemove = day.shifts.length > 1;
        const overlap = errors[key];

        return (
          <div key={key} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="font-medium">{label}</div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!day.closed}
                  onCheckedChange={(checked) => update(key, { closed: !checked })}
                />
                <Label className="text-sm text-muted-foreground">
                  {day.closed ? "Fechado" : "Aberto"}
                </Label>
              </div>
            </div>

            {!day.closed && (
              <div className="space-y-2">
                {day.shifts.map((shift, idx) => (
                  <div key={idx} className="flex items-end gap-2">
                    <div className="text-xs text-muted-foreground w-16 pb-2">Turno {idx + 1}</div>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Abertura</Label>
                        <Input
                          type="time"
                          value={shift.open}
                          onChange={(e) => updateShift(key, idx, { open: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Fechamento</Label>
                        <Input
                          type="time"
                          value={shift.close}
                          onChange={(e) => updateShift(key, idx, { close: e.target.value })}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canRemove}
                      title={canRemove ? "Remover turno" : "Pelo menos 1 turno é obrigatório"}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeShift(key, idx);
                      }}
                      aria-label="Remover turno"
                    >
                      <Trash2 className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Remover</span>
                    </Button>
                  </div>
                ))}

                {overlap && (
                  <p className="text-xs text-destructive">
                    Os turnos deste dia estão se sobrepondo. Ajuste os horários.
                  </p>
                )}

                {day.shifts.length < MAX_SHIFTS_PER_DAY && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addShift(key)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar turno
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
