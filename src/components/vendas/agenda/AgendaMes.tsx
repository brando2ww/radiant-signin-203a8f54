import { useMemo } from "react";
import {
  eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek,
} from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgendaCompromisso } from "@/hooks/use-vendas-agenda";
import { AgendaItemLinha, EventoChip } from "./AgendaItens";
import { diaLongo, estaAtrasado, inicioDe, LOCALE, SEMANA, TIPOS } from "./agenda-utils";

const MAX_CHIPS = 3;

/** Agrupa por dia de início (chave yyyy-MM-dd). */
export function agruparPorDia(itens: AgendaCompromisso[]) {
  const mapa = new Map<string, AgendaCompromisso[]>();
  for (const c of itens) {
    const k = format(inicioDe(c), "yyyy-MM-dd");
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k)!.push(c);
  }
  // Dia todo primeiro, depois por horário.
  for (const lista of mapa.values()) {
    lista.sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at));
  }
  return mapa;
}

export function AgendaMes({
  ancora,
  itens,
  compacto,
  diaSelecionado,
  gestao,
  concluirCompacto,
  onSelecionarDia,
  onAbrirDia,
  onNovo,
  onAbrir,
  onConcluir,
}: {
  ancora: Date;
  itens: AgendaCompromisso[];
  /** Celular: bolinhas na grade e a lista do dia escolhido embaixo. */
  compacto: boolean;
  diaSelecionado: Date;
  gestao: boolean;
  /** "Concluir" só com o ícone (app do representante, coluna estreita). */
  concluirCompacto?: boolean;
  onSelecionarDia: (d: Date) => void;
  onAbrirDia: (d: Date) => void;
  onNovo: (d: Date) => void;
  onAbrir: (c: AgendaCompromisso) => void;
  onConcluir: (c: AgendaCompromisso) => void;
}) {
  const dias = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(ancora), SEMANA),
        end: endOfWeek(endOfMonth(ancora), SEMANA),
      }),
    [ancora],
  );
  const porDia = useMemo(() => agruparPorDia(itens), [itens]);
  const cabecalho = dias.slice(0, 7).map((d) => format(d, compacto ? "EEEEE" : "EEE", { locale: LOCALE }).replace(".", ""));
  const doDiaSelecionado = porDia.get(format(diaSelecionado, "yyyy-MM-dd")) ?? [];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {cabecalho.map((n, i) => (
            <div key={i} className="px-1 py-2 text-center text-xs font-medium uppercase text-muted-foreground">
              {n}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {dias.map((d, i) => {
            const k = format(d, "yyyy-MM-dd");
            const doDia = porDia.get(k) ?? [];
            const foraDoMes = !isSameMonth(d, ancora);
            const hoje = isToday(d);
            const selecionado = compacto && isSameDay(d, diaSelecionado);
            const temAtraso = doDia.some((c) => estaAtrasado(c));
            const visiveis = doDia.slice(0, MAX_CHIPS);
            const resto = doDia.length - visiveis.length;
            return (
              <div
                key={k}
                role="button"
                tabIndex={0}
                aria-label={diaLongo(d)}
                onClick={() => (compacto ? onSelecionarDia(d) : onNovo(d))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (compacto ? onSelecionarDia(d) : onAbrirDia(d));
                }}
                className={cn(
                  "group relative min-w-0 cursor-pointer border-b border-r p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  compacto ? "flex h-14 flex-col items-center" : "min-h-[7.5rem] hover:bg-muted/30",
                  (i + 1) % 7 === 0 && "border-r-0",
                  foraDoMes && "bg-muted/20 text-muted-foreground",
                  selecionado && "bg-primary/10",
                )}
              >
                <div className={cn("flex items-center", compacto ? "justify-center" : "justify-between")}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      compacto ? onSelecionarDia(d) : onAbrirDia(d);
                    }}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums hover:bg-muted",
                      hoje && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                    )}
                    title="Ver o dia"
                  >
                    {format(d, "d")}
                  </button>
                  {!compacto && (
                    <Plus className="mr-1 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </div>
                {compacto ? (
                  doDia.length > 0 && (
                    <div className="mt-1 flex max-w-full flex-wrap justify-center gap-0.5">
                      {doDia.slice(0, 4).map((c) => (
                        <span
                          key={c.id}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            estaAtrasado(c) ? "bg-destructive" : TIPOS[c.kind]?.dot ?? "bg-slate-500",
                            c.status !== "scheduled" && "opacity-40",
                          )}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <div className="mt-1 space-y-0.5">
                    {visiveis.map((c) => (
                      <EventoChip key={c.id} c={c} onAbrir={onAbrir} />
                    ))}
                    {resto > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAbrirDia(d);
                        }}
                        className={cn(
                          "w-full rounded px-1.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted",
                          temAtraso && "text-destructive",
                        )}
                      >
                        + {resto} {resto === 1 ? "outro" : "outros"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {compacto && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{diaLongo(diaSelecionado)}</h3>
            <Button size="sm" variant="ghost" onClick={() => onNovo(diaSelecionado)}>
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </div>
          {doDiaSelecionado.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nada agendado neste dia.
            </p>
          ) : (
            doDiaSelecionado.map((c) => (
              <AgendaItemLinha
                key={c.id}
                c={c}
                gestao={gestao}
                concluirCompacto={concluirCompacto}
                onAbrir={onAbrir}
                onConcluir={onConcluir}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
