import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, isSameMonth, isSameYear,
  parseISO, startOfDay, startOfMonth, startOfWeek,
} from "date-fns";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useAgendaAtrasados,
  useAgendaPeriodo,
  useAgendaRepresentantes,
  useRepresentanteLogado,
  type AgendaCompromisso,
} from "@/hooks/use-vendas-agenda";
import { CancelarDialog, ConcluirDialog, ReagendarDialog } from "./AgendaAcoes";
import { AgendaDetalheDialog } from "./AgendaDetalheDialog";
import { AgendaFormDialog, type AgendaNovoInicial } from "./AgendaFormDialog";
import { AgendaGrade } from "./AgendaGrade";
import { AgendaItemLinha } from "./AgendaItens";
import { AgendaLista } from "./AgendaLista";
import { AgendaMes } from "./AgendaMes";
import { capitalizar, estaAtrasado, LOCALE, ORDEM_TIPOS, SEMANA, TIPOS } from "./agenda-utils";

type Visao = "mes" | "semana" | "dia" | "lista";
const VISOES: { v: Visao; label: string }[] = [
  { v: "mes", label: "Mês" },
  { v: "semana", label: "Semana" },
  { v: "dia", label: "Dia" },
  { v: "lista", label: "Lista" },
];

const CELULAR = "(max-width: 767px)";
const ehCelular = () => typeof window !== "undefined" && window.matchMedia(CELULAR).matches;

function useCelular() {
  const [cel, setCel] = useState(ehCelular);
  useEffect(() => {
    const mql = window.matchMedia(CELULAR);
    const mudou = () => setCel(mql.matches);
    mql.addEventListener("change", mudou);
    return () => mql.removeEventListener("change", mudou);
  }, []);
  return cel;
}

// Preferências do aparelho (visão escolhida e filtro): só conveniência, a tela funciona sem.
const lerPref = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravarPref = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento: segue sem lembrar */
  }
};

function periodo(visao: Visao, ancora: Date) {
  switch (visao) {
    case "mes":
      return { de: startOfWeek(startOfMonth(ancora), SEMANA), ate: endOfWeek(endOfMonth(ancora), SEMANA) };
    case "semana":
      return { de: startOfWeek(ancora, SEMANA), ate: endOfWeek(ancora, SEMANA) };
    case "dia":
      return { de: startOfDay(ancora), ate: endOfDay(ancora) };
    case "lista":
      return { de: startOfMonth(ancora), ate: endOfMonth(ancora) };
  }
}

function tituloPeriodo(visao: Visao, ancora: Date, celular: boolean) {
  const hoje = new Date();
  if (visao === "mes" || visao === "lista") return capitalizar(format(ancora, "MMMM 'de' yyyy", { locale: LOCALE }));
  if (visao === "dia") {
    const f = celular ? "EEE, d 'de' MMM" : "EEEE, d 'de' MMMM";
    return capitalizar(format(ancora, isSameYear(ancora, hoje) ? f : `${f} 'de' yyyy`, { locale: LOCALE }));
  }
  const ini = startOfWeek(ancora, SEMANA);
  const fim = endOfWeek(ancora, SEMANA);
  const mes = celular ? "MMM" : "MMMM";
  if (isSameMonth(ini, fim)) return `${format(ini, "d")} a ${format(fim, `d 'de' ${mes} 'de' yyyy`, { locale: LOCALE })}`;
  return `${format(ini, `d 'de' ${mes}`, { locale: LOCALE })} a ${format(fim, `d 'de' ${mes} 'de' yyyy`, { locale: LOCALE })}`;
}

export function AgendaView({ mode }: { mode: "gestao" | "representante" }) {
  const gestao = mode === "gestao";
  // O app do representante é uma coluna estreita (até 440px) mesmo no computador: lá vale sempre o layout de celular.
  // A gestão segue a largura da tela.
  const telaCelular = useCelular();
  const celular = !gestao || telaCelular;
  const chaveVisao = `velara.vendas.agenda.visao.${mode}`;
  const chaveRep = "velara.vendas.agenda.rep";

  const [visao, setVisaoState] = useState<Visao>(() => {
    const salva = lerPref(chaveVisao) as Visao | null;
    if (salva && VISOES.some((x) => x.v === salva)) return salva;
    if (!gestao || ehCelular()) return "lista";
    return gestao ? "mes" : "semana";
  });
  const setVisao = (v: Visao) => {
    setVisaoState(v);
    gravarPref(chaveVisao, v);
  };
  const [ancora, setAncora] = useState(() => startOfDay(new Date()));
  const [repFiltro, setRepFiltroState] = useState<string>(() => (gestao ? lerPref(chaveRep) ?? "todos" : "todos"));
  const setRepFiltro = (v: string) => {
    setRepFiltroState(v);
    gravarPref(chaveRep, v);
  };
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  const [verAtrasados, setVerAtrasados] = useState(false);

  // Diálogos
  const [form, setForm] = useState<{ compromisso: AgendaCompromisso | null; inicial: AgendaNovoInicial | null } | null>(null);
  const [detalhe, setDetalhe] = useState<AgendaCompromisso | null>(null);
  const [concluir, setConcluir] = useState<AgendaCompromisso | null>(null);
  const [reagendar, setReagendar] = useState<AgendaCompromisso | null>(null);
  const [cancelar, setCancelar] = useState<AgendaCompromisso | null>(null);

  const repLogado = useRepresentanteLogado();
  const repsQ = useAgendaRepresentantes(gestao);
  const reps = repsQ.data ?? [];

  // O banco já restringe o representante à agenda dele; o filtro aqui é só reforço.
  const filtroRep = gestao ? repFiltro : repLogado.data?.id ?? "todos";
  const { de, ate } = useMemo(() => periodo(visao, ancora), [visao, ancora]);
  const periodoQ = useAgendaPeriodo({ de, ate, representativeId: filtroRep, enabled: gestao || !repLogado.isLoading });
  const atrasadosQ = useAgendaAtrasados({ representativeId: filtroRep, enabled: gestao || !repLogado.isLoading });

  const itens = useMemo(
    () => (periodoQ.data ?? []).filter((c) => mostrarCancelados || c.status !== "cancelled"),
    [periodoQ.data, mostrarCancelados],
  );
  const atrasados = useMemo(() => (atrasadosQ.data ?? []).filter((c) => estaAtrasado(c)), [atrasadosQ.data]);

  // Se o filtro salvo aponta para representante que não existe mais, volta para todos.
  useEffect(() => {
    if (!gestao || !repsQ.data) return;
    if (repFiltro !== "todos" && repFiltro !== "sem" && !repsQ.data.some((r) => r.id === repFiltro)) setRepFiltro("todos");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repsQ.data]);

  // Atalho por link: ?novo=1&cliente=<id>&data=yyyy-MM-dd (ex.: "Agendar visita" na ficha do cliente).
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const data = params.get("data");
    const dia = data ? parseISO(data) : null;
    if (dia && !isNaN(dia.getTime())) setAncora(startOfDay(dia));
    if (params.get("novo") === "1" || params.get("cliente")) {
      setForm({
        compromisso: null,
        inicial: {
          dia: dia && !isNaN(dia.getTime()) ? dia : undefined,
          customer_id: params.get("cliente"),
          kind: (params.get("tipo") as AgendaNovoInicial["kind"]) || undefined,
        },
      });
    }
    if (params.has("novo") || params.has("cliente") || params.has("data") || params.has("tipo")) {
      const p = new URLSearchParams(params);
      ["novo", "cliente", "data", "tipo"].forEach((k) => p.delete(k));
      setParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navegar = (dir: -1 | 1) => {
    setAncora((a) => {
      if (visao === "mes" || visao === "lista") return addMonths(a, dir);
      if (visao === "semana") return addWeeks(a, dir);
      return addDays(a, dir);
    });
  };

  const novo = useCallback(
    (dia?: Date, hora?: string) => {
      const rep = gestao && repFiltro !== "todos" && repFiltro !== "sem" ? repFiltro : null;
      setForm({ compromisso: null, inicial: { dia: dia ?? (visao === "dia" ? ancora : undefined), hora, representative_id: rep } });
    },
    [gestao, repFiltro, visao, ancora],
  );

  const abrirDia = (d: Date) => {
    setAncora(startOfDay(d));
    setVisao("dia");
  };

  const agendarRetorno = (c: AgendaCompromisso) =>
    setForm({
      compromisso: null,
      inicial: {
        dia: addDays(startOfDay(new Date()), 7),
        kind: c.kind,
        customer_id: c.customer_id,
        representative_id: c.representative_id,
        proposta_id: c.proposta_id,
      },
    });

  const diasSemana = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(ancora, SEMANA), end: endOfWeek(ancora, SEMANA) }),
    [ancora],
  );
  const diasMes = useMemo(() => eachDayOfInterval({ start: startOfMonth(ancora), end: endOfMonth(ancora) }), [ancora]);
  const mesAtual = isSameMonth(ancora, new Date());

  const carregando = periodoQ.isPending;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{gestao ? "Agenda" : "Minha agenda"}</h1>
          <p className="text-sm text-muted-foreground">
            {gestao
              ? "Visitas, ligações, reuniões e entregas da equipe de vendas."
              : "Suas visitas, ligações e entregas com os clientes da carteira."}
          </p>
        </div>
        <Button onClick={() => novo()} className="shrink-0">
          <Plus className="h-4 w-4" />
          {gestao ? (
            <>
              <span className="hidden sm:inline">Novo compromisso</span>
              <span className="sm:hidden">Novo</span>
            </>
          ) : (
            <span>Novo</span>
          )}
        </Button>
      </div>

      {/* Navegação e visões */}
      <div className={cn("flex flex-col gap-3", gestao && "md:flex-row md:items-center md:justify-between")}>
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => navegar(-1)} aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setAncora(startOfDay(new Date()))}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => navegar(1)} aria-label="Próximo">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className={cn("ml-1 min-w-0 truncate text-base font-semibold", gestao && "md:text-lg")}>{tituloPeriodo(visao, ancora, celular)}</h2>
          {periodoQ.isFetching && !carregando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
        <div
          className={cn("grid grid-cols-4 rounded-md border bg-muted/40 p-0.5", gestao && "md:inline-grid md:w-auto")}
          role="tablist"
        >
          {VISOES.map(({ v, label }) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={visao === v}
              onClick={() => setVisao(v)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                visao === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros e legenda */}
      <div className={cn("flex flex-col gap-3", gestao && "md:flex-row md:items-center md:justify-between")}>
        <div className="flex flex-wrap items-center gap-3">
          {gestao && (
            <Select value={repFiltro} onValueChange={setRepFiltro}>
              <SelectTrigger className="h-9 w-full md:w-60">
                <SelectValue placeholder="Representante" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os representantes</SelectItem>
                <SelectItem value="sem">Sem representante</SelectItem>
                {reps.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {!r.is_active ? " (inativo)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="agenda-cancelados"
              checked={mostrarCancelados}
              onCheckedChange={(v) => setMostrarCancelados(v === true)}
            />
            <Label htmlFor="agenda-cancelados" className="cursor-pointer text-sm font-normal">
              Mostrar cancelados
            </Label>
          </div>
        </div>
        <div
          className={cn(
            "hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground",
            gestao && "lg:flex",
          )}
        >
          {ORDEM_TIPOS.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", TIPOS[k].dot)} /> {TIPOS[k].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-destructive" /> Atrasado
          </span>
        </div>
      </div>

      {/* Atrasados */}
      {atrasados.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5">
          <button
            type="button"
            onClick={() => setVerAtrasados((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1 font-medium text-destructive">
              {atrasados.length === 1
                ? "1 compromisso atrasado"
                : `${atrasados.length}${atrasados.length >= 200 ? "+" : ""} compromissos atrasados`}
              <span className={cn("hidden font-normal text-muted-foreground", gestao && "sm:inline")}>
                {atrasados.length === 1 ? " · passou do horário e segue agendado" : " · passaram do horário e seguem agendados"}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{verAtrasados ? "Ocultar" : "Ver"}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", verAtrasados && "rotate-180")} />
          </button>
          {verAtrasados && (
            <div className="space-y-2 border-t border-destructive/20 p-3">
              {atrasados.slice(0, 50).map((c) => (
                <AgendaItemLinha
                  key={c.id}
                  c={c}
                  gestao={gestao}
                  mostrarDia
                  concluirCompacto={!gestao}
                  onAbrir={setDetalhe}
                  onConcluir={setConcluir}
                />
              ))}
              {atrasados.length > 50 && (
                <p className="text-center text-xs text-muted-foreground">Mostrando os 50 mais recentes.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Calendário */}
      {periodoQ.isError ? (
        <div className="rounded-lg border border-destructive/40 p-6 text-center text-sm text-destructive">
          Não foi possível carregar a agenda.{" "}
          <button type="button" className="underline" onClick={() => periodoQ.refetch()}>
            Tentar de novo
          </button>
        </div>
      ) : carregando ? (
        <div className="flex h-64 items-center justify-center rounded-lg border">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visao === "mes" ? (
        <AgendaMes
          ancora={ancora}
          itens={itens}
          compacto={celular}
          diaSelecionado={ancora}
          gestao={gestao}
          concluirCompacto={!gestao}
          onSelecionarDia={(d) => setAncora(startOfDay(d))}
          onAbrirDia={abrirDia}
          onNovo={(d) => novo(d)}
          onAbrir={setDetalhe}
          onConcluir={setConcluir}
        />
      ) : visao === "semana" ? (
        celular ? (
          <AgendaLista
            dias={diasSemana}
            itens={itens}
            gestao={gestao}
            concluirCompacto={!gestao}
            mostrarVazios
            onAbrir={setDetalhe}
            onConcluir={setConcluir}
            onNovo={(d) => novo(d)}
          />
        ) : (
          <AgendaGrade
            dias={diasSemana}
            itens={itens}
            onAbrir={setDetalhe}
            onNovo={(d, h) => novo(d, h)}
            onAbrirDia={abrirDia}
          />
        )
      ) : visao === "dia" ? (
        <AgendaGrade dias={[ancora]} itens={itens} onAbrir={setDetalhe} onNovo={(d, h) => novo(d, h)} />
      ) : (
        <AgendaLista
          dias={diasMes}
          itens={itens}
          gestao={gestao}
          concluirCompacto={!gestao}
          recolherPassados={mesAtual}
          vazioTexto="Nada agendado neste mês."
          onAbrir={setDetalhe}
          onConcluir={setConcluir}
          onNovo={(d) => novo(d)}
        />
      )}

      <AgendaFormDialog
        open={!!form}
        onClose={() => setForm(null)}
        mode={mode}
        compromisso={form?.compromisso ?? null}
        inicial={form?.inicial ?? null}
      />
      <AgendaDetalheDialog
        compromisso={detalhe}
        mode={mode}
        onClose={() => setDetalhe(null)}
        onEditar={(c) => setForm({ compromisso: c, inicial: null })}
        onConcluir={setConcluir}
        onReagendar={setReagendar}
        onCancelar={setCancelar}
      />
      <ConcluirDialog compromisso={concluir} onClose={() => setConcluir(null)} onAgendarRetorno={agendarRetorno} />
      <ReagendarDialog compromisso={reagendar} onClose={() => setReagendar(null)} />
      <CancelarDialog compromisso={cancelar} onClose={() => setCancelar(null)} />
    </div>
  );
}

export default AgendaView;
