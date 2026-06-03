import { useMemo, useState } from "react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AdminPeriod, AdminPeriodKey } from "@/hooks/use-admin-dashboard";

interface Props {
  value: AdminPeriod;
  onChange: (p: AdminPeriod) => void;
}

const PRESETS: Array<{ key: Exclude<AdminPeriodKey, "custom">; label: string }> = [
  { key: "today", label: "Hoje" },
  { key: "last_7", label: "Últimos 7 dias" },
  { key: "last_30", label: "Últimos 30 dias" },
  { key: "this_month", label: "Mês atual" },
];

export function computePeriod(key: Exclude<AdminPeriodKey, "custom">): AdminPeriod {
  const now = new Date();
  switch (key) {
    case "today":
      return { key, start: startOfDay(now), end: endOfDay(now), label: "Hoje" };
    case "last_7":
      return { key, start: startOfDay(subDays(now, 6)), end: endOfDay(now), label: "Últimos 7 dias" };
    case "last_30":
      return { key, start: startOfDay(subDays(now, 29)), end: endOfDay(now), label: "Últimos 30 dias" };
    case "this_month":
      return { key, start: startOfMonth(now), end: endOfMonth(now), label: "Mês atual" };
  }
}

export function AdminPeriodFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const customLabel = useMemo(
    () => `${format(value.start, "dd/MM/yy", { locale: ptBR })} – ${format(value.end, "dd/MM/yy", { locale: ptBR })}`,
    [value]
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <Button
          key={p.key}
          variant={value.key === p.key ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(computePeriod(p.key))}
        >
          {p.label}
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={value.key === "custom" ? "default" : "outline"}
            size="sm"
            className={cn("gap-2")}
          >
            <CalendarIcon className="h-4 w-4" />
            {value.key === "custom" ? customLabel : "Personalizado"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 min-w-[680px]" align="end">
          <Calendar
            mode="range"
            locale={ptBR}
            selected={{ from: value.start, to: value.end }}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                onChange({
                  key: "custom",
                  start: startOfDay(range.from),
                  end: endOfDay(range.to),
                  label: "Personalizado",
                });
                setOpen(false);
              }
            }}
            numberOfMonths={2}
            className="p-3 pointer-events-auto"
            classNames={{ months: "flex flex-col sm:flex-row gap-6" }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
