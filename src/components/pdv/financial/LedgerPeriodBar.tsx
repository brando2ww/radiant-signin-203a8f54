import { useMemo } from "react";
import {
  startOfMonth, endOfMonth, subMonths, addDays, startOfYear, endOfYear, format,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { DatePickerDialog } from "@/components/ui/date-picker-dialog";
import { cn } from "@/lib/utils";
import type { TransactionFilters } from "@/hooks/use-pdv-financial-transactions";

interface Props {
  filters: TransactionFilters;
  onChange: (f: TransactionFilters) => void;
}

const hoje = () => new Date();

const PRESETS = [
  {
    id: "mes",
    rotulo: "Este mês",
    faixa: () => ({ de: startOfMonth(hoje()), ate: endOfMonth(hoje()) }),
  },
  {
    id: "mes-passado",
    rotulo: "Mês passado",
    faixa: () => ({ de: startOfMonth(subMonths(hoje(), 1)), ate: endOfMonth(subMonths(hoje(), 1)) }),
  },
  {
    id: "30-dias",
    rotulo: "Próximos 30 dias",
    faixa: () => ({ de: hoje(), ate: addDays(hoje(), 30) }),
  },
  {
    id: "ano",
    rotulo: "Este ano",
    faixa: () => ({ de: startOfYear(hoje()), ate: endOfYear(hoje()) }),
  },
] as const;

const mesmoDia = (a?: Date | null, b?: Date | null) =>
  !!a && !!b && format(a, "yyyy-MM-dd") === format(b, "yyyy-MM-dd");

/**
 * Recorte de período, em destaque e antes dos outros filtros.
 *
 * Num financeiro o período é a pergunta que vem primeiro — "quanto tenho a
 * pagar este mês" — e escondê-lo dentro de um painel de filtros junto com
 * fornecedor e forma de pagamento é o que torna a tela difícil de ler.
 */
export function LedgerPeriodBar({ filters, onChange }: Props) {
  const ativo = useMemo(() => {
    if (!filters.due_date_from && !filters.due_date_to) return "tudo";
    for (const p of PRESETS) {
      const { de, ate } = p.faixa();
      if (mesmoDia(filters.due_date_from, de) && mesmoDia(filters.due_date_to, ate)) return p.id;
    }
    return "custom";
  }, [filters.due_date_from, filters.due_date_to]);

  const aplicar = (de?: Date, ate?: Date) =>
    onChange({ ...filters, due_date_from: de, due_date_to: ate });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <span className="mr-1 text-sm font-medium">Período de vencimento</span>

      {PRESETS.map((p) => (
        <Button
          key={p.id}
          type="button"
          size="sm"
          variant={ativo === p.id ? "default" : "outline"}
          onClick={() => {
            const { de, ate } = p.faixa();
            aplicar(de, ate);
          }}
        >
          {p.rotulo}
        </Button>
      ))}

      <Button
        type="button"
        size="sm"
        variant={ativo === "tudo" ? "default" : "outline"}
        onClick={() => aplicar(undefined, undefined)}
      >
        Tudo
      </Button>

      <div className={cn("ml-auto flex items-center gap-2", ativo === "custom" && "font-medium")}>
        <div className="w-[150px]">
          <DatePickerDialog
            value={filters.due_date_from ?? null}
            onChange={(d) => aplicar(d, filters.due_date_to)}
            placeholder="De"
            title="Vencimento a partir de"
          />
        </div>
        <span className="text-muted-foreground">até</span>
        <div className="w-[150px]">
          <DatePickerDialog
            value={filters.due_date_to ?? null}
            onChange={(d) => aplicar(filters.due_date_from, d)}
            placeholder="Até"
            title="Vencimento até"
          />
        </div>
      </div>
    </div>
  );
}

/** Frase que descreve o recorte, para o resumo não ficar sem contexto. */
export function descreverPeriodo(filters: TransactionFilters): string {
  const { due_date_from: de, due_date_to: ate } = filters;
  const fmt = (d: Date) => format(d, "dd 'de' MMMM", { locale: ptBR });
  if (de && ate) return `Vencendo entre ${fmt(de)} e ${fmt(ate)}`;
  if (de) return `Vencendo a partir de ${fmt(de)}`;
  if (ate) return `Vencendo até ${fmt(ate)}`;
  return "Todo o período, desde o começo";
}
