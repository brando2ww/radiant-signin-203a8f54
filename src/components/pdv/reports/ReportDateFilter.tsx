import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ReportDateFilterProps {
  startDate: Date;
  endDate: Date;
  onChange: (start: Date, end: Date) => void;
  extra?: React.ReactNode;
}

export function ReportDateFilter({ startDate, endDate, onChange, extra }: ReportDateFilterProps) {
  const apply = (filter: { days?: number; special?: string }) => {
    if (filter.special === "month") {
      onChange(startOfMonth(new Date()), endOfMonth(new Date()));
    } else {
      onChange(subDays(new Date(), filter.days ?? 0), new Date());
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, "PPP", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={(d) => d && onChange(d, endDate)} locale={ptBR} initialFocus />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground text-sm">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(endDate, "PPP", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={(d) => d && onChange(startDate, d)} locale={ptBR} initialFocus />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => apply({ days: 0 })}>Hoje</Button>
            <Button variant="outline" size="sm" onClick={() => apply({ days: 7 })}>7 dias</Button>
            <Button variant="outline" size="sm" onClick={() => apply({ days: 30 })}>30 dias</Button>
            <Button variant="outline" size="sm" onClick={() => apply({ special: "month" })}>Mês atual</Button>
          </div>
          {extra ? <div className="ml-auto flex items-center gap-2">{extra}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
