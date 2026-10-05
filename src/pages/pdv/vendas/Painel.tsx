import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  FileSignature,
  Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PROPOSTA_STATUS_LABEL, type PropostaStatus } from "@/lib/vendas/types";
import { usePainelVendas } from "@/components/vendas/painel/use-painel-vendas";
import { ProximosCompromissos } from "@/components/vendas/agenda/ProximosCompromissos";

const STATUS_CLASSE: Record<PropostaStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  converted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  expired: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  cancelled: "bg-muted text-muted-foreground line-through",
};

const plural = (q: number, um: string, varios: string) => `${q.toLocaleString("pt-BR")} ${q === 1 ? um : varios}`;

function Tile({
  rotulo,
  valor,
  detalhe,
  para,
  alerta,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  para?: string;
  alerta?: boolean;
}) {
  const corpo = (
    <Card className={cn("h-full p-4 transition-colors", para && "hover:bg-muted/40")}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums md:text-2xl", alerta && "text-destructive")}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
    </Card>
  );
  return para ? (
    <Link to={para} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {corpo}
    </Link>
  ) : (
    corpo
  );
}

function Secao({
  titulo,
  icone: Icone,
  acao,
  children,
  className,
}: {
  titulo: string;
  icone: LucideIcon;
  acao?: { rotulo: string; para: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icone className="h-4 w-4 text-muted-foreground" />
          {titulo}
        </h2>
        {acao && (
          <Link
            to={acao.para}
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground hover:text-foreground"
          >
            {acao.rotulo} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

export default function Painel() {
  const { data, isLoading, error } = usePainelVendas();
  const mes = format(new Date(), "MMMM", { locale: ptBR });

  const vazio =
    !!data &&
    !data.temRepresentantes &&
    data.propostasAbertas.qtd === 0 &&
    data.pedidosMes.qtd === 0 &&
    data.ultimas.length === 0;

  const maiorVenda = Math.max(1, ...(data?.ranking ?? []).map((r) => r.total));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Força de vendas</h1>
          <p className="text-sm text-muted-foreground">
            Propostas em negociação, vendas do mês, recebimentos e o desempenho de cada representante.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="gap-2">
            <Link to="/pdv/vendas/representantes">
              <Briefcase className="h-4 w-4" /> Representantes
            </Link>
          </Button>
          <Button asChild className="gap-2">
            <Link to="/pdv/vendas/propostas/nova">
              <Plus className="h-4 w-4" /> Nova proposta
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="p-6 text-sm text-destructive">
          Não foi possível carregar o painel: {(error as Error).message}
        </Card>
      ) : null}

      {vazio && (
        <Card className="border-dashed p-5">
          <p className="font-medium">Comece por aqui</p>
          <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            <li>
              1. Cadastre os <Link to="/pdv/vendas/representantes" className="text-foreground underline">representantes</Link>{" "}
              com a comissão e o desconto máximo de cada um.
            </li>
            <li>
              2. Cadastre os <Link to="/pdv/vendas/clientes" className="text-foreground underline">clientes</Link> e
              distribua as carteiras; prepare o{" "}
              <Link to="/pdv/vendas/produtos" className="text-foreground underline">catálogo</Link> com fotos e preço de
              representante.
            </li>
            <li>
              3. Monte a primeira <Link to="/pdv/vendas/propostas/nova" className="text-foreground underline">proposta</Link>
              : aprovada pelo cliente, ela vira pedido e gera as contas a receber.
            </li>
          </ol>
        </Card>
      )}

      {/* Números principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading || !data ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] w-full rounded-lg" />)
        ) : (
          <>
            <Tile
              rotulo="Propostas abertas"
              valor={data.propostasAbertas.qtd.toLocaleString("pt-BR")}
              detalhe={
                data.propostasAbertas.qtd
                  ? `${formatBRL(data.propostasAbertas.valor)} · ${plural(data.propostasAbertas.enviadas, "enviada", "enviadas")}, ${plural(data.propostasAbertas.rascunhos, "rascunho", "rascunhos")}`
                  : "Nenhuma em negociação"
              }
              para="/pdv/vendas/propostas"
            />
            <Tile
              rotulo="Taxa de conversão · 90 dias"
              valor={data.conversao.taxa === null ? "·" : `${Math.round(data.conversao.taxa * 100)}%`}
              detalhe={
                data.conversao.respondidas
                  ? `${data.conversao.convertidas} de ${plural(data.conversao.respondidas, "proposta com desfecho", "propostas com desfecho")}`
                  : "Nenhuma proposta com desfecho ainda"
              }
            />
            <Tile
              rotulo={`Pedidos em ${mes}`}
              valor={formatBRL(data.pedidosMes.valor)}
              detalhe={plural(data.pedidosMes.qtd, "pedido", "pedidos")}
              para="/pdv/vendas/pedidos"
            />
            <Tile
              rotulo="Comissões pendentes"
              valor={formatBRL(data.comissoes.valor)}
              detalhe={data.comissoes.qtd ? `${plural(data.comissoes.qtd, "parcela recebida", "parcelas recebidas")} a comissionar` : "Nada a pagar agora"}
              para="/pdv/vendas/comissoes"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Contas a receber do módulo */}
        <Secao titulo="Contas a receber" icone={CalendarClock} acao={{ rotulo: "Ver todas", para: "/pdv/vendas/receber" }}>
          {isLoading || !data ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="grid gap-2">
              <div
                className={cn(
                  "rounded-md border p-3",
                  data.receber.vencidasQtd > 0 && "border-destructive/40 bg-destructive/5",
                )}
              >
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {data.receber.vencidasQtd > 0 && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                  Vencidas
                </p>
                <p className={cn("text-lg font-semibold tabular-nums", data.receber.vencidasQtd > 0 && "text-destructive")}>
                  {formatBRL(data.receber.vencidasValor)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.receber.vencidasQtd ? plural(data.receber.vencidasQtd, "parcela em atraso", "parcelas em atraso") : "Nenhuma parcela em atraso"}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">A vencer nos próximos 30 dias</p>
                <p className="text-lg font-semibold tabular-nums">{formatBRL(data.receber.aVencerValor)}</p>
                <p className="text-xs text-muted-foreground">
                  {data.receber.aVencerQtd ? plural(data.receber.aVencerQtd, "parcela", "parcelas") : "Nenhuma parcela no período"}
                </p>
              </div>
            </div>
          )}
        </Secao>

        {/* Ranking do mês */}
        <Secao
          titulo={`Ranking dos representantes · ${mes}`}
          icone={Briefcase}
          acao={{ rotulo: "Representantes", para: "/pdv/vendas/representantes" }}
          className="lg:col-span-2"
        >
          {isLoading || !data ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : data.ranking.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum pedido em {mes} ainda. O ranking aparece quando a primeira proposta virar pedido.
            </p>
          ) : (
            <ol className="space-y-3">
              {data.ranking.slice(0, 8).map((r, i) => (
                <li key={r.id ?? "direta"} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                  <span className="text-xs tabular-nums text-muted-foreground">{i + 1}º</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm">{r.nome}</p>
                    <div className="mt-1 h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${Math.max(2, (r.total / maiorVenda) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">{formatBRL(r.total)}</p>
                    <p className="text-xs text-muted-foreground">{plural(r.pedidos, "pedido", "pedidos")}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Secao>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Últimas propostas */}
        <Secao
          titulo="Últimas propostas"
          icone={FileSignature}
          acao={{ rotulo: "Ver todas", para: "/pdv/vendas/propostas" }}
          className="lg:col-span-2"
        >
          {isLoading || !data ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : data.ultimas.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Nenhuma proposta ainda.</p>
              <Button size="sm" asChild className="gap-2">
                <Link to="/pdv/vendas/propostas/nova">
                  <Plus className="h-4 w-4" /> Montar a primeira
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="-mx-2 divide-y">
              {data.ultimas.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/pdv/vendas/propostas/${p.id}`}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium">{p.number}</span>
                        <span className="text-muted-foreground"> · {p.cliente}</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {format(parseISO(p.created_at), "dd/MM/yyyy")}
                        {p.representante ? ` · ${p.representante}` : " · venda direta"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-medium tabular-nums">{formatBRL(p.total)}</span>
                      <Badge variant="outline" className={cn("border-transparent px-1.5 py-0 text-[11px] font-normal", STATUS_CLASSE[p.status])}>
                        {PROPOSTA_STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        {/* Agenda (componente da agenda: próximos compromissos com "Concluir" rápido) */}
        <ProximosCompromissos limit={6} />
      </div>

    </div>
  );
}
