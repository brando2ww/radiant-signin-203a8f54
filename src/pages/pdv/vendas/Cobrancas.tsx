import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Eye, Loader2, Receipt, RefreshCw, Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  estaVencida,
  useAtualizarCobrancas,
  useNomeEmpresa,
  useVendasCobrancas,
  type CobrancaLinha,
  type CobrancaSituacao,
} from "@/hooks/use-vendas-cobrancas";
import { mensagemDeErro, temCobrancaAtiva, useVendasAsaas } from "@/hooks/use-vendas-financeiro";
import { AsaasAviso } from "@/components/vendas/cobrancas/AsaasAviso";
import { GerarCobrancaDialog, nomeCliente } from "@/components/vendas/cobrancas/GerarCobrancaDialog";
import { CobrancaDetalheDialog } from "@/components/vendas/cobrancas/CobrancaDetalheDialog";
import { SituacaoCobrancaBadge } from "@/components/vendas/financeiro/SituacaoCobrancaBadge";
import { dataBR, documentoBR } from "@/components/vendas/financeiro/fin-utils";

const SITUACOES: { valor: CobrancaSituacao; rotulo: string }[] = [
  { valor: "abertas", rotulo: "Em aberto" },
  { valor: "vencidas", rotulo: "Vencidas" },
  { valor: "recebidas", rotulo: "Recebidas" },
  { valor: "todas", rotulo: "Todas" },
];

function temAlgoParaMostrar(l: CobrancaLinha) {
  return !!(l.asaas_payment_id || l.charge_url || l.bank_slip_url || l.pix_payload);
}

function podeCobrar(l: CobrancaLinha) {
  return (l.status === "pending" || l.status === "overdue") && !temCobrancaAtiva(l);
}

function SituacaoParcela({ l }: { l: CobrancaLinha }) {
  if (l.status === "paid") return <Badge className="border-transparent bg-emerald-600 text-white">Recebida</Badge>;
  if (l.status === "cancelled") return <Badge variant="secondary">Cancelada</Badge>;
  if (estaVencida(l)) return <Badge variant="destructive">Vencida</Badge>;
  return <Badge variant="outline">Em aberto</Badge>;
}

export default function Cobrancas() {
  const [situacao, setSituacao] = useState<CobrancaSituacao>("abertas");
  const [somenteVendas, setSomenteVendas] = useState(true);
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [gerarAberto, setGerarAberto] = useState(false);
  const [gerarLinhas, setGerarLinhas] = useState<CobrancaLinha[]>([]);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const { asaas, conectado, isLoading: carregandoAsaas } = useVendasAsaas();
  const { data: nomeEmpresa } = useNomeEmpresa();
  const { data = [], isLoading, error } = useVendasCobrancas({ situacao, somenteVendas });
  const atualizar = useAtualizarCobrancas();

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return data;
    const dig = termo.replace(/\D/g, "");
    return data.filter((l) => {
      const c = l.pdv_customers;
      const texto = [c?.name, c?.trade_name, c?.company_name, l.description, l.document_number].join(" ").toLowerCase();
      const doc = `${c?.cnpj || ""}${c?.cpf || ""}`.replace(/\D/g, "");
      return texto.includes(termo) || (dig.length >= 3 && doc.includes(dig));
    });
  }, [data, busca]);

  const resumo = useMemo(() => {
    const r = { aberto: 0, nAberto: 0, vencido: 0, nVencido: 0, comCobranca: 0, semCobranca: 0 };
    for (const l of lista) {
      const aberta = l.status === "pending" || l.status === "overdue";
      if (!aberta) continue;
      r.aberto += Number(l.amount || 0);
      r.nAberto++;
      if (estaVencida(l)) {
        r.vencido += Number(l.amount || 0);
        r.nVencido++;
      }
      if (temCobrancaAtiva(l)) r.comCobranca++;
      else r.semCobranca++;
    }
    return r;
  }, [lista]);

  const selecionaveis = useMemo(() => lista.filter(podeCobrar), [lista]);
  const selecionadas = useMemo(() => lista.filter((l) => selecao.has(l.id)), [lista, selecao]);
  const totalSelecionado = selecionadas.reduce((s, l) => s + Number(l.amount || 0), 0);
  const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every((l) => selecao.has(l.id));
  const comCobrancaNaLista = useMemo(() => lista.filter((l) => !!l.asaas_payment_id).map((l) => l.id), [lista]);
  const detalhe = detalheId ? data.find((l) => l.id === detalheId) ?? null : null;

  const alternar = (id: string, marcado: boolean) =>
    setSelecao((s) => {
      const n = new Set(s);
      if (marcado) n.add(id);
      else n.delete(id);
      return n;
    });

  const marcarTodas = (marcado: boolean) => setSelecao(marcado ? new Set(selecionaveis.map((l) => l.id)) : new Set());

  const abrirGerar = (linhas: CobrancaLinha[]) => {
    if (!conectado) {
      toast.error("Conecte o Asaas da empresa antes de gerar cobranças.");
      return;
    }
    setGerarLinhas(linhas);
    setGerarAberto(true);
  };

  const atualizarTudo = async () => {
    try {
      await atualizar.mutateAsync(comCobrancaNaLista.length ? comCobrancaNaLista : undefined);
      toast.success("Situação das cobranças atualizada com o Asaas");
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não consegui atualizar as cobranças."));
    }
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cobranças</h1>
          <p className="text-sm text-muted-foreground">
            Gere boleto, PIX ou link de cartão pelo Asaas para as parcelas em aberto e mande para o cliente.
          </p>
        </div>
        {conectado && (
          <Button variant="outline" onClick={atualizarTudo} disabled={atualizar.isPending} className="shrink-0">
            {atualizar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar situação
          </Button>
        )}
      </div>

      {!carregandoAsaas && !conectado && <AsaasAviso asaas={asaas} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumo rotulo="Em aberto" valor={formatBRL(resumo.aberto)} detalhe={`${resumo.nAberto} ${resumo.nAberto === 1 ? "parcela" : "parcelas"}`} />
        <Resumo rotulo="Vencido" valor={formatBRL(resumo.vencido)} detalhe={`${resumo.nVencido} ${resumo.nVencido === 1 ? "parcela" : "parcelas"}`} destaque={resumo.nVencido > 0} />
        <Resumo rotulo="Com cobrança" valor={String(resumo.comCobranca)} detalhe="no Asaas, em aberto" />
        <Resumo rotulo="Sem cobrança" valor={String(resumo.semCobranca)} detalhe="ainda não cobradas" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={situacao} onValueChange={(v) => { setSituacao(v as CobrancaSituacao); setSelecao(new Set()); }}>
          <TabsList className="grid w-full grid-cols-4 sm:inline-flex sm:w-auto">
            {SITUACOES.map((s) => (
              <TabsTrigger key={s.valor} value={s.valor} className="px-2 sm:px-3">
                {s.rotulo}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, CNPJ ou pedido" className="pl-8" />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="somente-vendas"
              checked={somenteVendas}
              onCheckedChange={(v) => { setSomenteVendas(v); setSelecao(new Set()); }}
            />
            <Label htmlFor="somente-vendas" className="cursor-pointer text-sm font-normal">
              Só pedidos da Força de vendas
            </Label>
          </div>
        </div>
      </div>

      {error ? (
        <Card className="p-6 text-sm text-destructive">Não consegui carregar as contas a receber: {mensagemDeErro(error)}</Card>
      ) : isLoading ? (
        <Card className="space-y-3 p-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </Card>
      ) : lista.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <Receipt className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhuma parcela {situacao === "recebidas" ? "recebida" : situacao === "vencidas" ? "vencida" : "em aberto"} aqui</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {somenteVendas
              ? "As parcelas nascem quando uma proposta vira pedido. Desligue o filtro para ver também as outras contas a receber."
              : "Lance contas a receber no financeiro ou converta uma proposta em pedido."}
          </p>
        </Card>
      ) : (
        <>
          {/* Computador: tabela */}
          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={todasMarcadas}
                      onCheckedChange={(v) => marcarTodas(!!v)}
                      disabled={selecionaveis.length === 0}
                      aria-label="Marcar todas"
                    />
                  </TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Cobrança</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((l) => {
                  const cobravel = podeCobrar(l);
                  const doc = l.pdv_customers?.cnpj || l.pdv_customers?.cpf;
                  return (
                    <TableRow key={l.id} className={cn(estaVencida(l) && "bg-destructive/5", selecao.has(l.id) && "bg-primary/5")}>
                      <TableCell>
                        <Checkbox
                          checked={selecao.has(l.id)}
                          onCheckedChange={(v) => alternar(l.id, !!v)}
                          disabled={!cobravel}
                          aria-label="Selecionar parcela"
                        />
                      </TableCell>
                      <TableCell className="max-w-[16rem]">
                        <p className="truncate font-medium">{nomeCliente(l)}</p>
                        {doc && <p className="text-xs text-muted-foreground">{documentoBR(doc)}</p>}
                      </TableCell>
                      <TableCell className="max-w-[16rem]">
                        <p className="truncate text-sm">{l.description}</p>
                        {l.vendas_pedido_id && (
                          <Link to={`/pdv/vendas/pedidos/${l.vendas_pedido_id}`} className="text-xs text-primary hover:underline">
                            Ver pedido
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className={cn("whitespace-nowrap", estaVencida(l) && "font-medium text-destructive")}>
                        {dataBR(l.due_date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatBRL(l.amount)}</TableCell>
                      <TableCell><SituacaoParcela l={l} /></TableCell>
                      <TableCell><SituacaoCobrancaBadge status={l.asaas_status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {temAlgoParaMostrar(l) && (
                            <Button size="sm" variant="ghost" onClick={() => setDetalheId(l.id)}>
                              <Eye className="mr-1.5 h-3.5 w-3.5" /> Ver
                            </Button>
                          )}
                          {cobravel && (
                            <Button size="sm" variant="outline" onClick={() => abrirGerar([l])} disabled={!conectado}>
                              Cobrar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Celular: cartões */}
          <div className="space-y-2 md:hidden">
            {selecionaveis.length > 0 && (
              <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                <Checkbox checked={todasMarcadas} onCheckedChange={(v) => marcarTodas(!!v)} /> Marcar todas que podem ser cobradas
              </label>
            )}
            {lista.map((l) => {
              const cobravel = podeCobrar(l);
              return (
                <Card key={l.id} className={cn("p-3", estaVencida(l) && "border-destructive/40", selecao.has(l.id) && "border-primary")}>
                  <div className="flex gap-3">
                    <Checkbox
                      className="mt-1"
                      checked={selecao.has(l.id)}
                      onCheckedChange={(v) => alternar(l.id, !!v)}
                      disabled={!cobravel}
                      aria-label="Selecionar parcela"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate font-medium">{nomeCliente(l)}</p>
                        <p className="shrink-0 font-semibold tabular-nums">{formatBRL(l.amount)}</p>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{l.description}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={cn(estaVencida(l) && "font-medium text-destructive")}>Vence {dataBR(l.due_date)}</span>
                        <SituacaoParcela l={l} />
                        <SituacaoCobrancaBadge status={l.asaas_status} />
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {temAlgoParaMostrar(l) && (
                          <Button size="sm" variant="outline" onClick={() => setDetalheId(l.id)}>
                            <Eye className="mr-1.5 h-3.5 w-3.5" /> Ver cobrança
                          </Button>
                        )}
                        {cobravel && (
                          <Button size="sm" variant="outline" onClick={() => abrirGerar([l])} disabled={!conectado}>
                            Cobrar
                          </Button>
                        )}
                        {l.vendas_pedido_id && (
                          <Button size="sm" variant="ghost" asChild>
                            <Link to={`/pdv/vendas/pedidos/${l.vendas_pedido_id}`}>Ver pedido</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <p className="text-right text-sm text-muted-foreground">
            {lista.length} {lista.length === 1 ? "parcela" : "parcelas"} · {formatBRL(lista.reduce((s, l) => s + Number(l.amount || 0), 0))}
          </p>
        </>
      )}

      {selecionadas.length > 0 && (
        <div className="sticky bottom-0 z-30 -mx-4 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold">{selecionadas.length}</span> {selecionadas.length === 1 ? "parcela" : "parcelas"} ·{" "}
              <span className="font-semibold tabular-nums">{formatBRL(totalSelecionado)}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelecao(new Set())}>
                <X className="mr-1 h-4 w-4" /> Limpar
              </Button>
              <Button size="sm" onClick={() => abrirGerar(selecionadas)} disabled={!conectado}>
                Gerar cobrança
              </Button>
            </div>
          </div>
        </div>
      )}

      <GerarCobrancaDialog
        open={gerarAberto}
        onOpenChange={setGerarAberto}
        linhas={gerarLinhas}
        onConcluido={() => setSelecao(new Set())}
      />
      <CobrancaDetalheDialog linha={detalhe} nomeEmpresa={nomeEmpresa} onOpenChange={(v) => !v && setDetalheId(null)} />
    </div>
  );
}

function Resumo({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe: string; destaque?: boolean }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={cn("truncate text-lg font-semibold tabular-nums sm:text-xl", destaque && "text-destructive")}>{valor}</p>
      <p className="truncate text-xs text-muted-foreground">{detalhe}</p>
    </Card>
  );
}
