import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BadgePercent, ChevronDown, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { useRepContextOptional } from "@/components/vendas/rep/RepContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { nomeClienteComissao, useMinhasComissoes, type ComissaoLinha } from "@/hooks/use-vendas-comissoes";
import { dataBR } from "@/components/vendas/financeiro/fin-utils";

type Mes = {
  chave: string;
  rotulo: string;
  itens: ComissaoLinha[];
  total: number;
  pendente: number;
  pago: number;
};

function rotuloMes(chave: string) {
  if (chave === "sem-data") return "Sem data";
  const s = format(parseISO(`${chave}-01T12:00:00`), "MMMM 'de' yyyy", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Situacao({ c }: { c: ComissaoLinha }) {
  if (c.status === "paid")
    return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Paga</span>;
  if (c.status === "cancelled")
    return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Cancelada</span>;
  return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">A receber</span>;
}

/** Comissões do representante (celular): o que tem a receber, o que já recebeu e o detalhe de cada mês. */
export default function RepComissoes() {
  const ctx = useRepContextOptional();
  const { visibleUserId } = useEstablishmentId();
  const ownerId = ctx?.ownerId ?? visibleUserId;
  const repId = ctx?.repId ?? null;
  const { data = [], isLoading, isError, refetch } = useMinhasComissoes(ownerId, repId);
  const [abertos, setAbertos] = useState<Set<string> | null>(null);

  const totais = useMemo(() => {
    const t = { pendente: 0, nPendente: 0, pago: 0 };
    for (const c of data) {
      if (c.status === "pending") {
        t.pendente += Number(c.amount || 0);
        t.nPendente++;
      } else if (c.status === "paid") t.pago += Number(c.amount || 0);
    }
    return t;
  }, [data]);

  const meses = useMemo<Mes[]>(() => {
    const m = new Map<string, Mes>();
    for (const c of data) {
      const chave = c.received_at ? c.received_at.slice(0, 7) : "sem-data";
      const mes = m.get(chave) ?? { chave, rotulo: rotuloMes(chave), itens: [], total: 0, pendente: 0, pago: 0 };
      mes.itens.push(c);
      if (c.status !== "cancelled") mes.total += Number(c.amount || 0);
      if (c.status === "pending") mes.pendente += Number(c.amount || 0);
      if (c.status === "paid") mes.pago += Number(c.amount || 0);
      m.set(chave, mes);
    }
    return [...m.values()].sort((a, b) => (a.chave < b.chave ? 1 : -1));
  }, [data]);

  // Começa com o mês mais recente aberto.
  const abertosEfetivo = abertos ?? new Set(meses.slice(0, 1).map((m) => m.chave));
  const alternar = (chave: string) => {
    const n = new Set(abertosEfetivo);
    if (n.has(chave)) n.delete(chave);
    else n.add(chave);
    setAbertos(n);
  };

  const percentual = ctx?.rep?.commission_percent;
  const titulo = ctx?.isPreview ? (ctx.rep ? `Comissões de ${ctx.rep.name.split(" ")[0]}` : "Comissões de todos") : "Minhas comissões";

  return (
    <div className="space-y-5 px-4 py-5">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {percentual != null && Number(percentual) > 0
            ? `${Number(percentual).toLocaleString("pt-BR")}% sobre o que o cliente pagou. `
            : ""}
          A comissão aparece quando a parcela do pedido é paga.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3" aria-label="Resumo">
        <div className="col-span-2 rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm">
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Wallet className="h-4 w-4" /> A receber da empresa
          </div>
          {isLoading ? (
            <Skeleton className="mt-2 h-9 w-40 bg-primary-foreground/20" />
          ) : (
            <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{formatBRL(totais.pendente)}</p>
          )}
          <p className="mt-1 text-xs opacity-90">
            {isLoading ? " " : `${totais.nPendente} ${totais.nPendente === 1 ? "comissão aguardando pagamento" : "comissões aguardando pagamento"}`}
          </p>
        </div>
        <div className="col-span-2 rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Já recebido</p>
          {isLoading ? <Skeleton className="mt-2 h-7 w-28" /> : <p className="mt-1 text-xl font-semibold tabular-nums">{formatBRL(totais.pago)}</p>}
        </div>
      </section>

      {isError ? (
        <div className="rounded-2xl border p-5 text-center text-sm">
          <p>Não consegui carregar as comissões.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : meses.length === 0 ? (
        <div className="rounded-2xl border px-5 py-10 text-center">
          <BadgePercent className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhuma comissão ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">Quando um cliente seu pagar uma parcela de pedido, ela aparece aqui.</p>
        </div>
      ) : (
        <section className="space-y-3" aria-label="Por mês">
          {meses.map((m) => {
            const aberto = abertosEfetivo.has(m.chave);
            return (
              <div key={m.chave} className="overflow-hidden rounded-2xl border bg-card">
                <button
                  type="button"
                  onClick={() => alternar(m.chave)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left active:bg-muted/60"
                  aria-expanded={aberto}
                >
                  <div className="min-w-0">
                    <p className="font-medium">{m.rotulo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.pendente > 0 && <span className="text-amber-700 dark:text-amber-300">{formatBRL(m.pendente)} a receber</span>}
                      {m.pendente > 0 && m.pago > 0 && " · "}
                      {m.pago > 0 && <span className="text-emerald-700 dark:text-emerald-300">{formatBRL(m.pago)} pago</span>}
                      {m.pendente === 0 && m.pago === 0 && "Só canceladas"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatBRL(m.total)}</span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", aberto && "rotate-180")} />
                  </div>
                </button>
                {aberto && (
                  <ul className="divide-y border-t">
                    {m.itens.map((c) => (
                      <li key={c.id} className={cn("px-4 py-3", c.status === "cancelled" && "opacity-60")}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{nomeClienteComissao(c)}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.vendas_pedidos?.number ? `${c.vendas_pedidos.number} · ` : ""}cliente pagou em {dataBR(c.received_at)}
                            </p>
                          </div>
                          <p className={cn("shrink-0 text-sm font-semibold tabular-nums", c.status === "cancelled" && "line-through")}>
                            {formatBRL(c.amount)}
                          </p>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="tabular-nums">
                            {Number(c.percent).toLocaleString("pt-BR")}% de {formatBRL(c.base_amount)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            {c.status === "paid" && c.paid_at && <span>em {dataBR(c.paid_at)}</span>}
                            <Situacao c={c} />
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
