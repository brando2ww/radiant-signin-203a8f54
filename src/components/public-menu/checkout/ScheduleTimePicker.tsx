import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Clock } from "lucide-react";
import { generateScheduleSlots } from "@/lib/schedule-slots";
import { cn } from "@/lib/utils";

interface ScheduleTimePickerProps {
  businessHours: any;
  isStoreOpen: boolean;
  value: Date | null;
  onChange: (date: Date | null) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export const ScheduleTimePicker = ({
  businessHours,
  isStoreOpen,
  value,
  onChange,
  onConfirm,
  onBack,
}: ScheduleTimePickerProps) => {
  const days = useMemo(
    () => generateScheduleSlots(businessHours, { minLeadMinutes: 60, slotInterval: 30, daysAhead: 7 }),
    [businessHours]
  );

  const noSlots = days.length === 0;

  const isNow = value === null;
  const valueIso = value?.toISOString();

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Voltar
      </Button>

      <div className="space-y-3">
        {isStoreOpen && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg border p-4 text-left transition-colors",
              isNow
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:bg-muted"
            )}
          >
            <div
              className={cn(
                "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                isNow ? "border-primary" : "border-muted-foreground"
              )}
            >
              {isNow && <div className="h-2 w-2 rounded-full bg-primary" />}
            </div>
            <div>
              <p className="font-medium text-sm">Receber agora</p>
              <p className="text-xs text-muted-foreground">O mais rápido possível</p>
            </div>
          </button>
        )}

        {noSlots ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Nenhum horário disponível nos próximos 7 dias.
          </div>
        ) : (
          days.map((day) => (
            <div key={day.label} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {day.label}
              </p>
              <div className="space-y-1">
                {day.slots.map((slot) => {
                  const selected = !isNow && slot.datetime.toISOString() === valueIso;
                  return (
                    <button
                      key={slot.datetime.toISOString()}
                      type="button"
                      onClick={() => onChange(slot.datetime)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      <div
                        className={cn(
                          "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                          selected ? "border-primary" : "border-muted-foreground"
                        )}
                      >
                        {selected && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <span className="text-sm font-medium">{slot.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <Button
        className="w-full"
        disabled={!isStoreOpen && value === null}
        onClick={onConfirm}
      >
        Continuar
      </Button>
    </div>
  );
};
