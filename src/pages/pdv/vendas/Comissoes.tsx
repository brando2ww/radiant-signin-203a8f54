import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { startOfMonth } from "date-fns";
import { BadgePercent, CheckCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  nomeClienteComissao,
  useRepresentantesLista,
  useVendasComissoes,
  type ComissaoLinha,
} from "@/hooks/use-vendas-comissoes";
import { mensagemDeErro } from "@/hooks/use-vendas-financeiro";
import { PeriodoMes, intervaloDoPeriodo, rotuloDoPeriodo, type PeriodoValor } from "@/components/vendas/comissoes/PeriodoMes";
import { PagarComissoesDialog } from "@/components/vendas/comissoes/PagarComissoesDialog";
import { dataBR } from "@/components/vendas/financeiro/fin-utils";

type Filtro = "pending" | "paid" | "cancelled" | "todas";

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "pending", rotulo: "A pagar" },
  { valor: "paid", rotulo: "Pagas" },
  { valor: "cancelled", rotulo: "Canceladas" },
  { valor: "todas", rotulo: "Todas" },
];

function SituacaoComissao({ c }: { c: ComissaoLinha }) {
  if (c.status === "paid")
    return (
      <span className="inline-flex flex-col items-start">
        <Badge className="border-transparent bg-emerald-600 text-white">Paga</Badge>
        {c.paid_at && <span className="mt-0.5 text-[11px] text-muted-foreground">em {dataBR(c.paid_at)}</span>}
      </span>
    );
  if (c.status === "cancelled") return <Badge variant="secondary">Cancelada</Badge>;
  return <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">A pagar</Badge>;
}

export default function Comissoes() {
  const [periodo, setPeriodo] = useState<PeriodoValor>({ mes: startOfMonth(new Date()) });
  const [repId, setRepId] = useState<string>("todos");
  const [filtro, setFiltro] = useState<Filtro>("pending");
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [pagarAberto, setPagarAberto] = useState(false);

  const intervalo = intervaloDoPeriodo(periodo);
  const { data = [], isLoading, error } = useVendasComissoes(intervalo);
  const { data: reps = [] } = useRepresentantesLista();

  const doRep = useMemo(() => (repId === "todos" ? data : data.filter((c) => c.representative_id === repId)), [data, repId]);
  const lista = useMemo(() => (filtro === "todas" ? doRep : doRep.filter((c) => c.status === filtro)), [doRep, filtro]);

  const totais = useMemo(() => {
    const t = { pendente: 0, nPendente: 0, pago: 0, nPago: 0, base: 0 };
    for (const c of doRep) {
      if (c.status === "cancelled") continue;
      t.base += Number(c.base_amount || 0);
      if (c.status === "pending") {
        t.pendente += Number(c.amount || 0);
        t.nPendente++;
      } else {
        t.pago += Number(c.amount || 0);
        t.nPago++;
      }
    }
    return t;
  }, [doRep]);

  const porRep = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; base: number; pendente: number; pago: number }>();
    for (const c of doRep) {
      if (c.status === "cancelled") continue;
      const r = m.get(c.representative_id) ?? { id: c.representative_id, nome: c.vendas_representantes?.name || "Representante", base: 0, pendente: 0, pago: 0 };
      r.base += Number(c.base_amount || 0);
      if (c.status === "pending") r.pendente += Number(c.amount || 0);
      else r.pago += Number(c.amount || 0);
      m.set(c.representative_id, r);
    }
    return [...m.values()].sort((a, b) => b.pendente + b.pago - (a.pendente + a.pago));
  }, [doRep]);

  const pendentesNaLista = useMemo(() => lista.filter((c) => c.status === "pending"), [lista]);
  const selecionadas = useMemo(() => lista.filter((c) => selecao.has(c.id) && c.status === "pending"), [lista, selecao]);
  const totalSelecionado = selecionadas.reduce((s, c) => s + Number(c.amount || 0), 0);
  const todasMarcadas = pendentesNaLista.length > 0 && pendentesNaLista.every((c) => selecao.has(c.id));

  const alternar = (id: string, v: boolean) =>
    setSelecao((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  const marcarTodas = (v: boolean) => setSelecao(v ? new Set(pendentesNaLista.map((c) => c.id)) : new Set());
  const limpar = () => setSelecao(new Set());

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Comissões</h1>
        <p className="text-sm text-muted-foreground">
          A comissão nasce quando o cliente paga a parcela do pedido. Escolha as que vai pagar e marque como pagas: o
          pagamento entra no contas a pagar.
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <PeriodoMes valor={periodo} onChange={(v) => { setPeriodo(v); limpar(); }} />
        <Select value={repId} onValueChange={(v) => { setRepId(v); limpar(); }}>
          <SelectTrigger className="w-full md:w-64">
            <SelectValue placeholder="Representante" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os representantes</SelectItem>
            {reps.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
                {!r.is_active ? " (inativo)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">A pagar</p>
          <p className="truncate text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-300 sm:text-xl">{formatBRL(totais.pendente)}</p>
          <p className="text-xs text-muted-foreground">{totais.nPendente} {totais.nPendente === 1 ? "comissão" : "comissões"}</p>
        </Card>
        <Card className="p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">Pago</p>
          <p className="truncate text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300 sm:text-xl">{formatBRL(totais.pago)}</p>
          <p className="text-xs text-muted-foreground">{totais.nPago} {totais.nPago === 1 ? "comissão" : "comissões"}</p>
        </Card>
        <Card className="col-span-2 p-3 sm:p-4 lg:col-span-1">
          <p className="text-xs text-muted-foreground">Recebido dos clientes</p>
          <p className="truncate text-lg font-semibold tabular-nums sm:text-xl">{formatBRL(totais.base)}</p>
          <p className="text-xs text-muted-foreground">base das comissões · {rotuloDoPeriodo(periodo).toLowerCase()}</p>
        </Card>
      </div>

      {porRep.length > 1 && repId === "todos" && (
        <Card className="overflow-hidden">
          <div className="border-b px-4 py-3 text-sm font-medium">Por representante</div>
          <div className="divide-y">
            {porRep.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setRepId(r.id); limpar(); }}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/50"
              >
                <span className="min-w-0 truncate font-medium">{r.nome}</span>
                <span className="flex shrink-0 gap-4 tabular-nums">
                  <span className="hidden text-muted-foreground sm:inline">base {formatBRL(r.base)}</span>
                  <span className="text-amber-700 dark:text-amber-300">{formatBRL(r.pendente)}</span>
                  <span className="text-emerald-700 dark:text-emerald-300">{formatBRL(r.pago)}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Tabs value={filtro} onValueChange={(v) => { setFiltro(v as Filtro); limpar(); }}>
        <TabsList className="grid w-full grid-cols-4 sm:inline-flex sm:w-auto">
          {FILTROS.map((f) => (
            <TabsTrigger key={f.valor} value={f.valor} className="px-2 sm:px-3">
              {f.rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error ? (
        <Card className="p-6 text-sm text-destructive">Não consegui carregar as comissões: {mensagemDeErro(error)}</Card>
      ) : isLoading ? (
        <Card className="space-y-3 p-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </Card>
      ) : lista.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <BadgePercent className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhuma comissão {filtro === "pending" ? "a pagar" : filtro === "paid" ? "paga" : filtro === "cancelled" ? "cancelada" : ""} em {rotuloDoPeriodo(periodo).toLowerCase()}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            A comissão aparece aqui quando uma parcela de pedido com representante é recebida no contas a receber.
          </p>
        </Card>
      ) : (
        <>
          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={todasMarcadas} onCheckedChange={(v) => marcarTodas(!!v)} disabled={pendentesNaLista.length === 0} aria-label="Marcar todas" />
                  </TableHead>
                  <TableHead>Recebido em</TableHead>
                  <TableHead>Representante</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((c) => (
                  <TableRow key={c.id} className={cn(selecao.has(c.id) && "bg-primary/5")}>
                    <TableCell>
                      <Checkbox
                        checked={selecao.has(c.id)}
                        onCheckedChange={(v) => alternar(c.id, !!v)}
                        disabled={c.status !== "pending"}
                        aria-label="Selecionar comissão"
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{dataBR(c.received_at)}</TableCell>
                    <TableCell className="max-w-[12rem] truncate">{c.vendas_representantes?.name}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.vendas_pedidos ? (
                        <Link to={`/pdv/vendas/pedidos/${c.vendas_pedidos.id}`} className="text-primary hover:underline">
                          {c.vendas_pedidos.number}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">·</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate">{nomeClienteComissao(c)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(c.base_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(c.percent).toLocaleString("pt-BR")}%</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatBRL(c.amount)}</TableCell>
                    <TableCell><SituacaoComissao c={c} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="text-sm font-normal text-muted-foreground">
                    {lista.length} {lista.length === 1 ? "comissão" : "comissões"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(lista.reduce((s, c) => s + Number(c.base_amount || 0), 0))}</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{formatBRL(lista.reduce((s, c) => s + Number(c.amount || 0), 0))}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </Card>

          <div className="space-y-2 md:hidden">
            {pendentesNaLista.length > 0 && (
              <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                <Checkbox checked={todasMarcadas} onCheckedChange={(v) => marcarTodas(!!v)} /> Marcar todas a pagar
              </label>
            )}
            {lista.map((c) => (
              <Card key={c.id} className={cn("p-3", selecao.has(c.id) && "border-primary")}>
                <div className="flex gap-3">
                  <Checkbox
                    className="mt-1"
                    checked={selecao.has(c.id)}
                    onCheckedChange={(v) => alternar(c.id, !!v)}
                    disabled={c.status !== "pending"}
                    aria-label="Selecionar comissão"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate font-medium">{nomeClienteComissao(c)}</p>
                      <p className="shrink-0 font-semibold tabular-nums">{formatBRL(c.amount)}</p>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.vendas_representantes?.name} · {c.vendas_pedidos?.number}
                    </p>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {Number(c.percent).toLocaleString("pt-BR")}% de {formatBRL(c.base_amount)}
                        <span className="block">recebido {dataBR(c.received_at)}</span>
                      </span>
                      <SituacaoComissao c={c} />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {selecionadas.length > 0 && (
        <div className="sticky bottom-0 z-30 -mx-4 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold">{selecionadas.length}</span> {selecionadas.length === 1 ? "comissão" : "comissões"} ·{" "}
              <span className="font-semibold tabular-nums">{formatBRL(totalSelecionado)}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={limpar}>
                <X className="mr-1 h-4 w-4" /> Limpar
              </Button>
              <Button size="sm" onClick={() => setPagarAberto(true)}>
                <CheckCheck className="mr-1.5 h-4 w-4" /> Marcar como paga
              </Button>
            </div>
          </div>
        </div>
      )}

      <PagarComissoesDialog open={pagarAberto} onOpenChange={setPagarAberto} comissoes={selecionadas} onPago={limpar} />
    </div>
  );
}
