import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  value?: Date | null;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  title?: string;
  /** Atalhos do rodapé. Hoje/Amanhã poupam o passeio pelo calendário. */
  quickPicks?: boolean;
  disabled?: boolean;
  className?: string;
}

const emDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(12, 0, 0, 0);
  return d;
};

/**
 * Campo de data que abre um diálogo, e não um popover.
 *
 * Dentro de um Dialog o popover do Radix não recebe clique: o foco fica preso
 * no diálogo de baixo e o calendário abre inalcançável.
 */
export function DatePickerDialog({
  value,
  onChange,
  placeholder = "Selecione uma data",
  title = "Escolher data",
  quickPicks = true,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const escolher = (d: Date | undefined) => {
    onChange(d);
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn("w-full justify-start pl-3 text-left font-normal", !value && "text-muted-foreground", className)}
      >
        <span className="truncate">
          {value ? format(value, "dd/MM/yyyy", { locale: ptBR }) : placeholder}
        </span>
        <CalendarIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-auto p-0 sm:max-w-fit">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="text-base">{title}</DialogTitle>
          </DialogHeader>
          <div className="px-2 pb-2">
            <Calendar
              mode="single"
              selected={value ?? undefined}
              onSelect={escolher}
              defaultMonth={value ?? undefined}
              locale={ptBR}
              initialFocus
            />
          </div>
          {quickPicks && (
            <div className="flex flex-wrap gap-2 border-t px-4 py-3">
              <Button type="button" size="sm" variant="secondary" onClick={() => escolher(emDias(0))}>Hoje</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => escolher(emDias(1))}>Amanhã</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => escolher(emDias(7))}>7 dias</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => escolher(emDias(30))}>30 dias</Button>
              {value && (
                <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => escolher(undefined)}>
                  Limpar
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
