import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, CalendarDays, ChevronRight, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useAgendaAtrasados,
  useProximosCompromissos,
  useRepresentanteLogado,
  type AgendaCompromisso,
} from "@/hooks/use-vendas-agenda";
import { CancelarDialog, ConcluirDialog, ReagendarDialog } from "./AgendaAcoes";
import { AgendaDetalheDialog } from "./AgendaDetalheDialog";
import { AgendaFormDialog } from "./AgendaFormDialog";
import { AgendaItemLinha } from "./AgendaItens";
import { estaAtrasado } from "./agenda-utils";

/**
 * Próximos compromissos agendados (de hoje em diante), com "Concluir" rápido.
 * Usado no painel da gestão e na tela "Hoje" do representante.
 */
export function ProximosCompromissos({
  limit = 5,
  representativeId,
  className,
  title = "Próximos compromissos",
}: {
  limit?: number;
  /** Só os deste representante (a gestão escolhe; o representante já só enxerga os dele). */
  representativeId?: string | null;
  className?: string;
  title?: string;
}) {
  const location = useLocation();
  const repLogado = useRepresentanteLogado();
  const ehRep = location.pathname.startsWith("/representante") || !!repLogado.data;
  const base = ehRep ? "/representante/agenda" : "/pdv/vendas/agenda";
  const modo = ehRep ? "representante" : "gestao";

  const q = useProximosCompromissos({ limit, representativeId });
  const atrasadosQ = useAgendaAtrasados({ representativeId });
  // Os de hoje que já passaram aparecem na lista; aqui contam só os de dias anteriores.
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const atrasadosAntes = (atrasadosQ.data ?? []).filter(
    (c) => estaAtrasado(c) && new Date(c.starts_at) < inicioHoje,
  ).length;

  const [detalhe, setDetalhe] = useState<AgendaCompromisso | null>(null);
  const [concluir, setConcluir] = useState<AgendaCompromisso | null>(null);
  const [reagendar, setReagendar] = useState<AgendaCompromisso | null>(null);
  const [cancelar, setCancelar] = useState<AgendaCompromisso | null>(null);
  const [editar, setEditar] = useState<AgendaCompromisso | null>(null);

  const itens = q.data ?? [];

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-muted-foreground" /> {title}
        </CardTitle>
        <Link to={base} className="inline-flex shrink-0 items-center text-sm font-medium text-primary hover:underline">
          Ver agenda <ChevronRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-2">
        {atrasadosAntes > 0 && (
          <Link
            to={base}
            className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {atrasadosAntes === 1
                ? "1 compromisso atrasado de dias anteriores"
                : `${atrasadosAntes}${atrasadosAntes >= 200 ? "+" : ""} compromissos atrasados de dias anteriores`}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </Link>
        )}

        {q.isPending ? (
          Array.from({ length: Math.min(limit, 3) }).map((_, i) => <Skeleton key={i} className="h-[4.5rem] w-full" />)
        ) : q.isError ? (
          <p className="py-4 text-center text-sm text-destructive">Não foi possível carregar a agenda.</p>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">Nada agendado de hoje em diante.</p>
            <Link
              to={`${base}?novo=1`}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <Plus className="h-4 w-4" /> Agendar compromisso
            </Link>
          </div>
        ) : (
          itens.map((c) => (
            <AgendaItemLinha
              key={c.id}
              c={c}
              gestao={!ehRep && !representativeId}
              mostrarDia
              concluirCompacto
              onAbrir={setDetalhe}
              onConcluir={setConcluir}
            />
          ))
        )}
      </CardContent>

      <AgendaDetalheDialog
        compromisso={detalhe}
        mode={modo}
        onClose={() => setDetalhe(null)}
        onEditar={setEditar}
        onConcluir={setConcluir}
        onReagendar={setReagendar}
        onCancelar={setCancelar}
      />
      <AgendaFormDialog open={!!editar} onClose={() => setEditar(null)} mode={modo} compromisso={editar} />
      <ConcluirDialog compromisso={concluir} onClose={() => setConcluir(null)} />
      <ReagendarDialog compromisso={reagendar} onClose={() => setReagendar(null)} />
      <CancelarDialog compromisso={cancelar} onClose={() => setCancelar(null)} />
    </Card>
  );
}

export default ProximosCompromissos;
