import type { KeyboardEvent, MouseEvent } from "react";
import { AlertTriangle, Check, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgendaCompromisso } from "@/hooks/use-vendas-agenda";
import { diaCurto, estaAtrasado, fimDe, hhmm, inicioDe, nomeCliente, TIPOS } from "./agenda-utils";

/** Selo de situação: atrasado, feito ou cancelado (agendado em dia não ganha selo). */
export function SeloSituacao({ c, className }: { c: AgendaCompromisso; className?: string }) {
  if (c.status === "done")
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success", className)}>
        <CheckCircle2 className="h-3 w-3" /> Feito
      </span>
    );
  if (c.status === "cancelled")
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground", className)}>
        <XCircle className="h-3 w-3" /> Cancelado
      </span>
    );
  if (estaAtrasado(c))
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive", className)}>
        <AlertTriangle className="h-3 w-3" /> Atrasado
      </span>
    );
  return null;
}

const teclaAbre = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

/** Etiqueta curta do calendário mensal. */
export function EventoChip({ c, onAbrir }: { c: AgendaCompromisso; onAbrir: (c: AgendaCompromisso) => void }) {
  const t = TIPOS[c.kind] ?? TIPOS.outro;
  const Icone = t.icon;
  const atrasado = estaAtrasado(c);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onAbrir(c);
      }}
      title={c.title}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] leading-4",
        t.chip,
        atrasado && "ring-1 ring-destructive",
        c.status === "done" && "opacity-60",
        c.status === "cancelled" && "line-through opacity-50",
      )}
    >
      {atrasado ? <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" /> : <Icone className="h-3 w-3 shrink-0" />}
      {!c.all_day && <span className="shrink-0 tabular-nums opacity-80">{hhmm(inicioDe(c))}</span>}
      <span className="truncate font-medium">{c.title}</span>
    </button>
  );
}

/** Linha de compromisso (lista, semana no celular, atrasados). */
export function AgendaItemLinha({
  c,
  gestao,
  onAbrir,
  onConcluir,
  mostrarDia,
  concluirCompacto,
}: {
  c: AgendaCompromisso;
  gestao?: boolean;
  onAbrir: (c: AgendaCompromisso) => void;
  onConcluir?: (c: AgendaCompromisso) => void;
  /** Mostra o dia junto do horário (atrasados, próximos). */
  mostrarDia?: boolean;
  /** Botão "Concluir" só com o ícone (colunas estreitas, como o widget do painel). */
  concluirCompacto?: boolean;
}) {
  const t = TIPOS[c.kind] ?? TIPOS.outro;
  const Icone = t.icon;
  const atrasado = estaAtrasado(c);
  const ini = inicioDe(c);
  const cliente = nomeCliente(c.customer);
  // O título automático já traz o cliente ("Visita · Padaria Central"): aí a segunda linha mostra só o local.
  const subtitulo = [cliente && !c.title.includes(cliente) ? cliente : null, c.location].filter(Boolean).join(" · ");
  const abrir = () => onAbrir(c);
  const concluir = (e: MouseEvent) => {
    e.stopPropagation();
    onConcluir?.(c);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={abrir}
      onKeyDown={teclaAbre(abrir)}
      className={cn(
        "flex w-full min-w-0 items-start gap-3 rounded-md border border-l-4 bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        t.borda,
        atrasado && "border-destructive/50 bg-destructive/5",
        c.status !== "scheduled" && "opacity-70",
      )}
    >
      <div className="w-14 shrink-0 pt-0.5 text-sm tabular-nums">
        {mostrarDia && <div className="text-xs font-medium text-muted-foreground">{diaCurto(ini)}</div>}
        {c.all_day ? (
          <div className="text-xs font-medium">Dia todo</div>
        ) : (
          <>
            <div className="font-semibold">{hhmm(ini)}</div>
            {!mostrarDia && c.ends_at && <div className="text-xs text-muted-foreground">{hhmm(fimDe(c))}</div>}
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium", t.chip)}>
            <Icone className="h-3 w-3" /> {t.label}
          </span>
          <SeloSituacao c={c} />
          {gestao && (
            <span className="truncate">{c.representante?.name ?? "Sem representante"}</span>
          )}
        </div>
        <p className={cn("mt-1 truncate font-medium", c.status === "cancelled" && "line-through")}>{c.title}</p>
        {subtitulo && <p className="truncate text-sm text-muted-foreground">{subtitulo}</p>}
        {c.status !== "scheduled" && c.outcome && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {c.status === "done" ? "Resultado: " : "Motivo: "}
            {c.outcome}
          </p>
        )}
      </div>
      {onConcluir && c.status === "scheduled" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn("shrink-0 px-2", !concluirCompacto && "sm:px-3")}
          onClick={concluir}
          aria-label="Concluir"
          title="Concluir"
        >
          <Check className="h-4 w-4" />
          {!concluirCompacto && <span className="hidden sm:inline">Concluir</span>}
        </Button>
      )}
    </div>
  );
}
