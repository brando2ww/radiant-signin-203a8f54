import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Search, ShoppingBag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import type { PedidoStatus } from "@/lib/vendas/types";
import { useRepresentantesDaEmpresa } from "@/hooks/use-vendas-propostas";
import { useVendasPedidos, type PedidoLinha } from "@/hooks/use-vendas-pedidos";
import { dataBR, formatarPercent, nomeCliente, num, rotuloForma } from "@/components/vendas/propostas/calculos";
import type { ModoVendas } from "@/components/vendas/propostas/PropostaEditor";
import { PedidoStatusBadge } from "./PedidoStatusBadge";
import { useRepContextOptional } from "@/components/vendas/rep/RepContext";

type Filtro = "todos" | PedidoStatus;
const FILTROS: { k: Filtro; rotulo: string }[] = [
  { k: "todos", rotulo: "Todos" },
  { k: "confirmed", rotulo: "Confirmado" },
  { k: "invoiced", rotulo: "Faturado" },
  { k: "delivered", rotulo: "Entregue" },
  { k: "cancelled", rotulo: "Cancelado" },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums sm:text-xl">{valor}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground">{detalhe}</p>}
    </Card>
  );
}

export function PedidosLista({ mode }: { mode: ModoVendas }) {
  const navigate = useNavigate();
  const { data: todos = [], isLoading } = useVendasPedidos();
  // Dono pré-visualizando o app do representante: só os do representante escolhido.
  const repCtx = useRepContextOptional();
  const filtrarRep = mode === "representante" && repCtx?.isPreview && repCtx.repId ? repCtx.repId : null;
  const pedidos = useMemo(
    () => (filtrarRep ? todos.filter((p) => p.representative_id === filtrarRep) : todos),
    [todos, filtrarRep],
  );
  const { data: reps = [] } = useRepresentantesDaEmpresa(mode === "gestao");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [rep, setRep] = useState("todos");
  const gestao = mode === "gestao";
  const caminho = (p: PedidoLinha) => (gestao ? `/pdv/vendas/pedidos/${p.id}` : `/representante/pedidos?id=${p.id}`);

  const base1 = useMemo(() => {
    const q = semAcento(busca.trim());
    return pedidos.filter((p) => {
      if (gestao && rep !== "todos") {
        if (rep === "nenhum" ? p.representative_id : p.representative_id !== rep) return false;
      }
      if (!q) return true;
      return semAcento(
        [p.number, p.customer?.name, p.customer?.trade_name, p.customer?.company_name, p.customer?.city].filter(Boolean).join(" "),
      ).includes(q);
    });
  }, [pedidos, busca, rep, gestao]);

  const contagem = useMemo(() => {
    const m = new Map<Filtro, number>();
    for (const f of FILTROS) m.set(f.k, f.k === "todos" ? base1.length : base1.filter((p) => p.status === f.k).length);
    return m;
  }, [base1]);

  const visiveis = filtro === "todos" ? base1 : base1.filter((p) => p.status === filtro);
  const totalVisivel = visiveis.filter((p) => p.status !== "cancelled").reduce((s, p) => s + num(p.total), 0);

  const ind = useMemo(() => {
    const validos = base1.filter((p) => p.status !== "cancelled");
    const soma = (arr: PedidoLinha[]) => arr.reduce((s, p) => s + num(p.total), 0);
    const aFaturar = validos.filter((p) => p.status === "confirmed");
    const aEntregar = validos.filter((p) => p.status === "confirmed" || p.status === "invoiced");
    const comissao = validos.reduce((s, p) => s + (p.representative_id ? (num(p.total) * num(p.commission_percent)) / 100 : 0), 0);
    return {
      vendido: soma(validos),
      quantos: validos.length,
      aFaturar: aFaturar.length,
      aFaturarValor: soma(aFaturar),
      aEntregar: aEntregar.length,
      comissao,
    };
  }, [base1]);

  return (
    <div className={cn("mx-auto w-full space-y-4 px-4 py-4 sm:py-6", gestao ? "max-w-7xl lg:px-6" : "max-w-3xl")}>
      <div>
        <h1 className={cn("font-bold tracking-tight", gestao ? "text-3xl" : "text-2xl")}>{gestao ? "Pedidos" : "Meus pedidos"}</h1>
        <p className="text-sm text-muted-foreground">
          {gestao
            ? "Propostas aprovadas viram pedido e geram as parcelas no contas a receber."
            : "Pedidos dos seus clientes. O faturamento e a entrega são marcados pela empresa."}
        </p>
      </div>

      <div className={cn("grid grid-cols-2 gap-3", gestao && "lg:grid-cols-4")}>
        <Indicador rotulo="Vendido" valor={formatBRL(ind.vendido)} detalhe={`${ind.quantos} ${ind.quantos === 1 ? "pedido" : "pedidos"}`} />
        <Indicador rotulo="A faturar" valor={formatBRL(ind.aFaturarValor)} detalhe={`${ind.aFaturar} ${ind.aFaturar === 1 ? "pedido" : "pedidos"}`} />
        <Indicador rotulo="A entregar" valor={String(ind.aEntregar)} />
        <Indicador rotulo={gestao ? "Comissão prevista" : "Minha comissão prevista"} valor={formatBRL(ind.comissao)} detalhe="sobre o total, paga no recebimento" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número ou cliente" className="pl-9" />
        </div>
        {gestao && (
          <Select value={rep} onValueChange={setRep}>
            <SelectTrigger className="sm:w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os representantes</SelectItem>
              <SelectItem value="nenhum">Venda direta</SelectItem>
              {reps.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className={cn(gestao && "-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0")}>
        <div className={cn("flex gap-1.5", gestao ? "w-max sm:w-auto sm:flex-wrap" : "flex-wrap")}>
          {FILTROS.map((f) => (
            <button
              key={f.k}
              type="button"
              onClick={() => setFiltro(f.k)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filtro === f.k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {f.rotulo}
              <span className={cn("ml-1.5 tabular-nums", filtro === f.k ? "opacity-80" : "text-muted-foreground")}>
                {contagem.get(f.k) ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visiveis.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <ShoppingBag className="mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="font-medium">{pedidos.length === 0 ? "Nenhum pedido ainda" : "Nada com esse filtro"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pedidos.length === 0 ? "Quando o cliente aprovar uma proposta, o pedido aparece aqui." : "Troque a situação ou a busca."}
          </p>
        </Card>
      ) : (
        <>
          {gestao && (
            <Card className="hidden overflow-hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Representante</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(caminho(p))}>
                      <TableCell className="font-mono text-xs font-medium">{p.number}</TableCell>
                      <TableCell>
                        <p className="font-medium leading-tight">{nomeCliente(p.customer)}</p>
                        {p.customer?.city && <p className="text-xs text-muted-foreground">{p.customer.city}</p>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.rep?.name ? (
                          <>
                            {p.rep.name}
                            <span className="ml-1 text-xs text-muted-foreground">{formatarPercent(p.commission_percent)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Venda direta</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{dataBR(p.confirmed_at)}</TableCell>
                      <TableCell className="text-sm">
                        {rotuloForma(p.payment_method)}
                        {p.installments > 1 ? ` · ${p.installments}x` : ""}
                      </TableCell>
                      <TableCell>
                        <PedidoStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className={cn("text-right font-semibold tabular-nums", p.status === "cancelled" && "text-muted-foreground line-through")}>
                        {formatBRL(p.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm">
                      {visiveis.length} {visiveis.length === 1 ? "pedido" : "pedidos"} (total sem os cancelados)
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatBRL(totalVisivel)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </Card>
          )}

          <div className={cn("space-y-2", gestao && "md:hidden")}>
            {visiveis.map((p) => (
              <Link key={p.id} to={caminho(p)} className="block">
                <Card className="p-3 transition-colors hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-tight">{nomeCliente(p.customer)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="font-mono">{p.number}</span> · {dataBR(p.confirmed_at)}
                        {gestao && p.rep?.name ? ` · ${p.rep.name}` : ""}
                      </p>
                    </div>
                    <p className={cn("shrink-0 font-semibold tabular-nums", p.status === "cancelled" && "text-muted-foreground line-through")}>
                      {formatBRL(p.total)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <PedidoStatusBadge status={p.status} />
                    <span>
                      {rotuloForma(p.payment_method)}
                      {p.installments > 1 ? ` · ${p.installments}x` : ""}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
            <p className="px-1 pt-1 text-xs text-muted-foreground">
              {visiveis.length} {visiveis.length === 1 ? "pedido" : "pedidos"} · {formatBRL(totalVisivel)} sem os cancelados
            </p>
          </div>
        </>
      )}
    </div>
  );
}
