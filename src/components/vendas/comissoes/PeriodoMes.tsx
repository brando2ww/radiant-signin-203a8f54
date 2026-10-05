import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PeriodoValor = { mes: Date } | { tudo: true };

export function intervaloDoPeriodo(p: PeriodoValor): { de: Date; ate: Date } | null {
  if ("tudo" in p) return null;
  return { de: startOfMonth(p.mes), ate: endOfMonth(p.mes) };
}

export function rotuloDoPeriodo(p: PeriodoValor): string {
  if ("tudo" in p) return "todo o período";
  const s = format(p.mes, "MMMM 'de' yyyy", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Navegação por mês (recebidas no mês) com a opção de ver tudo. */
export function PeriodoMes({ valor, onChange, className }: { valor: PeriodoValor; onChange: (v: PeriodoValor) => void; className?: string }) {
  const mes = "tudo" in valor ? startOfMonth(new Date()) : valor.mes;
  const tudo = "tudo" in valor;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => onChange({ mes: addMonths(mes, -1) })} aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-[9.5rem] flex-1 text-center text-sm font-medium sm:flex-none">{tudo ? "Todo o período" : rotuloDoPeriodo(valor)}</div>
      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => onChange({ mes: addMonths(mes, 1) })} aria-label="Próximo mês">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        variant={tudo ? "secondary" : "ghost"}
        size="sm"
        className="ml-1 shrink-0"
        onClick={() => onChange(tudo ? { mes: startOfMonth(new Date()) } : { tudo: true })}
      >
        {tudo ? "Este mês" : "Tudo"}
      </Button>
    </div>
  );
}
