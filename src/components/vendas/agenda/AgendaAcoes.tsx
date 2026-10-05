import { useEffect, useState } from "react";
import { addMinutes, format } from "date-fns";
import { CalendarClock, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerDialog } from "@/components/ui/date-picker-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { mensagemErroAgenda, useAgendaMutacoes, type AgendaCompromisso } from "@/hooks/use-vendas-agenda";
import { diaCurto, duracaoMin, horarioTexto, inicioDe, juntarDataHora, nomeCliente, TIPOS } from "./agenda-utils";

export const DIALOG_CLASSE = "w-[calc(100%-1.5rem)] max-h-[92dvh] overflow-y-auto rounded-lg sm:max-w-lg";

function Resumo({ c }: { c: AgendaCompromisso }) {
  const t = TIPOS[c.kind] ?? TIPOS.outro;
  const Icone = t.icon;
  const cliente = nomeCliente(c.customer);
  return (
    <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${t.chip}`}>
        <Icone className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium">{c.title}</p>
        <p className="text-muted-foreground">
          {diaCurto(inicioDe(c))} · {horarioTexto(c)}
          {cliente ? ` · ${cliente}` : ""}
        </p>
      </div>
    </div>
  );
}

const DICA_RESULTADO: Record<string, string> = {
  visita: "Como foi a visita? Ex.: pediu proposta de 20 caixas, voltar em 15 dias.",
  ligacao: "O que ficou combinado na ligação?",
  reuniao: "O que foi decidido na reunião?",
  entrega: "Entregue completo? Alguma observação do recebimento?",
};

/** Marcar como feito, com o resultado da visita. */
export function ConcluirDialog({
  compromisso,
  onClose,
  onAgendarRetorno,
}: {
  compromisso: AgendaCompromisso | null;
  onClose: () => void;
  /** Quando passado, mostra "Concluir e agendar retorno". */
  onAgendarRetorno?: (c: AgendaCompromisso) => void;
}) {
  const { concluir } = useAgendaMutacoes();
  const [resultado, setResultado] = useState("");

  useEffect(() => {
    if (compromisso) setResultado(compromisso.outcome ?? "");
  }, [compromisso]);

  const gravar = async (retorno: boolean) => {
    if (!compromisso) return;
    try {
      await concluir.mutateAsync({ id: compromisso.id, outcome: resultado.trim() || null });
      toast.success("Compromisso concluído");
      const c = compromisso;
      onClose();
      if (retorno && onAgendarRetorno) onAgendarRetorno(c);
    } catch (e) {
      toast.error(mensagemErroAgenda(e));
    }
  };

  return (
    <Dialog open={!!compromisso} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={DIALOG_CLASSE}>
        <DialogHeader>
          <DialogTitle>Concluir compromisso</DialogTitle>
          <DialogDescription>Registre o resultado para o histórico do cliente.</DialogDescription>
        </DialogHeader>
        {compromisso && <Resumo c={compromisso} />}
        <div className="space-y-2">
          <Label htmlFor="agenda-resultado">Resultado</Label>
          <Textarea
            id="agenda-resultado"
            rows={4}
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            placeholder={DICA_RESULTADO[compromisso?.kind ?? ""] ?? "O que aconteceu? (opcional)"}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={concluir.isPending}>
            Voltar
          </Button>
          {onAgendarRetorno && (
            <Button variant="secondary" onClick={() => gravar(true)} disabled={concluir.isPending}>
              <CalendarClock className="h-4 w-4" /> Concluir e agendar retorno
            </Button>
          )}
          <Button onClick={() => gravar(false)} disabled={concluir.isPending}>
            {concluir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Nova data e horário, mantendo a duração. */
export function ReagendarDialog({ compromisso, onClose }: { compromisso: AgendaCompromisso | null; onClose: () => void }) {
  const { reagendar } = useAgendaMutacoes();
  const [dia, setDia] = useState<Date | undefined>();
  const [inicio, setInicio] = useState("09:00");
  const [fim, setFim] = useState("");
  const [diaTodo, setDiaTodo] = useState(false);

  useEffect(() => {
    if (!compromisso) return;
    const ini = inicioDe(compromisso);
    setDia(ini);
    setDiaTodo(compromisso.all_day);
    setInicio(compromisso.all_day ? "09:00" : format(ini, "HH:mm"));
    const dur = duracaoMin(compromisso);
    setFim(dur != null ? format(addMinutes(ini, dur), "HH:mm") : "");
  }, [compromisso]);

  const gravar = async () => {
    if (!compromisso || !dia) return;
    const ini = diaTodo ? juntarDataHora(dia, "00:00") : juntarDataHora(dia, inicio);
    let fimData: Date | null = null;
    if (!diaTodo && fim) {
      fimData = juntarDataHora(dia, fim);
      if (fimData < ini) {
        toast.error("O fim não pode ser antes do início.");
        return;
      }
    }
    try {
      await reagendar.mutateAsync({
        id: compromisso.id,
        starts_at: ini.toISOString(),
        ends_at: fimData ? fimData.toISOString() : null,
        all_day: diaTodo,
      });
      toast.success(`Reagendado para ${diaCurto(ini).toLowerCase()}${diaTodo ? "" : ` às ${format(ini, "HH:mm")}`}`);
      onClose();
    } catch (e) {
      toast.error(mensagemErroAgenda(e));
    }
  };

  return (
    <Dialog open={!!compromisso} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={DIALOG_CLASSE}>
        <DialogHeader>
          <DialogTitle>Reagendar</DialogTitle>
          <DialogDescription>Escolha a nova data. O compromisso volta para agendado.</DialogDescription>
        </DialogHeader>
        {compromisso && <Resumo c={compromisso} />}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nova data</Label>
            <DatePickerDialog value={dia} onChange={setDia} title="Nova data" />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="reagendar-dia-todo" className="cursor-pointer">Dia todo</Label>
            <Switch id="reagendar-dia-todo" checked={diaTodo} onCheckedChange={setDiaTodo} />
          </div>
          {!diaTodo && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="reagendar-inicio">Início</Label>
                <Input id="reagendar-inicio" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reagendar-fim">Fim</Label>
                <Input id="reagendar-fim" type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={reagendar.isPending}>
            Voltar
          </Button>
          <Button onClick={gravar} disabled={reagendar.isPending || !dia}>
            {reagendar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Reagendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cancelar, com motivo opcional (fica no campo de resultado). */
export function CancelarDialog({ compromisso, onClose }: { compromisso: AgendaCompromisso | null; onClose: () => void }) {
  const { cancelar } = useAgendaMutacoes();
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (compromisso) setMotivo("");
  }, [compromisso]);

  const gravar = async () => {
    if (!compromisso) return;
    try {
      await cancelar.mutateAsync({ id: compromisso.id, motivo: motivo.trim() || null });
      toast.success("Compromisso cancelado");
      onClose();
    } catch (e) {
      toast.error(mensagemErroAgenda(e));
    }
  };

  return (
    <Dialog open={!!compromisso} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={DIALOG_CLASSE}>
        <DialogHeader>
          <DialogTitle>Cancelar compromisso</DialogTitle>
          <DialogDescription>Ele continua na agenda, riscado, para o histórico.</DialogDescription>
        </DialogHeader>
        {compromisso && <Resumo c={compromisso} />}
        <div className="space-y-2">
          <Label htmlFor="agenda-motivo">Motivo</Label>
          <Textarea
            id="agenda-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: cliente pediu para remarcar (opcional)"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={cancelar.isPending}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={gravar} disabled={cancelar.isPending}>
            {cancelar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Cancelar compromisso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
