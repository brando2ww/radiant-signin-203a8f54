import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Ban, CheckCircle2, Copy, Eye, EyeOff, FileDown, ImageOff, Loader2, MoreHorizontal, PackagePlus,
  PenLine, Save, Send, Share2, ShoppingBag, Trash2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { SearchSelect } from "@/components/ui/search-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { FORMA_PAGAMENTO_LABEL, type FormaPagamento, type VendasPropostaItem } from "@/lib/vendas/types";
import {
  converterProposta, duplicarProposta, mudarStatusProposta, rascunhoVazio, salvarProposta, useClientesParaProposta,
  useInvalidarPropostas, useMarcaDaEmpresa, useMeuRepresentante, useProdutosParaProposta, useRepresentantesDaEmpresa,
  useVendasProposta, type ItemRascunho, type ProdutoParaProposta, type PropostaCompleta, type PropostaRascunho,
} from "@/hooks/use-vendas-propostas";
import {
  calcularParcelas, calcularTotais, dataBR, dataHoraBR, formatarDocumento, formatarPercent, formatarQtd, hojeISO,
  nomeCliente, num, round2, statusEfetivo, totalDoItem,
} from "./calculos";
import { PropostaStatusBadge } from "./PropostaStatusBadge";
import { ProdutoPicker, precoDoProduto } from "./ProdutoPicker";
import { CampoNumero } from "./CampoNumero";
import { CompartilharPropostaDialog } from "./CompartilharPropostaDialog";
import { useRepContextOptional } from "@/components/vendas/rep/RepContext";

export type ModoVendas = "gestao" | "representante";

export const baseDoModo = (mode: ModoVendas) => (mode === "gestao" ? "/pdv/vendas" : "/representante");
export const caminhoDoPedido = (mode: ModoVendas, id: string) =>
  mode === "gestao" ? `/pdv/vendas/pedidos/${id}` : `/representante/pedidos?id=${id}`;

export function mensagemDeErro(e: unknown) {
  const m = (e as any)?.message ?? String(e);
  if (/row-level security|permission denied/i.test(m)) return "Você não tem permissão para esta ação.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão. Confira a internet e tente de novo.";
  return m;
}

const novaChave = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()));

function doBanco(p: PropostaCompleta, itens: VendasPropostaItem[]): PropostaRascunho {
  return {
    customer_id: p.customer_id,
    representative_id: p.representative_id,
    valid_until: p.valid_until,
    payment_method: p.payment_method,
    installments: p.installments,
    first_due_days: p.first_due_days,
    interval_days: p.interval_days,
    payment_terms: p.payment_terms ?? "",
    delivery_date: p.delivery_date,
    delivery_terms: p.delivery_terms ?? "",
    notes: p.notes ?? "",
    internal_notes: p.internal_notes ?? "",
    discount_amount: num(p.discount_amount),
    shipping_amount: num(p.shipping_amount),
    itens: itens.map((i) => ({
      id: i.id,
      key: i.id,
      product_id: i.product_id,
      description: i.description,
      image_url: i.image_url,
      unit: i.unit,
      quantity: num(i.quantity),
      unit_price: num(i.unit_price),
      discount_percent: num(i.discount_percent),
    })),
  };
}

/** Assinatura do que importa para saber se há alteração por salvar. */
const assinatura = (r: PropostaRascunho) =>
  JSON.stringify({
    ...r,
    payment_terms: r.payment_terms.trim(),
    delivery_terms: r.delivery_terms.trim(),
    notes: r.notes.trim(),
    internal_notes: r.internal_notes.trim(),
    itens: r.itens.map(({ key: _k, ...i }) => ({ ...i, description: i.description.trim() })),
  });

/** "Vencimentos: 30, 60 e 90 dias, contados da aprovação." */
export function textoVencimentos(dias: number[], intervalo: number, evento = "da aprovação") {
  if (dias.length === 0) return "";
  if (dias.length > 6) return `Vencimentos de ${dias[0]} a ${dias[dias.length - 1]} dias, a cada ${intervalo} dias, contados ${evento}.`;
  const partes = dias.map((d) => (d === 0 ? "à vista" : `${d} dias`));
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}` : partes[0];
  return `${dias.length > 1 ? "Vencimentos" : "Vencimento"}: ${lista}, contados ${evento}.`;
}

const multiplo = (q: number, passo: number) => {
  const r = q / passo;
  return Math.abs(r - Math.round(r)) < 1e-6;
};

function Miniatura({ url, className }: { url: string | null; className?: string }) {
  const [erro, setErro] = useState(false);
  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted", className)}>
      {url && !erro ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setErro(true)} />
      ) : (
        <ImageOff className="h-4 w-4 text-muted-foreground/60" />
      )}
    </div>
  );
}

function Secao({ titulo, descricao, children, acao }: { titulo: string; descricao?: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{titulo}</h2>
          {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </Card>
  );
}

export function PropostaEditor({ mode }: { mode: ModoVendas }) {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const base = baseDoModo(mode);
  const novo = !id;

  const { data, isLoading, refetch, error: erroCarga } = useVendasProposta(id);
  const { data: todosClientes = [], isLoading: carregandoClientes } = useClientesParaProposta();
  const { data: produtos = [] } = useProdutosParaProposta();
  const { data: meuRep } = useMeuRepresentante();
  const { data: reps = [] } = useRepresentantesDaEmpresa(mode === "gestao");
  const { data: marca } = useMarcaDaEmpresa();
  const invalidar = useInvalidarPropostas();
  // No app do representante, o dono pode estar só pré-visualizando como um representante: grava como gestão, em
  // nome do representante escolhido.
  const repCtx = useRepContextOptional();
  const previa = mode === "representante" && !!repCtx?.isPreview;
  const modoGravacao: ModoVendas = previa ? "gestao" : mode;

  const [r, setR] = useState<PropostaRascunho>(() => {
    const v = rascunhoVazio();
    const cli = params.get("cliente");
    if (cli) v.customer_id = cli;
    if (previa) v.representative_id = repCtx?.repId ?? null;
    return v;
  });
  const [salvo, setSalvo] = useState<string>(() => assinatura(r));
  const [carregou, setCarregou] = useState(novo);
  const [acao, setAcao] = useState<null | "salvar" | "enviar" | "aprovar" | "cancelar" | "duplicar" | "pdf">(null);
  const [picker, setPicker] = useState(false);
  const [compartilhar, setCompartilhar] = useState(false);
  const [confirmarAprovacao, setConfirmarAprovacao] = useState(false);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const preencheuCliente = useRef(false);

  const proposta = data?.proposta ?? null;
  const itensNoBanco = data?.itens ?? [];
  const status = proposta?.status ?? "draft";
  const efetivo = proposta ? statusEfetivo(proposta) : "draft";
  const editavel = novo || status === "draft" || status === "sent";
  const sujo = assinatura(r) !== salvo;

  // Carrega do banco na primeira vez; depois só quando não há edição pendente (o foco da janela refaz a busca).
  useEffect(() => {
    if (!data) return;
    if (!carregou || !sujo) {
      const v = doBanco(data.proposta, data.itens);
      setR(v);
      setSalvo(assinatura(v));
      setCarregou(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Veio do "Enviar" de uma proposta nova: abre o compartilhamento já com a proposta gravada.
  useEffect(() => {
    if (proposta && params.get("compartilhar") === "1") {
      setCompartilhar(true);
      const p = new URLSearchParams(params);
      p.delete("compartilhar");
      setParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposta?.id]);

  const clientes = useMemo(
    () => (previa && repCtx?.repId ? todosClientes.filter((c) => c.representative_id === repCtx.repId) : todosClientes),
    [todosClientes, previa, repCtx?.repId],
  );
  const produtosPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const cliente = useMemo(
    () => (clientes.find((c) => c.id === r.customer_id) as any) ?? (proposta?.customer_id === r.customer_id ? proposta?.customer : null) ?? null,
    [clientes, r.customer_id, proposta],
  );

  // Cliente escolhido numa proposta nova: traz o representante da carteira e o prazo combinado no cadastro.
  useEffect(() => {
    if (!novo || !cliente || preencheuCliente.current) return;
    preencheuCliente.current = true;
    setR((v) => ({
      ...v,
      representative_id: v.representative_id ?? cliente.representative_id ?? null,
    }));
  }, [novo, cliente]);

  const maxDesc =
    mode === "representante" ? num(repCtx?.rep?.max_discount_percent ?? meuRep?.max_discount_percent, 0) : 100;
  const totais = calcularTotais(r.itens, r.discount_amount, r.shipping_amount);
  const descontoTotalPct =
    totais.bruto > 0 ? round2(((totais.bruto - Math.max(0, totais.subtotal - num(r.discount_amount))) / totais.bruto) * 100) : 0;
  const usarBanco = !!proposta && !sujo;
  const subtotalExibido = usarBanco ? num(proposta!.subtotal) : totais.subtotal;
  const totalExibido = usarBanco ? num(proposta!.total) : totais.total;
  const parcelas = calcularParcelas({
    total: totalExibido,
    parcelas: r.installments,
    primeiroVencimentoDias: r.first_due_days,
    intervaloDias: r.interval_days,
  });

  const mudar = (patch: Partial<PropostaRascunho>) => setR((v) => ({ ...v, ...patch }));
  const mudarItem = (key: string, patch: Partial<ItemRascunho>) =>
    setR((v) => ({ ...v, itens: v.itens.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  const removerItem = (key: string) => setR((v) => ({ ...v, itens: v.itens.filter((i) => i.key !== key) }));

  const adicionarProduto = (p: ProdutoParaProposta) => {
    const passo = num(p.pack_qty, 0) > 0 ? num(p.pack_qty) : 1;
    const inicial = Math.max(num(p.min_qty, 0), passo, 1);
    setR((v) => {
      const existente = v.itens.find((i) => i.product_id === p.id);
      if (existente) {
        return { ...v, itens: v.itens.map((i) => (i.key === existente.key ? { ...i, quantity: round2(i.quantity + passo) } : i)) };
      }
      return {
        ...v,
        itens: [
          ...v.itens,
          {
            key: novaChave(),
            product_id: p.id,
            description: p.name,
            image_url: p.image_url,
            unit: p.sales_unit || "un",
            quantity: inicial,
            unit_price: precoDoProduto(p),
            discount_percent: 0,
          },
        ],
      };
    });
  };

  const adicionarAvulso = () =>
    setR((v) => ({
      ...v,
      itens: [
        ...v.itens,
        { key: novaChave(), product_id: null, description: "", image_url: null, unit: "un", quantity: 1, unit_price: 0, discount_percent: 0 },
      ],
    }));

  const quantidadesNaProposta = useMemo(() => {
    const m = new Map<string, number>();
    r.itens.forEach((i) => i.product_id && m.set(i.product_id, (m.get(i.product_id) ?? 0) + i.quantity));
    return m;
  }, [r.itens]);

  function validar(paraEnviar: boolean): string | null {
    if (!r.customer_id) return "Escolha o cliente.";
    for (const [idx, i] of r.itens.entries()) {
      const n = idx + 1;
      if (!i.description.trim()) return `Descreva o item ${n}.`;
      if (!(num(i.quantity) > 0)) return `A quantidade do item ${n} precisa ser maior que zero.`;
      if (num(i.unit_price) < 0) return `O preço do item ${n} não pode ser negativo.`;
      if (num(i.discount_percent) > maxDesc + 1e-9)
        return `O desconto do item ${n} passa do seu limite de ${formatarPercent(maxDesc)}.`;
    }
    if (mode === "representante" && descontoTotalPct > maxDesc + 0.01)
      return `O desconto total (${formatarPercent(descontoTotalPct)}) passa do seu limite de ${formatarPercent(maxDesc)}.`;
    if (paraEnviar) {
      if (r.itens.length === 0) return "Adicione ao menos um item antes de enviar.";
      if (r.valid_until && r.valid_until < hojeISO()) return "A validade já passou. Ajuste a data antes de enviar.";
    }
    return null;
  }

  /** Grava e relê o que o banco calculou. Proposta nova muda de endereço (o editor remonta com o id). */
  async function gravar(): Promise<string | null> {
    const erro = validar(false);
    if (erro) {
      toast.error(erro);
      return null;
    }
    const pid = await salvarProposta({ id, rascunho: r, modo: modoGravacao, itensNoBanco: itensNoBanco });
    invalidar(pid);
    if (id) {
      const fresco = await refetch();
      if (fresco.data) {
        const v = doBanco(fresco.data.proposta, fresco.data.itens);
        setR(v);
        setSalvo(assinatura(v));
      }
    }
    return pid;
  }

  async function executar(nome: NonNullable<typeof acao>, fn: () => Promise<void>) {
    setAcao(nome);
    try {
      await fn();
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setAcao(null);
    }
  }

  const salvar = () =>
    executar("salvar", async () => {
      const pid = await gravar();
      if (!pid) return;
      toast.success(novo ? "Proposta criada" : "Proposta salva");
      if (novo) navigate(`${base}/propostas/${pid}`, { replace: true });
    });

  const enviar = () =>
    executar("enviar", async () => {
      const erro = validar(true);
      if (erro) {
        toast.error(erro);
        return;
      }
      const pid = novo || sujo ? await gravar() : id!;
      if (!pid) return;
      if (novo || status === "draft") await mudarStatusProposta(pid, "sent");
      invalidar(pid);
      if (novo) {
        navigate(`${base}/propostas/${pid}?compartilhar=1`, { replace: true });
        return;
      }
      await refetch();
      setCompartilhar(true);
    });

  const pdf = () =>
    executar("pdf", async () => {
      let pid = id ?? null;
      if (editavel && (novo || sujo)) {
        pid = await gravar();
        if (!pid) return;
        if (novo) navigate(`${base}/propostas/${pid}`, { replace: true });
      }
      const { gerarPdfProposta } = await import("@/lib/vendas/documento-pdf");
      await gerarPdfProposta(pid!);
    });

  const aprovar = () =>
    executar("aprovar", async () => {
      setConfirmarAprovacao(false);
      let pid = id ?? null;
      if (editavel && (novo || sujo)) {
        pid = await gravar();
        if (!pid) return;
      }
      const pedidoId = await converterProposta(pid!);
      invalidar(pid!);
      toast.success("Pedido gerado. As parcelas já estão no contas a receber.");
      navigate(caminhoDoPedido(mode, pedidoId));
    });

  const cancelar = () =>
    executar("cancelar", async () => {
      setConfirmarCancelamento(false);
      await mudarStatusProposta(id!, "cancelled");
      invalidar(id);
      await refetch();
      toast.success("Proposta cancelada");
    });

  const duplicar = () =>
    executar("duplicar", async () => {
      if (!proposta) return;
      const novoId = await duplicarProposta(proposta, itensNoBanco, modoGravacao);
      invalidar(novoId);
      toast.success("Cópia criada como rascunho");
      navigate(`${base}/propostas/${novoId}`);
    });

  // ── Estados de carga ──
  if (!novo && (isLoading || (!carregou && data))) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!novo && (!data || erroCarga)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-medium">Proposta não encontrada</p>
        <p className="mt-1 text-sm text-muted-foreground">Ela pode ter sido apagada ou não estar na sua carteira.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={`${base}/propostas`}>Voltar às propostas</Link>
        </Button>
      </div>
    );
  }

  const ocupado = acao !== null;
  const opcoesClientes = [
    ...clientes.map((c) => ({
      value: c.id,
      label: nomeCliente(c),
      hint: [c.cnpj || c.cpf ? formatarDocumento(c.cnpj || c.cpf) : "", c.city].filter(Boolean).join(" · "),
    })),
    ...(proposta?.customer && !clientes.some((c) => c.id === proposta.customer_id)
      ? [{ value: proposta.customer_id, label: nomeCliente(proposta.customer), hint: "" }]
      : []),
  ];
  const repDaProposta = mode === "gestao" ? reps.find((x) => x.id === r.representative_id) : null;
  const podeAprovar = !!proposta ? ["draft", "sent", "approved"].includes(status) && !proposta.order_id : true;
  const temItens = r.itens.length > 0;
  const largo = mode === "gestao";

  // ── Ações ── (no app do representante os botões de texto esticam e ocupam a linha toda)
  const cresce = largo ? "" : "min-w-[8.5rem] flex-1";
  const botoes = (
    <div className="flex flex-wrap items-center gap-2">
      {editavel && (
        <Button variant="outline" className={cresce} onClick={salvar} disabled={ocupado || (!novo && !sujo)}>
          {acao === "salvar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
      )}
      {(novo || status === "draft") && (
        <Button className={cresce} onClick={enviar} disabled={ocupado || !temItens}>
          {acao === "enviar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Enviar
        </Button>
      )}
      {status === "sent" && !novo && (
        <Button
          className={cresce}
          onClick={() => (sujo ? enviar() : setCompartilhar(true))}
          disabled={ocupado}
        >
          {acao === "enviar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
          {sujo ? "Salvar e compartilhar" : "Compartilhar"}
        </Button>
      )}
      {podeAprovar && !novo && (
        <Button
          variant="outline"
          className={cn(cresce, "border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950")}
          onClick={() => setConfirmarAprovacao(true)}
          disabled={ocupado || !temItens}
        >
          {acao === "aprovar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          Cliente aprovou
        </Button>
      )}
      {proposta?.order && (
        <Button asChild className={cresce}>
          <Link to={caminhoDoPedido(mode, proposta.order.id)}>
            <ShoppingBag className="mr-2 h-4 w-4" /> Ver pedido {proposta.order.number}
          </Link>
        </Button>
      )}
      <Button variant="outline" onClick={pdf} disabled={ocupado || (novo && !r.customer_id)} title="Baixar PDF" aria-label="Baixar PDF">
        {acao === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
        PDF
      </Button>
      {!novo && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={ocupado} aria-label="Mais ações">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={duplicar}>
              <Copy className="mr-2 h-4 w-4" /> Duplicar
            </DropdownMenuItem>
            {status !== "draft" && proposta && (
              <DropdownMenuItem onClick={() => setCompartilhar(true)}>
                <Share2 className="mr-2 h-4 w-4" /> Link do cliente
              </DropdownMenuItem>
            )}
            {["draft", "sent", "approved"].includes(status) && !proposta?.order_id && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmarCancelamento(true)}>
                  <Ban className="mr-2 h-4 w-4" /> Cancelar proposta
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  // ── Situação (o que aconteceu com a proposta) ──
  const situacao = proposta && status !== "draft" && (
    <Card
      className={cn(
        "flex flex-col gap-1.5 p-4 text-sm",
        efetivo === "converted" || efetivo === "approved" ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30" : "",
        efetivo === "rejected" ? "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30" : "",
        efetivo === "expired" ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30" : "",
      )}
    >
      {proposta.sent_at && (
        <p className="flex items-center gap-2">
          <Send className="h-4 w-4 shrink-0 text-muted-foreground" /> Enviada em {dataHoraBR(proposta.sent_at)}
        </p>
      )}
      {proposta.viewed_at ? (
        <p className="flex items-center gap-2">
          <Eye className="h-4 w-4 shrink-0 text-blue-600" /> Visto pelo cliente em {dataHoraBR(proposta.viewed_at)}
        </p>
      ) : (
        status === "sent" && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <EyeOff className="h-4 w-4 shrink-0" /> O cliente ainda não abriu o link
          </p>
        )
      )}
      {(status === "approved" || status === "converted") && (
        <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Aprovada{proposta.responder_name ? ` por ${proposta.responder_name}` : ""}
          {proposta.responded_at ? ` em ${dataHoraBR(proposta.responded_at)}` : ""}
          {proposta.order ? ` · virou o pedido ${proposta.order.number}` : ""}
        </p>
      )}
      {status === "rejected" && (
        <>
          <p className="flex items-center gap-2 font-medium text-rose-700 dark:text-rose-300">
            <XCircle className="h-4 w-4 shrink-0" />
            Recusada{proposta.responder_name ? ` por ${proposta.responder_name}` : ""}
            {proposta.responded_at ? ` em ${dataHoraBR(proposta.responded_at)}` : ""}
          </p>
          {proposta.rejection_reason && <p className="pl-6 text-muted-foreground">Motivo: “{proposta.rejection_reason}”</p>}
        </>
      )}
      {efetivo === "expired" && (
        <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
          Venceu em {dataBR(proposta.valid_until)}.{" "}
          {status === "sent" ? "Ajuste a validade e compartilhe de novo, ou duplique." : "Duplique para mandar uma nova."}
        </p>
      )}
      {status === "cancelled" && <p className="text-muted-foreground">Proposta cancelada. Duplique para reaproveitar os itens.</p>}
    </Card>
  );

  // ── Resumo de valores ──
  const resumo = (
    <Card className="space-y-3 p-4 sm:p-5">
      <h2 className="text-base font-semibold">Valores</h2>
      <div className="space-y-1.5 text-sm">
        {totais.bruto > totais.subtotal + 0.004 && (
          <>
            <div className="flex justify-between text-muted-foreground">
              <span>Valor de tabela</span>
              <span className="tabular-nums">{formatBRL(totais.bruto)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Descontos nos itens</span>
              <span className="tabular-nums">- {formatBRL(totais.bruto - totais.subtotal)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between">
          <span>Subtotal ({r.itens.length} {r.itens.length === 1 ? "item" : "itens"})</span>
          <span className="tabular-nums">{formatBRL(subtotalExibido)}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Desconto (R$)</Label>
          <CurrencyInput
            value={r.discount_amount || ""}
            onChange={(v) => mudar({ discount_amount: Number(v) || 0 })}
            disabled={!editavel}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Frete (R$)</Label>
          <CurrencyInput
            value={r.shipping_amount || ""}
            onChange={(v) => mudar({ shipping_amount: Number(v) || 0 })}
            disabled={!editavel}
          />
        </div>
      </div>
      <div className="flex items-baseline justify-between border-t pt-3">
        <span className="font-medium">Total</span>
        <span className="text-2xl font-bold tabular-nums">{formatBRL(totalExibido)}</span>
      </div>
      {mode === "representante" && (
        <p className={cn("text-xs", descontoTotalPct > maxDesc + 0.01 ? "font-medium text-destructive" : "text-muted-foreground")}>
          Desconto total: {formatarPercent(descontoTotalPct)} · seu limite é {formatarPercent(maxDesc)}
        </p>
      )}
      {sujo && editavel && temItens && (
        <p className="text-xs text-muted-foreground">Prévia. O total oficial é calculado pelo sistema ao salvar.</p>
      )}
    </Card>
  );

  return (
    <div className={cn("mx-auto w-full space-y-4 px-4 py-4 sm:py-6", largo ? "max-w-6xl lg:px-6" : "max-w-3xl")}>
      {/* Cabeçalho */}
      <div className="space-y-3">
        <Link to={`${base}/propostas`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Propostas
        </Link>
        <div className={cn("flex flex-col gap-3", largo && "lg:flex-row lg:items-center lg:justify-between")}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{novo ? "Nova proposta" : proposta?.number}</h1>
            {!novo && <PropostaStatusBadge status={efetivo} />}
            {sujo && editavel && !novo && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                <PenLine className="h-3.5 w-3.5" /> alterações não salvas
              </span>
            )}
          </div>
          {botoes}
        </div>
      </div>

      {situacao}

      <div className={cn("grid gap-4", largo && "lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start")}>
        <div className="min-w-0 space-y-4">
          {/* Cliente */}
          <Secao titulo="Cliente" descricao={mode === "representante" ? "Só aparecem os clientes da sua carteira." : undefined}>
            <div className={cn("grid gap-3", mode === "gestao" && "sm:grid-cols-2")}>
              <div className="space-y-1">
                <Label className="text-xs">Cliente</Label>
                <SearchSelect
                  options={opcoesClientes}
                  value={r.customer_id}
                  onChange={(v) => {
                    preencheuCliente.current = false;
                    const c = clientes.find((x) => x.id === v);
                    mudar({
                      customer_id: v ?? null,
                      ...(mode === "gestao" && novo ? { representative_id: c?.representative_id ?? null } : {}),
                    });
                  }}
                  placeholder={carregandoClientes ? "Carregando clientes..." : "Escolha o cliente"}
                  searchPlaceholder="Nome, CNPJ ou cidade"
                  emptyText="Nenhum cliente encontrado."
                  title="Cliente da proposta"
                  clearable={false}
                  disabled={!editavel || (!novo && status !== "draft" && status !== "sent")}
                />
              </div>
              {mode === "gestao" && (
                <div className="space-y-1">
                  <Label className="text-xs">Representante</Label>
                  <Select
                    value={r.representative_id ?? "nenhum"}
                    onValueChange={(v) => mudar({ representative_id: v === "nenhum" ? null : v })}
                    disabled={!editavel}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Venda direta (sem representante)</SelectItem>
                      {reps.map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.name}
                          {x.is_active ? "" : " (inativo)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {repDaProposta && (
                    <p className="text-[11px] text-muted-foreground">
                      Comissão de {formatarPercent(repDaProposta.commission_percent)} sobre o que o cliente pagar.
                    </p>
                  )}
                </div>
              )}
            </div>
            {cliente && (
              <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{cliente.company_name || nomeCliente(cliente)}</span>
                {[
                  cliente.cnpj || cliente.cpf ? formatarDocumento(cliente.cnpj || cliente.cpf) : "",
                  [cliente.city, cliente.state].filter(Boolean).join("/"),
                  cliente.whatsapp || cliente.phone || "",
                  cliente.email || "",
                ]
                  .filter(Boolean)
                  .map((t) => (
                    <span key={t}> · {t}</span>
                  ))}
              </div>
            )}
          </Secao>

          {/* Itens */}
          <Secao
            titulo="Itens"
            descricao={
              mode === "representante" && maxDesc > 0
                ? `Preço de tabela do catálogo. Desconto por item até ${formatarPercent(maxDesc)}.`
                : mode === "representante"
                  ? "Preço de tabela do catálogo."
                  : undefined
            }
            acao={
              editavel && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setPicker(true)}>
                    <PackagePlus className="mr-1.5 h-4 w-4" /> Produto
                  </Button>
                  <Button size="sm" variant="outline" onClick={adicionarAvulso}>
                    <PenLine className="mr-1.5 h-4 w-4" /> Item avulso
                  </Button>
                </div>
              )
            }
          >
            {r.itens.length === 0 ? (
              <button
                type="button"
                disabled={!editavel}
                onClick={() => setPicker(true)}
                className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <PackagePlus className="mb-2 h-6 w-6" />
                {editavel ? "Adicione os produtos do catálogo" : "Sem itens"}
              </button>
            ) : (
              <ul className="divide-y">
                {r.itens.map((item, idx) => {
                  const produto = item.product_id ? produtosPorId.get(item.product_id) : undefined;
                  const precoTravado = !editavel || (mode === "representante" && !!item.product_id);
                  const unidade = item.unit || "un";
                  const avisos: string[] = [];
                  if (produto?.min_qty && item.quantity < num(produto.min_qty))
                    avisos.push(`Pedido mínimo: ${formatarQtd(num(produto.min_qty))} ${unidade}`);
                  if (produto?.pack_qty && num(produto.pack_qty) > 1 && item.quantity > 0 && !multiplo(item.quantity, num(produto.pack_qty)))
                    avisos.push(`Vendido em múltiplos de ${formatarQtd(num(produto.pack_qty))}`);
                  return (
                    <li key={item.key} className="py-3 first:pt-0 last:pb-0" data-testid="item-proposta">
                      <div className="flex gap-3">
                        <Miniatura url={item.image_url} className="h-12 w-12 sm:h-14 sm:w-14" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-start gap-2">
                            {item.product_id ? (
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-tight">
                                  <span className="mr-1 text-muted-foreground">{idx + 1}.</span>
                                  {item.description}
                                </p>
                                {produto?.sku && <p className="text-[11px] text-muted-foreground">Cód. {produto.sku}</p>}
                              </div>
                            ) : (
                              <div className="flex min-w-0 flex-1 gap-2">
                                <Input
                                  value={item.description}
                                  onChange={(e) => mudarItem(item.key, { description: e.target.value })}
                                  placeholder="Descrição do item"
                                  disabled={!editavel}
                                  className="min-w-0 flex-1"
                                />
                                <Input
                                  value={item.unit ?? ""}
                                  onChange={(e) => mudarItem(item.key, { unit: e.target.value.slice(0, 12) })}
                                  placeholder="un"
                                  aria-label="Unidade"
                                  disabled={!editavel}
                                  className="w-16 shrink-0"
                                />
                              </div>
                            )}
                            {editavel && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => removerItem(item.key)}
                                aria-label="Remover item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <div className={cn("grid grid-cols-2 gap-2", largo && "sm:grid-cols-[110px_minmax(0,1fr)_90px_minmax(0,1fr)]")}>
                            <div className="space-y-0.5">
                              <Label className="text-[11px] text-muted-foreground">Qtd ({unidade})</Label>
                              <CampoNumero
                                value={item.quantity}
                                onChange={(v) => mudarItem(item.key, { quantity: v ?? 0 })}
                                min={0}
                                disabled={!editavel}
                                aria-label="Quantidade"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[11px] text-muted-foreground">Preço un.</Label>
                              {precoTravado ? (
                                <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm tabular-nums">
                                  {formatBRL(item.unit_price)}
                                </div>
                              ) : (
                                <CurrencyInput
                                  value={item.unit_price}
                                  onChange={(v) => mudarItem(item.key, { unit_price: Number(v) || 0 })}
                                  aria-label="Preço unitário"
                                />
                              )}
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[11px] text-muted-foreground">Desc.</Label>
                              <CampoNumero
                                value={item.discount_percent}
                                onChange={(v) => mudarItem(item.key, { discount_percent: Math.min(maxDesc, v ?? 0) })}
                                max={maxDesc}
                                min={0}
                                sufixo="%"
                                disabled={!editavel || maxDesc <= 0}
                                aria-label="Desconto do item em porcentagem"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[11px] text-muted-foreground">Total</Label>
                              <div className="flex h-10 items-center justify-end rounded-md px-1 text-sm font-semibold tabular-nums">
                                {formatBRL(totalDoItem(item.quantity, item.unit_price, item.discount_percent))}
                              </div>
                            </div>
                          </div>
                          {avisos.length > 0 && (
                            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">{avisos.join(" · ")}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Secao>

          {/* Pagamento */}
          <Secao titulo="Pagamento" descricao="As parcelas entram no contas a receber quando a proposta vira pedido.">
            <div className={cn("grid grid-cols-2 gap-3", largo && "sm:grid-cols-4")}>
              <div className={cn("col-span-2 space-y-1", largo && "sm:col-span-1")}>
                <Label className="text-xs">Forma</Label>
                <Select
                  value={r.payment_method ?? "a_combinar"}
                  onValueChange={(v) => mudar({ payment_method: v as FormaPagamento })}
                  disabled={!editavel}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMA_PAGAMENTO_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={cn("col-span-2 space-y-1", largo && "sm:col-span-1")}>
                <Label className="text-xs">Parcelas</Label>
                <Select value={String(r.installments)} onValueChange={(v) => mudar({ installments: Number(v) })} disabled={!editavel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n === 1 ? "1x (parcela única)" : `${n}x`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">1º vencimento em</Label>
                <CampoNumero
                  value={r.first_due_days}
                  onChange={(v) => mudar({ first_due_days: Math.min(365, v ?? 0) })}
                  inteiro
                  min={0}
                  max={365}
                  sufixo="dias"
                  className="pr-10"
                  disabled={!editavel}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Intervalo</Label>
                <CampoNumero
                  value={r.interval_days}
                  onChange={(v) => mudar({ interval_days: Math.min(365, Math.max(1, v ?? 30)) })}
                  inteiro
                  min={1}
                  max={365}
                  sufixo="dias"
                  className="pr-10"
                  disabled={!editavel || r.installments <= 1}
                />
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <Label className="text-xs">Condição combinada (aparece para o cliente)</Label>
              <Input
                value={r.payment_terms}
                onChange={(e) => mudar({ payment_terms: e.target.value })}
                placeholder={editavel ? "Ex.: boleto bancário, 5% de desconto para pagamento antecipado" : ""}
                disabled={!editavel}
              />
            </div>
            {parcelas.length > 0 && (
              <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <p className="font-medium">
                  {parcelas.length === 1
                    ? `Parcela única de ${formatBRL(parcelas[0].valor)}`
                    : `${parcelas.length}x de ${formatBRL(parcelas[0].valor)}${
                        parcelas[parcelas.length - 1].valor !== parcelas[0].valor
                          ? ` (última ${formatBRL(parcelas[parcelas.length - 1].valor)})`
                          : ""
                      }`}
                </p>
                <p className="mt-0.5 text-muted-foreground">{textoVencimentos(parcelas.map((p) => p.dias), r.interval_days)}</p>
              </div>
            )}
          </Secao>

          {/* Entrega e validade */}
          <Secao titulo="Validade e entrega">
            <div className={cn("grid gap-3", largo && "sm:grid-cols-2")}>
              <div className="space-y-1">
                <Label className="text-xs">Proposta válida até</Label>
                <Input
                  type="date"
                  value={r.valid_until ?? ""}
                  onChange={(e) => mudar({ valid_until: e.target.value || null })}
                  disabled={!editavel}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Previsão de entrega</Label>
                <Input
                  type="date"
                  value={r.delivery_date ?? ""}
                  onChange={(e) => mudar({ delivery_date: e.target.value || null })}
                  disabled={!editavel}
                />
              </div>
              <div className={cn("space-y-1", largo && "sm:col-span-2")}>
                <Label className="text-xs">Prazo e condição de entrega</Label>
                <Input
                  value={r.delivery_terms}
                  onChange={(e) => mudar({ delivery_terms: e.target.value })}
                  placeholder={editavel ? "Ex.: até 5 dias úteis após o pedido, frete por conta do fornecedor" : ""}
                  disabled={!editavel}
                />
              </div>
            </div>
          </Secao>

          {/* Observações */}
          <Secao titulo="Observações">
            <div className={cn("grid gap-3", largo && "sm:grid-cols-2")}>
              <div className="space-y-1">
                <Label className="text-xs">Para o cliente (sai no PDF e no link)</Label>
                <Textarea
                  rows={3}
                  value={r.notes}
                  onChange={(e) => mudar({ notes: e.target.value })}
                  disabled={!editavel}
                  placeholder={editavel ? "Ex.: preços válidos para pedido fechado nesta semana" : ""}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Internas (só a equipe vê)</Label>
                <Textarea
                  rows={3}
                  value={r.internal_notes}
                  onChange={(e) => mudar({ internal_notes: e.target.value })}
                  disabled={!editavel}
                  placeholder={editavel ? "Ex.: cliente pediu para ligar antes de entregar" : ""}
                />
              </div>
            </div>
          </Secao>

          {!largo && resumo}
          {!largo && <div className="pb-2">{botoes}</div>}
        </div>

        {largo && <div className="space-y-4 lg:sticky lg:top-4">{resumo}</div>}
      </div>

      <ProdutoPicker
        open={picker}
        onOpenChange={setPicker}
        onAdicionar={adicionarProduto}
        quantidadesNaProposta={quantidadesNaProposta}
      />

      {proposta && (
        <CompartilharPropostaDialog
          open={compartilhar}
          onOpenChange={setCompartilhar}
          propostaId={proposta.id}
          numero={proposta.number}
          token={proposta.public_token}
          total={num(proposta.total)}
          validade={proposta.valid_until}
          cliente={(proposta.customer as any) ?? cliente}
          loja={marca?.name ?? null}
        />
      )}

      <AlertDialog open={confirmarAprovacao} onOpenChange={setConfirmarAprovacao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>O cliente aprovou a proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              A proposta vira pedido agora, no valor de {formatBRL(totalExibido)}, e{" "}
              {parcelas.length > 1 ? `as ${parcelas.length} parcelas entram` : "a parcela entra"} no contas a receber.
              {sujo ? " As alterações não salvas são gravadas antes." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={aprovar} className="bg-emerald-600 text-white hover:bg-emerald-700">
              Gerar pedido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarCancelamento} onOpenChange={setConfirmarCancelamento}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a proposta {proposta?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              O link deixa de aceitar aprovação. A proposta continua na lista como cancelada e pode ser duplicada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={cancelar} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancelar proposta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
