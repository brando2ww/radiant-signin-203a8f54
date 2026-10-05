import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Ban, CheckCircle2, ExternalLink, FileDown, FileText, ImageOff, Loader2, Receipt, Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import type { PedidoStatus } from "@/lib/vendas/types";
import {
  cancelarPedido, entregarPedido, faturarPedido, SITUACAO_PARCELA, useInvalidarPedidos, useVendasPedido,
} from "@/hooks/use-vendas-pedidos";
import {
  calcularParcelas, dataBR, dataHoraBR, descreverPagamento, enderecoCliente, formatarDocumento, formatarPercent,
  formatarQtd, hojeISO, nomeCliente, num,
} from "@/components/vendas/propostas/calculos";
import { mensagemDeErro, type ModoVendas } from "@/components/vendas/propostas/PropostaEditor";
import { PedidoStatusBadge } from "./PedidoStatusBadge";

const ESTILO_PARCELA: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200",
  overdue: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-200",
  cancelled: "bg-zinc-100 text-zinc-500 border-zinc-200 line-through dark:bg-zinc-800 dark:text-zinc-400",
};

function Etapa({ feito, rotulo, quando }: { feito: boolean; rotulo: string; quando?: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          feito ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/30",
        )}
      >
        {feito && <CheckCircle2 className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0">
        <p className={cn("text-sm font-medium leading-6", !feito && "text-muted-foreground")}>{rotulo}</p>
        {quando && <p className="text-[11px] text-muted-foreground">{quando}</p>}
      </div>
    </div>
  );
}

/**
 * Pedido de venda: itens, cliente, representante, comissão, parcelas no contas a receber e o andamento
 * (faturar, entregar, cancelar). No modo representante é só leitura.
 */
export function PedidoDetalheView({ id, mode, voltar }: { id: string; mode: ModoVendas; voltar?: string }) {
  const { data, isLoading, refetch } = useVendasPedido(id);
  const invalidar = useInvalidarPedidos();
  const [acao, setAcao] = useState<null | "faturar" | "entregar" | "cancelar" | "pdf">(null);
  const [confirmar, setConfirmar] = useState<null | "faturar" | "entregar">(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const gestao = mode === "gestao";

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-medium">Pedido não encontrado</p>
        {voltar && (
          <Button asChild variant="outline" className="mt-4">
            <Link to={voltar}>Voltar aos pedidos</Link>
          </Button>
        )}
      </div>
    );
  }

  const { pedido, itens, parcelas } = data;
  const status = pedido.status as PedidoStatus;
  const cliente = pedido.customer;
  const hoje = hojeISO();
  const comissaoPrevista = pedido.representative_id ? (num(pedido.total) * num(pedido.commission_percent)) / 100 : 0;
  const recebido = parcelas.filter((p) => p.status === "paid").reduce((s, p) => s + num(p.amount), 0);
  const cobrancasAbertas = parcelas.filter((p) => p.asaas_payment_id && (p.status === "pending" || p.status === "overdue"));
  const previstas = calcularParcelas({
    total: num(pedido.total),
    parcelas: pedido.installments,
    primeiroVencimentoDias: pedido.first_due_days,
    intervaloDias: pedido.interval_days,
    base: new Date(pedido.confirmed_at),
  });
  const temItemDesconto = itens.some((i) => num(i.discount_percent) > 0);
  const caminhoCliente = gestao ? `/pdv/vendas/clientes/${pedido.customer_id}` : `/representante/clientes/${pedido.customer_id}`;
  const caminhoProposta = pedido.proposta
    ? `${gestao ? "/pdv/vendas" : "/representante"}/propostas/${pedido.proposta.id}`
    : null;

  const executar = async (nome: NonNullable<typeof acao>, fn: () => Promise<void>, ok?: string) => {
    setAcao(nome);
    try {
      await fn();
      invalidar(id);
      await refetch();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setAcao(null);
    }
  };

  const pdf = async () => {
    setAcao("pdf");
    try {
      const { gerarPdfPedido } = await import("@/lib/vendas/documento-pdf");
      await gerarPdfPedido(id);
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setAcao(null);
    }
  };

  const ocupado = acao !== null;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="space-y-3">
        {voltar && (
          <Link to={voltar} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Pedidos
          </Link>
        )}
        <div className={cn("flex flex-col gap-3", gestao && "lg:flex-row lg:items-center lg:justify-between")}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{pedido.number}</h1>
              <PedidoStatusBadge status={status} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {nomeCliente(cliente)} · {formatBRL(pedido.total)}
              {pedido.proposta && (
                <>
                  {" · da proposta "}
                  {caminhoProposta ? (
                    <Link to={caminhoProposta} className="font-mono underline-offset-2 hover:underline">
                      {pedido.proposta.number}
                    </Link>
                  ) : (
                    pedido.proposta.number
                  )}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {gestao && status === "confirmed" && (
              <Button onClick={() => setConfirmar("faturar")} disabled={ocupado}>
                {acao === "faturar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                Faturar
              </Button>
            )}
            {gestao && (status === "confirmed" || status === "invoiced") && (
              <Button variant={status === "invoiced" ? "default" : "outline"} onClick={() => setConfirmar("entregar")} disabled={ocupado}>
                {acao === "entregar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                Marcar entregue
              </Button>
            )}
            <Button variant="outline" className={cn(!gestao && "w-full")} onClick={pdf} disabled={ocupado}>
              {acao === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              PDF do pedido
            </Button>
            {gestao && status !== "cancelled" && (
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setCancelando(true)}
                disabled={ocupado}
              >
                <Ban className="mr-2 h-4 w-4" /> Cancelar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Andamento */}
      {status === "cancelled" ? (
        <Card className="border-rose-200 bg-rose-50/60 p-4 text-sm dark:border-rose-900 dark:bg-rose-950/30">
          <p className="font-medium text-rose-700 dark:text-rose-300">Pedido cancelado em {dataHoraBR(pedido.cancelled_at)}</p>
          {pedido.cancel_reason && <p className="mt-0.5 text-muted-foreground">Motivo: “{pedido.cancel_reason}”</p>}
          <p className="mt-0.5 text-xs text-muted-foreground">As parcelas que não tinham sido recebidas foram canceladas.</p>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-2">
            <Etapa feito rotulo="Confirmado" quando={dataHoraBR(pedido.confirmed_at)} />
            <Etapa feito={!!pedido.invoiced_at} rotulo="Faturado" quando={pedido.invoiced_at ? dataHoraBR(pedido.invoiced_at) : null} />
            <Etapa feito={status === "delivered"} rotulo="Entregue" quando={pedido.delivered_at ? dataHoraBR(pedido.delivered_at) : null} />
          </div>
        </Card>
      )}

      <div className={cn("grid gap-4", gestao && "lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start")}>
        <div className="min-w-0 space-y-4">
          {/* Itens */}
          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 text-base font-semibold">Itens</h2>
            <ul className="divide-y">
              {itens.map((i, idx) => (
                <li key={i.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                    {i.image_url ? (
                      <img src={i.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <ImageOff className="h-4 w-4 text-muted-foreground/60" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">
                      <span className="mr-1 text-muted-foreground">{idx + 1}.</span>
                      {i.description}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatarQtd(i.quantity)} {i.unit || "un"} × {formatBRL(i.unit_price)}
                      {num(i.discount_percent) > 0 ? ` · desconto de ${formatarPercent(i.discount_percent)}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">{formatBRL(i.total)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal{temItemDesconto ? " (com os descontos dos itens)" : ""}</span>
                <span className="tabular-nums">{formatBRL(pedido.subtotal)}</span>
              </div>
              {num(pedido.discount_amount) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Desconto</span>
                  <span className="tabular-nums">- {formatBRL(pedido.discount_amount)}</span>
                </div>
              )}
              {num(pedido.shipping_amount) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Frete</span>
                  <span className="tabular-nums">{formatBRL(pedido.shipping_amount)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between pt-1">
                <span className="font-medium">Total</span>
                <span className="text-xl font-bold tabular-nums">{formatBRL(pedido.total)}</span>
              </div>
            </div>
          </Card>

          {/* Parcelas */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">{parcelas.length ? "Contas a receber" : "Parcelas previstas"}</h2>
                <p className="text-xs text-muted-foreground">{descreverPagamento(pedido)}</p>
              </div>
              {gestao && parcelas.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Recebido <span className="font-semibold text-foreground">{formatBRL(recebido)}</span> de {formatBRL(pedido.total)}
                </p>
              )}
            </div>
            {pedido.payment_terms && <p className="mb-3 text-sm">{pedido.payment_terms}</p>}
            {parcelas.length > 0 ? (
              <ul className="divide-y rounded-md border">
                {parcelas.map((p, idx) => {
                  const vencida = p.status === "pending" && p.due_date < hoje;
                  const st = vencida ? "overdue" : p.status;
                  const link = p.charge_url || p.bank_slip_url;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums">
                        {p.installment_number ?? idx + 1}/{p.installment_total ?? parcelas.length}
                      </span>
                      <span className="w-24 shrink-0 tabular-nums">{dataBR(p.due_date)}</span>
                      <Badge variant="outline" className={cn("text-[11px]", ESTILO_PARCELA[st] ?? "")}>
                        {SITUACAO_PARCELA[st] ?? st}
                        {p.status === "paid" && p.payment_date ? ` em ${dataBR(p.payment_date)}` : ""}
                      </Badge>
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Cobrança
                        </a>
                      )}
                      <span className="ml-auto font-semibold tabular-nums">{formatBRL(p.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="divide-y rounded-md border">
                {previstas.map((p) => (
                  <li key={p.numero} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {p.numero}/{previstas.length}
                    </span>
                    <span className="tabular-nums">{p.vencimento ? dataBR(p.vencimento) : ""}</span>
                    <span className="ml-auto font-semibold tabular-nums">{formatBRL(p.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
            {gestao && (
              <Link to="/pdv/vendas/receber" className="mt-2 inline-block text-xs text-muted-foreground underline-offset-2 hover:underline">
                Ver no contas a receber
              </Link>
            )}
          </Card>

          {(pedido.delivery_date || pedido.delivery_terms || pedido.notes || (gestao && pedido.internal_notes)) && (
            <Card className="space-y-3 p-4 text-sm sm:p-5">
              {(pedido.delivery_date || pedido.delivery_terms) && (
                <div>
                  <h2 className="text-base font-semibold">Entrega</h2>
                  {pedido.delivery_date && <p>Previsão: {dataBR(pedido.delivery_date)}</p>}
                  {pedido.delivery_terms && <p className="text-muted-foreground">{pedido.delivery_terms}</p>}
                </div>
              )}
              {pedido.notes && (
                <div>
                  <h2 className="text-base font-semibold">Observações para o cliente</h2>
                  <p className="whitespace-pre-wrap text-muted-foreground">{pedido.notes}</p>
                </div>
              )}
              {pedido.internal_notes && (
                <div>
                  <h2 className="text-base font-semibold">Observações internas</h2>
                  <p className="whitespace-pre-wrap text-muted-foreground">{pedido.internal_notes}</p>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className={cn("space-y-4", gestao && "lg:sticky lg:top-4")}>
          <Card className="space-y-1 p-4 text-sm">
            <h2 className="mb-1 text-base font-semibold">Cliente</h2>
            <Link to={caminhoCliente} className="font-medium underline-offset-2 hover:underline">
              {nomeCliente(cliente)}
            </Link>
            {cliente?.company_name && cliente.company_name !== nomeCliente(cliente) && (
              <p className="text-muted-foreground">{cliente.company_name}</p>
            )}
            {(cliente?.cnpj || cliente?.cpf) && (
              <p className="text-muted-foreground">
                {cliente.cnpj ? "CNPJ" : "CPF"} {formatarDocumento(cliente.cnpj || cliente.cpf)}
                {cliente.state_registration ? ` · IE ${cliente.state_registration}` : ""}
              </p>
            )}
            {cliente && enderecoCliente(cliente) && <p className="text-muted-foreground">{enderecoCliente(cliente)}</p>}
            {cliente && (cliente.contact_name || cliente.whatsapp || cliente.phone || cliente.email) && (
              <p className="text-muted-foreground">
                {[cliente.contact_name, cliente.whatsapp || cliente.phone, cliente.email].filter(Boolean).join(" · ")}
              </p>
            )}
          </Card>

          <Card className="space-y-1 p-4 text-sm">
            <h2 className="mb-1 text-base font-semibold">Representante</h2>
            {pedido.rep ? (
              <>
                <p className="font-medium">{pedido.rep.name}</p>
                <p className="text-muted-foreground">
                  Comissão de {formatarPercent(pedido.commission_percent)} sobre o recebido
                </p>
                <p className="text-muted-foreground">
                  Prevista: <span className="font-medium text-foreground">{formatBRL(comissaoPrevista)}</span>
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Venda direta, sem comissão.</p>
            )}
          </Card>

          {pedido.proposta?.responder_name && (
            <Card className="flex items-start gap-2 p-4 text-sm">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">
                Proposta aprovada por <span className="font-medium text-foreground">{pedido.proposta.responder_name}</span>
                {pedido.proposta.responded_at ? ` em ${dataHoraBR(pedido.proposta.responded_at)}` : ""}.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Confirmações */}
      <AlertDialog open={confirmar !== null} onOpenChange={(v) => !v && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmar === "faturar" ? `Faturar o pedido ${pedido.number}?` : `O pedido ${pedido.number} foi entregue?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar === "faturar"
                ? "Marca o pedido como faturado (nota emitida). As parcelas no contas a receber não mudam."
                : "Marca o pedido como entregue ao cliente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const qual = confirmar;
                setConfirmar(null);
                if (qual === "faturar") executar("faturar", () => faturarPedido(id), "Pedido faturado");
                else if (qual === "entregar") executar("entregar", () => entregarPedido(id), "Pedido marcado como entregue");
              }}
            >
              {confirmar === "faturar" ? "Faturar" : "Marcar entregue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={cancelando} onOpenChange={setCancelando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar o pedido {pedido.number}</DialogTitle>
            <DialogDescription>
              As parcelas ainda não recebidas são canceladas no contas a receber. O que já foi recebido continua lá.
            </DialogDescription>
          </DialogHeader>
          {cobrancasAbertas.length > 0 && (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p>
                {cobrancasAbertas.length === 1 ? "Há 1 cobrança emitida" : `Há ${cobrancasAbertas.length} cobranças emitidas`} no Asaas para este
                pedido. Cancele também em Cobranças, para o cliente não receber o boleto.
              </p>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="motivo-cancelamento">Motivo</Label>
            <Textarea
              id="motivo-cancelamento"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value.slice(0, 300))}
              placeholder="Ex.: cliente desistiu, sem estoque, pedido duplicado"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelando(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={!motivo.trim() || ocupado}
              onClick={() => {
                setCancelando(false);
                executar("cancelar", () => cancelarPedido(id, motivo.trim()), "Pedido cancelado");
              }}
            >
              {acao === "cancelar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
