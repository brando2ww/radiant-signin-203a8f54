import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerDialog } from "@/components/ui/date-picker-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AgendaTipo } from "@/lib/vendas/types";
import { PROPOSTA_STATUS_LABEL } from "@/lib/vendas/types";
import {
  mensagemErroAgenda,
  useAgendaClientes,
  useAgendaMutacoes,
  useAgendaPropostasDoCliente,
  useAgendaRepresentantes,
  type AgendaCompromisso,
} from "@/hooks/use-vendas-agenda";
import { DIALOG_CLASSE } from "./AgendaAcoes";
import { inicioDe, juntarDataHora, localSugerido, moeda, nomeCliente, ORDEM_TIPOS, TIPOS } from "./agenda-utils";

/** Valores iniciais de um compromisso novo (dia clicado no calendário, cliente do retorno etc.). */
export type AgendaNovoInicial = {
  dia?: Date;
  hora?: string;
  kind?: AgendaTipo;
  customer_id?: string | null;
  representative_id?: string | null;
  proposta_id?: string | null;
  title?: string;
};

type Estado = {
  kind: AgendaTipo;
  title: string;
  customer_id: string | null;
  representative_id: string | null;
  proposta_id: string | null;
  dia: Date | undefined;
  diaTodo: boolean;
  inicio: string;
  fim: string;
  location: string;
  notes: string;
};

const SEM = "__nenhum__";

const somarHora = (hora: string, minutos: number) => {
  const [h, m] = hora.split(":").map((n) => parseInt(n, 10) || 0);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutos);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** Próxima hora cheia (para o compromisso novo de hoje). */
const proximaHoraCheia = () => {
  const h = Math.min(new Date().getHours() + 1, 20);
  return `${String(Math.max(h, 8)).padStart(2, "0")}:00`;
};

export function AgendaFormDialog({
  open,
  onClose,
  mode,
  compromisso,
  inicial,
}: {
  open: boolean;
  onClose: () => void;
  mode: "gestao" | "representante";
  /** Edição; sem ele, é um compromisso novo. */
  compromisso?: AgendaCompromisso | null;
  inicial?: AgendaNovoInicial | null;
}) {
  const gestao = mode === "gestao";
  const { salvar, excluir } = useAgendaMutacoes();
  const clientesQ = useAgendaClientes(open);
  const repsQ = useAgendaRepresentantes(open && gestao);
  const [v, setV] = useState<Estado | null>(null);
  const [tituloManual, setTituloManual] = useState(false);
  const [localManual, setLocalManual] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const propostasQ = useAgendaPropostasDoCliente(v?.customer_id);

  const clientes = clientesQ.data ?? [];
  const clientesPorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);

  // Monta o estado quando abre.
  useEffect(() => {
    if (!open) {
      setV(null);
      return;
    }
    setConfirmarExclusao(false);
    if (compromisso) {
      const ini = inicioDe(compromisso);
      const fim = compromisso.ends_at ? new Date(compromisso.ends_at) : null;
      setV({
        kind: compromisso.kind,
        title: compromisso.title,
        customer_id: compromisso.customer_id,
        representative_id: compromisso.representative_id,
        proposta_id: compromisso.proposta_id,
        dia: ini,
        diaTodo: compromisso.all_day,
        inicio: compromisso.all_day ? "09:00" : format(ini, "HH:mm"),
        fim: !compromisso.all_day && fim ? format(fim, "HH:mm") : "",
        location: compromisso.location ?? "",
        notes: compromisso.notes ?? "",
      });
      setTituloManual(true);
      setLocalManual(true);
      return;
    }
    const hoje = new Date();
    const dia = inicial?.dia ?? hoje;
    const inicio = inicial?.hora ?? (dia.toDateString() === hoje.toDateString() ? proximaHoraCheia() : "09:00");
    setV({
      kind: inicial?.kind ?? "visita",
      title: inicial?.title ?? "",
      customer_id: inicial?.customer_id ?? null,
      representative_id: inicial?.representative_id ?? null,
      proposta_id: inicial?.proposta_id ?? null,
      dia,
      diaTodo: false,
      inicio,
      fim: somarHora(inicio, 60),
      location: "",
      notes: "",
    });
    setTituloManual(!!inicial?.title);
    setLocalManual(false);
  }, [open, compromisso, inicial]);

  // Cliente vindo de fora (retorno): completa título, local e representante quando a lista chegar.
  useEffect(() => {
    if (!v || compromisso || !v.customer_id) return;
    const c = clientesPorId.get(v.customer_id);
    if (!c) return;
    setV((s) => {
      if (!s) return s;
      const titulo = !tituloManual && !s.title ? `${TIPOS[s.kind].label} · ${nomeCliente(c)}` : s.title;
      const local = !localManual && !s.location ? localSugerido(c, s.kind) : s.location;
      const rep = gestao && !s.representative_id ? c.representative_id : s.representative_id;
      if (titulo === s.title && local === s.location && rep === s.representative_id) return s;
      return { ...s, title: titulo, location: local, representative_id: rep };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesPorId, v?.customer_id]);

  const opcoesClientes: SearchSelectOption[] = useMemo(
    () =>
      clientes.map((c) => ({
        value: c.id,
        label: nomeCliente(c) ?? c.name,
        hint: [c.city, c.state].filter(Boolean).join("/") || undefined,
      })),
    [clientes],
  );

  const reps = repsQ.data ?? [];
  const repsVisiveis = reps.filter((r) => r.is_active || r.id === v?.representative_id);

  if (!v) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className={DIALOG_CLASSE}>
          <DialogHeader>
            <DialogTitle>{compromisso ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
          </DialogHeader>
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </DialogContent>
      </Dialog>
    );
  }

  const set = (p: Partial<Estado>) => setV((s) => (s ? { ...s, ...p } : s));

  const escolherTipo = (kind: AgendaTipo) => {
    const c = v.customer_id ? clientesPorId.get(v.customer_id) : null;
    const p: Partial<Estado> = { kind };
    if (!tituloManual && c) p.title = `${TIPOS[kind].label} · ${nomeCliente(c)}`;
    if (!localManual && c) p.location = localSugerido(c, kind);
    set(p);
  };

  const escolherCliente = (id: string | undefined) => {
    const c = id ? clientesPorId.get(id) : null;
    const p: Partial<Estado> = { customer_id: id ?? null, proposta_id: null };
    if (!tituloManual) p.title = c ? `${TIPOS[v.kind].label} · ${nomeCliente(c)}` : "";
    if (!localManual) p.location = localSugerido(c, v.kind);
    if (gestao && c?.representative_id) p.representative_id = c.representative_id;
    set(p);
  };

  const clienteEscolhido = v.customer_id ? clientesPorId.get(v.customer_id) : null;
  const localDoCliente = localSugerido(clienteEscolhido, v.kind);
  const propostas = propostasQ.data ?? [];

  const gravar = async () => {
    const titulo = v.title.trim();
    if (!titulo) {
      toast.error("Dê um título ao compromisso.");
      return;
    }
    if (!v.dia) {
      toast.error("Escolha a data.");
      return;
    }
    const ini = v.diaTodo ? juntarDataHora(v.dia, "00:00") : juntarDataHora(v.dia, v.inicio || "09:00");
    let fim: Date | null = null;
    if (!v.diaTodo && v.fim) {
      fim = juntarDataHora(v.dia, v.fim);
      if (fim < ini) {
        toast.error("O fim não pode ser antes do início.");
        return;
      }
    }
    try {
      await salvar.mutateAsync({
        id: compromisso?.id,
        kind: v.kind,
        title: titulo.slice(0, 160),
        customer_id: v.customer_id,
        proposta_id: v.proposta_id,
        representative_id: gestao ? v.representative_id : undefined,
        starts_at: ini.toISOString(),
        ends_at: fim ? fim.toISOString() : null,
        all_day: v.diaTodo,
        location: v.location.trim() || null,
        notes: v.notes.trim() || null,
      });
      toast.success(compromisso ? "Compromisso atualizado" : "Compromisso agendado");
      onClose();
    } catch (e) {
      toast.error(mensagemErroAgenda(e));
    }
  };

  const apagar = async () => {
    if (!compromisso) return;
    if (!confirmarExclusao) {
      setConfirmarExclusao(true);
      return;
    }
    try {
      await excluir.mutateAsync(compromisso.id);
      toast.success("Compromisso excluído");
      onClose();
    } catch (e) {
      toast.error(mensagemErroAgenda(e));
    }
  };

  const ocupado = salvar.isPending || excluir.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(DIALOG_CLASSE, "sm:max-w-2xl")}>
        <DialogHeader>
          <DialogTitle>{compromisso ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
          <DialogDescription>
            {gestao ? "Visitas, ligações e entregas da equipe de vendas." : "Seus compromissos com os clientes da sua carteira."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ORDEM_TIPOS.map((k) => {
                const t = TIPOS[k];
                const Icone = t.icon;
                const ativo = v.kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => escolherTipo(k)}
                    aria-pressed={ativo}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-sm transition-colors",
                      ativo ? cn(t.chip, "border-transparent font-medium ring-2 ring-primary/40") : "hover:bg-muted",
                    )}
                  >
                    <Icone className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={cn("grid gap-4", gestao && "sm:grid-cols-2")}>
            <div className="min-w-0 space-y-2">
              <Label>Cliente</Label>
              <SearchSelect
                options={opcoesClientes}
                value={v.customer_id}
                onChange={escolherCliente}
                placeholder={clientesQ.isLoading ? "Carregando clientes..." : "Sem cliente"}
                searchPlaceholder="Buscar cliente..."
                emptyText={gestao ? "Nenhum cliente encontrado." : "Nenhum cliente na sua carteira com esse nome."}
                title={gestao ? "Escolher cliente" : "Cliente da sua carteira"}
              />
            </div>

            {gestao && (
              <div className="min-w-0 space-y-2">
                <Label>Representante</Label>
                <Select
                  value={v.representative_id ?? SEM}
                  onValueChange={(x) => set({ representative_id: x === SEM ? null : x })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem representante" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Sem representante (equipe interna)</SelectItem>
                    {repsVisiveis.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                        {!r.is_active ? " (inativo)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda-titulo">Título</Label>
            <Input
              id="agenda-titulo"
              value={v.title}
              maxLength={160}
              onChange={(e) => {
                setTituloManual(true);
                set({ title: e.target.value });
              }}
              placeholder="Ex.: Visita · apresentar a linha nova"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label>Data</Label>
              <DatePickerDialog value={v.dia} onChange={(d) => set({ dia: d })} title="Data do compromisso" />
            </div>
            {v.diaTodo ? (
              <div className="hidden sm:block" />
            ) : (
              <div className="grid min-w-0 grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="agenda-inicio">Início</Label>
                  <Input
                    id="agenda-inicio"
                    type="time"
                    value={v.inicio}
                    onChange={(e) => {
                      const novo = e.target.value;
                      // Arrasta o fim junto, mantendo a duração.
                      const [h1, m1] = v.inicio.split(":").map((n) => parseInt(n, 10) || 0);
                      const [h2, m2] = (v.fim || v.inicio).split(":").map((n) => parseInt(n, 10) || 0);
                      const dur = Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
                      set({ inicio: novo, fim: v.fim && novo ? somarHora(novo, dur) : v.fim });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agenda-fim">Fim</Label>
                  <Input id="agenda-fim" type="time" value={v.fim} onChange={(e) => set({ fim: e.target.value })} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="agenda-dia-todo" className="cursor-pointer">Dia todo</Label>
            <Switch id="agenda-dia-todo" checked={v.diaTodo} onCheckedChange={(x) => set({ diaTodo: x })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <div className="flex h-5 items-center justify-between gap-2">
                <Label htmlFor="agenda-local">Local</Label>
                {localDoCliente && v.location !== localDoCliente && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => {
                      setLocalManual(false);
                      set({ location: localDoCliente });
                    }}
                  >
                    {v.kind === "ligacao" && /^\(/.test(localDoCliente) ? "Usar telefone do cliente" : "Usar endereço do cliente"}
                  </button>
                )}
              </div>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="agenda-local"
                  className="pl-9"
                  value={v.location}
                  onChange={(e) => {
                    setLocalManual(true);
                    set({ location: e.target.value });
                  }}
                  placeholder={v.kind === "ligacao" ? "Telefone ou link (opcional)" : "Endereço ou link da reunião"}
                />
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex h-5 items-center">
                <Label>Proposta</Label>
              </div>
              <Select
                value={v.proposta_id ?? SEM}
                onValueChange={(x) => set({ proposta_id: x === SEM ? null : x })}
                disabled={!v.customer_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={v.customer_id ? "Nenhuma" : "Escolha o cliente primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>{v.customer_id ? "Nenhuma" : "Escolha o cliente primeiro"}</SelectItem>
                  {propostas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.number} · {PROPOSTA_STATUS_LABEL[p.status] ?? p.status} · {moeda(p.total)}
                    </SelectItem>
                  ))}
                  {/* A proposta ligada some da lista se o cliente mudou de carteira: mantém a escolha visível. */}
                  {v.proposta_id && !propostas.some((p) => p.id === v.proposta_id) && compromisso?.proposta && (
                    <SelectItem value={v.proposta_id}>{compromisso.proposta.number}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {v.customer_id && !propostasQ.isLoading && propostas.length === 0 && (
                <p className="text-xs text-muted-foreground">Este cliente ainda não tem proposta.</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda-notas">Observações</Label>
            <Textarea
              id="agenda-notas"
              rows={3}
              value={v.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Pauta, quem procurar, o que levar..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {compromisso && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
              onClick={apagar}
              disabled={ocupado}
            >
              <Trash2 className="h-4 w-4" />
              {confirmarExclusao ? "Confirmar exclusão" : "Excluir"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={ocupado}>
            Voltar
          </Button>
          <Button type="button" onClick={gravar} disabled={ocupado}>
            {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {compromisso ? "Salvar" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
