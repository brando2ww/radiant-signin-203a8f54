import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock, CalendarPlus, CheckCircle2, Clock, Download, FileText, MapPin, MessageCircle, Pencil, Phone, RotateCcw,
  StickyNote, User, UserCircle, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PROPOSTA_STATUS_LABEL } from "@/lib/vendas/types";
import { mensagemErroAgenda, useAgendaMutacoes, type AgendaCompromisso } from "@/hooks/use-vendas-agenda";
import { DIALOG_CLASSE } from "./AgendaAcoes";
import { SeloSituacao } from "./AgendaItens";
import { baixarIcs, diaLongo, googleAgendaUrl, horarioTexto, inicioDe, moeda, nomeCliente, TIPOS } from "./agenda-utils";

function Linha({ icone, children }: { icone: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icone}</span>
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function AgendaDetalheDialog({
  compromisso: c,
  mode,
  onClose,
  onEditar,
  onConcluir,
  onReagendar,
  onCancelar,
}: {
  compromisso: AgendaCompromisso | null;
  mode: "gestao" | "representante";
  onClose: () => void;
  onEditar: (c: AgendaCompromisso) => void;
  onConcluir: (c: AgendaCompromisso) => void;
  onReagendar: (c: AgendaCompromisso) => void;
  onCancelar: (c: AgendaCompromisso) => void;
}) {
  const { reabrir } = useAgendaMutacoes();
  const gestao = mode === "gestao";
  const base = gestao ? "/pdv/vendas" : "/representante";

  if (!c) return <Dialog open={false} />;

  const t = TIPOS[c.kind] ?? TIPOS.outro;
  const Icone = t.icon;
  const cliente = nomeCliente(c.customer);
  const fone = soDigitos(c.customer?.phone || c.customer?.whatsapp);
  const zap = soDigitos(c.customer?.whatsapp || c.customer?.phone);
  const zapLink = zap ? `https://wa.me/${zap.length <= 11 ? `55${zap}` : zap}` : null;
  const agendado = c.status === "scheduled";

  const fazer = (fn: (c: AgendaCompromisso) => void) => () => {
    onClose();
    fn(c);
  };

  const reabrirAgora = async () => {
    try {
      await reabrir.mutateAsync(c.id);
      toast.success("Compromisso reaberto");
      onClose();
    } catch (e) {
      toast.error(mensagemErroAgenda(e));
    }
  };

  return (
    <Dialog open={!!c} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={DIALOG_CLASSE}>
        <DialogHeader className="text-left">
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium", t.chip)}>
              <Icone className="h-3.5 w-3.5" /> {t.label}
            </span>
            <SeloSituacao c={c} />
          </div>
          <DialogTitle className={cn("text-left text-lg leading-snug", c.status === "cancelled" && "line-through")}>
            {c.title}
          </DialogTitle>
          <DialogDescription className="sr-only">Detalhes do compromisso</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Linha icone={<Clock className="h-4 w-4" />}>
            <p className="font-medium">{diaLongo(inicioDe(c))}</p>
            <p className="text-muted-foreground">{horarioTexto(c)}</p>
          </Linha>

          {cliente && (
            <Linha icone={<User className="h-4 w-4" />}>
              {c.customer_id ? (
                <Link to={`${base}/clientes/${c.customer_id}`} className="font-medium hover:underline" onClick={onClose}>
                  {cliente}
                </Link>
              ) : (
                <span className="font-medium">{cliente}</span>
              )}
              {c.customer?.city && (
                <p className="text-muted-foreground">{[c.customer.city, c.customer.state].filter(Boolean).join("/")}</p>
              )}
              {(fone || zapLink) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {fone && (
                    <Button asChild size="sm" variant="outline">
                      <a href={`tel:${fone}`}>
                        <Phone className="h-4 w-4" /> Ligar
                      </a>
                    </Button>
                  )}
                  {zapLink && (
                    <Button asChild size="sm" variant="outline">
                      <a href={zapLink} target="_blank" rel="noreferrer">
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </Linha>
          )}

          {gestao && (
            <Linha icone={<UserCircle className="h-4 w-4" />}>
              {c.representante?.name ?? <span className="text-muted-foreground">Sem representante</span>}
            </Linha>
          )}

          {c.location && (
            <Linha icone={<MapPin className="h-4 w-4" />}>
              <p>{c.location}</p>
              {/^https?:\/\//i.test(c.location) ? (
                <a href={c.location} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">
                  Abrir link
                </a>
              ) : /^[\d\s()+-]{8,}$/.test(c.location) ? (
                <a href={`tel:${soDigitos(c.location)}`} className="text-xs font-medium text-primary hover:underline">
                  Ligar para este número
                </a>
              ) : (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.location)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Abrir no mapa
                </a>
              )}
            </Linha>
          )}

          {c.proposta && (
            <Linha icone={<FileText className="h-4 w-4" />}>
              <Link to={`${base}/propostas/${c.proposta.id}`} className="font-medium hover:underline" onClick={onClose}>
                Proposta {c.proposta.number}
              </Link>
              <p className="text-muted-foreground">
                {PROPOSTA_STATUS_LABEL[c.proposta.status] ?? c.proposta.status} · {moeda(c.proposta.total)}
              </p>
            </Linha>
          )}

          {c.notes && (
            <Linha icone={<StickyNote className="h-4 w-4" />}>
              <p className="whitespace-pre-wrap">{c.notes}</p>
            </Linha>
          )}

          {c.status !== "scheduled" && c.outcome && (
            <div
              className={cn(
                "rounded-md border p-3 text-sm",
                c.status === "done" ? "border-success/30 bg-success/5" : "bg-muted/40",
              )}
            >
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {c.status === "done" ? "Resultado" : "Motivo do cancelamento"}
              </p>
              <p className="whitespace-pre-wrap">{c.outcome}</p>
            </div>
          )}
        </div>

        <div className="space-y-2 border-t pt-4">
          {agendado ? (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={fazer(onConcluir)} className="col-span-2">
                <CheckCircle2 className="h-4 w-4" /> Concluir
              </Button>
              <Button variant="outline" onClick={fazer(onReagendar)}>
                <CalendarClock className="h-4 w-4" /> Reagendar
              </Button>
              <Button variant="outline" onClick={fazer(onEditar)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
              <Button
                variant="ghost"
                className="col-span-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={fazer(onCancelar)}
              >
                <XCircle className="h-4 w-4" /> Cancelar compromisso
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={reabrirAgora} disabled={reabrir.isPending}>
                <RotateCcw className="h-4 w-4" /> Reabrir
              </Button>
              <Button variant="outline" onClick={fazer(onEditar)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            </div>
          )}
          {c.status !== "cancelled" && (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-xs">
              <a
                href={googleAgendaUrl(c)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <CalendarPlus className="h-3.5 w-3.5" /> Adicionar ao Google Agenda
              </a>
              <button
                type="button"
                onClick={() => baixarIcs(c)}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Baixar .ics
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
