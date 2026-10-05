import { useEffect, useMemo, useState } from "react";
import { differenceInMinutes, format, isSameDay, isToday, startOfDay } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgendaCompromisso } from "@/hooks/use-vendas-agenda";
import { EventoChip } from "./AgendaItens";
import { estaAtrasado, fimDe, hhmm, inicioDe, LOCALE, nomeCliente, TIPOS } from "./agenda-utils";

const HORA_PX = 52;
const MIN_VISUAL = 30; // compromisso curto ocupa ao menos meia hora na grade

type Bloco = { c: AgendaCompromisso; ini: number; fim: number; col: number; cols: number };

/** Lado a lado quando se sobrepõem: agrupa em blocos contínuos e distribui em colunas. */
function distribuir(itens: AgendaCompromisso[], dia: Date): Bloco[] {
  const zero = startOfDay(dia);
  const ev: Bloco[] = itens
    .map((c) => {
      const ini = Math.max(0, differenceInMinutes(inicioDe(c), zero));
      const fimReal = Math.min(24 * 60, differenceInMinutes(fimDe(c), zero));
      return { c, ini, fim: Math.max(fimReal, ini + MIN_VISUAL), col: 0, cols: 1 };
    })
    .sort((a, b) => a.ini - b.ini || b.fim - a.fim);

  const saida: Bloco[] = [];
  let grupo: Bloco[] = [];
  let fimGrupo = -1;
  const fechar = () => {
    const finsPorColuna: number[] = [];
    for (const e of grupo) {
      let col = finsPorColuna.findIndex((f) => f <= e.ini);
      if (col === -1) {
        col = finsPorColuna.length;
        finsPorColuna.push(e.fim);
      } else finsPorColuna[col] = e.fim;
      e.col = col;
    }
    for (const e of grupo) e.cols = finsPorColuna.length;
    saida.push(...grupo);
    grupo = [];
  };
  for (const e of ev) {
    if (grupo.length && e.ini >= fimGrupo) {
      fechar();
      fimGrupo = -1;
    }
    grupo.push(e);
    fimGrupo = Math.max(fimGrupo, e.fim);
  }
  if (grupo.length) fechar();
  return saida;
}

function useAgora() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return agora;
}

/** Grade de horários (semana com 7 colunas, dia com 1). */
export function AgendaGrade({
  dias,
  itens,
  onAbrir,
  onNovo,
  onAbrirDia,
}: {
  dias: Date[];
  itens: AgendaCompromisso[];
  onAbrir: (c: AgendaCompromisso) => void;
  onNovo: (dia: Date, hora: string) => void;
  onAbrirDia?: (d: Date) => void;
}) {
  const agora = useAgora();
  const umDia = dias.length === 1;

  const { diaTodoPorDia, comHoraPorDia, horaIni, horaFim } = useMemo(() => {
    const diaTodo = dias.map(() => [] as AgendaCompromisso[]);
    const comHora = dias.map(() => [] as AgendaCompromisso[]);
    let hi = 7;
    let hf = 20;
    for (const c of itens) {
      const ini = inicioDe(c);
      const idx = dias.findIndex((d) => isSameDay(d, ini));
      if (idx === -1) continue;
      if (c.all_day) {
        diaTodo[idx].push(c);
        continue;
      }
      comHora[idx].push(c);
      hi = Math.min(hi, ini.getHours());
      const fim = fimDe(c);
      const fimHora = isSameDay(fim, ini) ? fim.getHours() + (fim.getMinutes() > 0 ? 1 : 0) : 24;
      hf = Math.max(hf, Math.min(24, fimHora));
    }
    return {
      diaTodoPorDia: diaTodo,
      comHoraPorDia: comHora.map((lista, i) => distribuir(lista, dias[i])),
      horaIni: hi,
      horaFim: Math.max(hf, hi + 1),
    };
  }, [dias, itens]);

  const horas = Array.from({ length: horaFim - horaIni }, (_, i) => horaIni + i);
  const colunas = { gridTemplateColumns: `3rem repeat(${dias.length}, minmax(0, 1fr))` };
  const temDiaTodo = diaTodoPorDia.some((l) => l.length > 0);
  const alturaTotal = horas.length * HORA_PX;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {!umDia && (
        <div className="grid border-b bg-muted/40" style={colunas}>
          <div />
          {dias.map((d) => (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onAbrirDia?.(d)}
              className="flex flex-col items-center gap-0.5 border-l px-1 py-2 text-xs hover:bg-muted"
              title="Ver o dia"
            >
              <span className="uppercase text-muted-foreground">{format(d, "EEE", { locale: LOCALE }).replace(".", "")}</span>
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium tabular-nums",
                  isToday(d) && "bg-primary text-primary-foreground",
                )}
              >
                {format(d, "d")}
              </span>
            </button>
          ))}
        </div>
      )}

      {temDiaTodo && (
        <div className="grid border-b" style={colunas}>
          <div className="px-1 py-1.5 text-right text-[10px] leading-tight text-muted-foreground">Dia todo</div>
          {diaTodoPorDia.map((lista, i) => (
            <div key={i} className="min-w-0 space-y-0.5 border-l p-0.5">
              {lista.map((c) => (
                <EventoChip key={c.id} c={c} onAbrir={onAbrir} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="grid" style={colunas}>
        {/* régua de horas */}
        <div className="relative" style={{ height: alturaTotal }}>
          {horas.map((h, i) => (
            <div
              key={h}
              className={cn(
                "absolute right-1 text-[10px] tabular-nums text-muted-foreground",
                i === 0 ? "translate-y-0.5" : "-translate-y-1/2",
              )}
              style={{ top: i * HORA_PX }}
            >
              {`${String(h).padStart(2, "0")}:00`}
            </div>
          ))}
        </div>

        {dias.map((d, idx) => {
          const blocos = comHoraPorDia[idx];
          const minutosAgora = (agora.getHours() - horaIni) * 60 + agora.getMinutes();
          const mostrarAgora = isToday(d) && minutosAgora >= 0 && minutosAgora <= horas.length * 60;
          return (
            <div key={d.toISOString()} className="relative min-w-0 border-l" style={{ height: alturaTotal }}>
              {horas.map((h, i) => (
                <button
                  key={h}
                  type="button"
                  aria-label={`Novo compromisso às ${String(h).padStart(2, "0")}:00`}
                  onClick={() => onNovo(d, `${String(h).padStart(2, "0")}:00`)}
                  className="absolute inset-x-0 border-t border-border/60 hover:bg-muted/40"
                  style={{ top: i * HORA_PX, height: HORA_PX }}
                />
              ))}

              {blocos.map(({ c, ini, fim, col, cols }) => {
                const t = TIPOS[c.kind] ?? TIPOS.outro;
                const Icone = t.icon;
                const atrasado = estaAtrasado(c);
                const top = ((ini - horaIni * 60) / 60) * HORA_PX;
                const altura = Math.max(((fim - ini) / 60) * HORA_PX - 2, 20);
                const cliente = nomeCliente(c.customer);
                const sub = cliente && !c.title.includes(cliente) ? cliente : c.location;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onAbrir(c)}
                    title={`${hhmm(inicioDe(c))} ${c.title}${cliente ? ` · ${cliente}` : ""}`}
                    className={cn(
                      "absolute z-10 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition hover:z-20 hover:shadow-md",
                      t.chip,
                      t.borda,
                      atrasado && "border-l-destructive ring-1 ring-destructive",
                      c.status === "done" && "opacity-60",
                      c.status === "cancelled" && "line-through opacity-50",
                    )}
                    style={{
                      top: top + 1,
                      height: altura,
                      left: `calc(${(col / cols) * 100}% + 2px)`,
                      width: `calc(${100 / cols}% - 4px)`,
                    }}
                  >
                    <div className="flex items-center gap-1 font-medium">
                      {atrasado ? (
                        <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
                      ) : (
                        <Icone className="h-3 w-3 shrink-0" />
                      )}
                      <span className="truncate">{c.title}</span>
                    </div>
                    {altura >= 34 && (
                      <div className="truncate tabular-nums opacity-80">
                        {hhmm(inicioDe(c))}
                        {c.ends_at ? ` às ${hhmm(fimDe(c))}` : ""}
                      </div>
                    )}
                    {altura >= 50 && (sub ? <div className="truncate opacity-80">{sub}</div> : null)}
                  </button>
                );
              })}

              {mostrarAgora && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
                  style={{ top: (minutosAgora / 60) * HORA_PX }}
                >
                  <span className="-ml-1 h-2 w-2 rounded-full bg-destructive" />
                  <span className="h-px flex-1 bg-destructive" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
