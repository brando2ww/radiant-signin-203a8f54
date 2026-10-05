import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarPlus, ChevronRight, FilePlus2, FileText, PiggyBank, TrendingUp, UserPlus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ClienteDialog } from "@/components/vendas/clientes/ClienteDialog";
import { ProximosCompromissos } from "@/components/vendas/agenda/ProximosCompromissos";
import { useRepContext } from "@/components/vendas/rep/RepContext";
import { PropostaStatusBadge } from "@/components/vendas/rep/RepStatusBadge";
import { firstName, greeting } from "@/components/vendas/rep/rep-utils";
import { useVendasRepResumo } from "@/hooks/use-vendas-rep-resumo";
import { formatBRL } from "@/lib/format";

/** Tela inicial do representante: resumo do mês, atalhos e o que vem pela frente. */
export default function RepHoje() {
  const { ownerId, rep, repId, isPreview } = useRepContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [novoCliente, setNovoCliente] = useState(false);
  const { data: resumo, isLoading, isError, refetch } = useVendasRepResumo(ownerId, repId);

  const hojeTexto = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });
  const hoje = hojeTexto.charAt(0).toUpperCase() + hojeTexto.slice(1);
  const nome = firstName(rep?.name);
  const mesNome = format(new Date(), "MMMM", { locale: ptBR });

  return (
    <div className="space-y-6 px-4 py-5">
      <section>
        <p className="text-sm text-muted-foreground">{hoje}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
          {greeting()}
          {nome ? `, ${nome}` : ""}
        </h1>
        {isPreview && !rep && (
          <p className="mt-1 text-xs text-muted-foreground">Mostrando os números de todos os representantes.</p>
        )}
      </section>

      {/* Números do mês */}
      <section aria-label="Resumo" className="grid grid-cols-2 gap-3">
        <div className="col-span-2 rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm">
          <div className="flex items-center gap-2 text-sm opacity-90">
            <TrendingUp className="h-4 w-4" />
            <span>Vendas de {mesNome}</span>
          </div>
          {isLoading ? (
            <Skeleton className="mt-2 h-9 w-40 bg-primary-foreground/20" />
          ) : (
            <p className="mt-1 text-3xl font-bold tracking-tight">{formatBRL(resumo?.vendasMes.total)}</p>
          )}
          <p className="mt-1 text-xs opacity-90">
            {isLoading ? " " : `${resumo?.vendasMes.count ?? 0} ${resumo?.vendasMes.count === 1 ? "pedido" : "pedidos"} no mês`}
          </p>
        </div>

        <Link
          to="/representante/propostas"
          className="rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/50 active:bg-muted"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Propostas abertas
          </div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-12" />
          ) : (
            <p className="mt-1 text-2xl font-semibold">{resumo?.abertas.count ?? 0}</p>
          )}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {isLoading ? " " : formatBRL(resumo?.abertas.total)}
          </p>
        </Link>

        <Link
          to="/representante/comissoes"
          className="rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/50 active:bg-muted"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PiggyBank className="h-3.5 w-3.5" />
            Comissão do mês
          </div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="mt-1 truncate text-2xl font-semibold">{formatBRL(resumo?.comissaoMes.total)}</p>
          )}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {isLoading
              ? " "
              : resumo && resumo.comissaoMes.pendente > 0
                ? `${formatBRL(resumo.comissaoMes.pendente)} a receber`
                : "sobre o recebido"}
          </p>
        </Link>

        {isError && (
          <button
            type="button"
            onClick={() => refetch()}
            className="col-span-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-xs text-destructive"
          >
            Não foi possível carregar os números. Toque para tentar de novo.
          </button>
        )}
      </section>

      {/* Atalhos */}
      <section aria-label="Atalhos" className="grid grid-cols-3 gap-3">
        <QuickAction icon={FilePlus2} label="Nova proposta" onClick={() => navigate("/representante/propostas/nova")} primary />
        <QuickAction icon={UserPlus} label="Novo cliente" onClick={() => setNovoCliente(true)} />
        <QuickAction icon={CalendarPlus} label="Nova visita" onClick={() => navigate("/representante/agenda?novo=1&tipo=visita")} />
      </section>

      {/* Agenda (widget da agenda: tem título, "Ver agenda" e concluir rápido) */}
      <ProximosCompromissos limit={5} representativeId={repId} className="rounded-2xl" />

      {/* Propostas esperando o cliente */}
      {!!resumo?.aguardando.length && (
        <section aria-labelledby="rep-hoje-aguardando" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="rep-hoje-aguardando" className="text-base font-semibold">
              Aguardando o cliente
            </h2>
            <Link to="/representante/propostas" className="flex items-center text-sm font-medium text-primary">
              Propostas
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {resumo.aguardando.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/representante/propostas/${p.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.customer?.trade_name?.trim() || p.customer?.name || "Cliente"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.number}
                      {p.sent_at ? ` · enviada ${format(new Date(p.sent_at), "dd/MM")}` : ""}
                      {p.viewed_at ? " · visualizada" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{formatBRL(p.total)}</span>
                    <PropostaStatusBadge status={p.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ClienteDialog
        open={novoCliente}
        onOpenChange={setNovoCliente}
        mode={isPreview ? "gestao" : "representante"}
        onSaved={(c) => {
          qc.invalidateQueries({ queryKey: ["vendas-rep-clientes"] });
          if (c?.id) navigate(`/representante/clientes/${c.id}`);
        }}
      />
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? "flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl bg-primary px-2 py-3 text-center text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:scale-[0.98]"
          : "flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl border bg-card px-2 py-3 text-center transition-colors hover:bg-muted/50 active:scale-[0.98]"
      }
    >
      <Icon className="h-6 w-6" />
      <span className="text-xs font-medium leading-tight">{label}</span>
    </button>
  );
}
