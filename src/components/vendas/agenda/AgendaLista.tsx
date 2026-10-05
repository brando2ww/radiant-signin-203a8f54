import { useMemo, useState } from "react";
import { format, isBefore, isToday, startOfDay } from "date-fns";
import { CalendarX2, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgendaCompromisso } from "@/hooks/use-vendas-agenda";
import { AgendaItemLinha } from "./AgendaItens";
import { agruparPorDia } from "./AgendaMes";
import { diaLongo } from "./agenda-utils";

/** Compromissos agrupados por dia. */
export function AgendaLista({
  dias,
  itens,
  gestao,
  concluirCompacto,
  mostrarVazios,
  recolherPassados,
  vazioTexto = "Nada agendado neste período.",
  onAbrir,
  onConcluir,
  onNovo,
}: {
  dias: Date[];
  itens: AgendaCompromisso[];
  gestao: boolean;
  /** "Concluir" só com o ícone (app do representante, coluna estreita). */
  concluirCompacto?: boolean;
  /** Mostra também os dias sem nada (semana no celular). */
  mostrarVazios?: boolean;
  /** Dias antes de hoje ficam atrás de um botão. */
  recolherPassados?: boolean;
  vazioTexto?: string;
  onAbrir: (c: AgendaCompromisso) => void;
  onConcluir: (c: AgendaCompromisso) => void;
  onNovo: (d: Date) => void;
}) {
  const [verPassados, setVerPassados] = useState(false);
  const porDia = useMemo(() => agruparPorDia(itens), [itens]);
  const hoje = startOfDay(new Date());

  const grupos = dias
    .map((d) => ({ d, lista: porDia.get(format(d, "yyyy-MM-dd")) ?? [] }))
    .filter((g) => mostrarVazios || g.lista.length > 0);

  const passados = recolherPassados ? grupos.filter((g) => isBefore(g.d, hoje)) : [];
  const visiveis = recolherPassados && !verPassados ? grupos.filter((g) => !isBefore(g.d, hoje)) : grupos;
  const qtdPassados = passados.reduce((s, g) => s + g.lista.length, 0);

  if (grupos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-12 text-center text-muted-foreground">
        <CalendarX2 className="h-8 w-8" />
        <p className="text-sm">{vazioTexto}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {recolherPassados && qtdPassados > 0 && (
        <button
          type="button"
          onClick={() => setVerPassados((v) => !v)}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-2 text-sm text-muted-foreground hover:bg-muted/50"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", verPassados && "rotate-180")} />
          {verPassados
            ? "Ocultar dias anteriores"
            : `Mostrar dias anteriores (${qtdPassados} ${qtdPassados === 1 ? "compromisso" : "compromissos"})`}
        </button>
      )}

      {visiveis.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nada agendado de hoje até o fim do período.
        </p>
      )}

      {visiveis.map(({ d, lista }) => (
        <section key={d.toISOString()} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className={cn("text-sm font-semibold", isToday(d) ? "text-primary" : "text-foreground")}>{diaLongo(d)}</h3>
            {mostrarVazios && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onNovo(d)}>
                <Plus className="h-3.5 w-3.5" /> Novo
              </Button>
            )}
          </div>
          {lista.length === 0 ? (
            <p className="text-xs text-muted-foreground">Livre.</p>
          ) : (
            <div className="space-y-2">
              {lista.map((c) => (
                <AgendaItemLinha
                  key={c.id}
                  c={c}
                  gestao={gestao}
                  concluirCompacto={concluirCompacto}
                  onAbrir={onAbrir}
                  onConcluir={onConcluir}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
