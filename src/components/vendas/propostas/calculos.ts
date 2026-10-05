/**
 * Força de vendas · contas e rótulos da proposta e do pedido, sem React e sem jsPDF.
 *
 * O valor que vale é sempre o do banco (gatilhos da fundação). Estas funções só servem para a prévia na tela antes de
 * salvar, para o cronograma de parcelas (que o banco só grava quando a proposta vira pedido) e para os textos.
 */
import { format, parseISO } from "date-fns";
import {
  FORMA_PAGAMENTO_LABEL,
  type FormaPagamento,
  type PropostaStatus,
  type VendasCliente,
} from "@/lib/vendas/types";

/** Arredondamento de centavo igual ao round(x, 2) do Postgres (meio para cima). */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const num = (v: unknown, fallback = 0) => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
};

/** Mesmo cálculo do gatilho vendas_item_total: quantidade × preço × (1 − desconto%). */
export const totalDoItem = (quantidade: number, preco: number, descontoPercent: number) =>
  round2(num(quantidade) * num(preco) * (1 - num(descontoPercent) / 100));

export function calcularTotais(
  itens: { quantity: number; unit_price: number; discount_percent: number }[],
  desconto: number,
  frete: number,
) {
  const bruto = round2(itens.reduce((s, i) => s + num(i.quantity) * num(i.unit_price), 0));
  const subtotal = round2(itens.reduce((s, i) => s + totalDoItem(i.quantity, i.unit_price, i.discount_percent), 0));
  const total = Math.max(0, round2(subtotal - num(desconto) + num(frete)));
  return { bruto, subtotal, total };
}

export interface ParcelaPrevista {
  numero: number;
  /** Dias depois da aprovação (proposta) ou da confirmação (pedido). */
  dias: number;
  /** Data, quando há uma base (pedido confirmado). */
  vencimento: Date | null;
  valor: number;
}

/** Mesmo cronograma de vendas_gerar_pedido: parcelas iguais e a última leva o arredondamento. */
export function calcularParcelas(opts: {
  total: number;
  parcelas: number;
  primeiroVencimentoDias: number;
  intervaloDias: number;
  base?: Date | null;
}): ParcelaPrevista[] {
  const n = Math.min(24, Math.max(1, Math.trunc(num(opts.parcelas, 1))));
  const total = num(opts.total);
  if (total <= 0) return [];
  const parcela = round2(total / n);
  const ultima = round2(total - parcela * (n - 1));
  const out: ParcelaPrevista[] = [];
  for (let i = 1; i <= n; i += 1) {
    const dias = num(opts.primeiroVencimentoDias) + (i - 1) * num(opts.intervaloDias, 30);
    let vencimento: Date | null = null;
    if (opts.base) {
      vencimento = new Date(opts.base.getFullYear(), opts.base.getMonth(), opts.base.getDate() + dias);
    }
    out.push({ numero: i, dias, vencimento, valor: i === n ? ultima : parcela });
  }
  return out;
}

export function rotuloForma(forma: string | null | undefined) {
  if (!forma) return "A combinar";
  return FORMA_PAGAMENTO_LABEL[forma as FormaPagamento] ?? forma;
}

/** "Boleto · 3x · 1ª em 30 dias, depois a cada 30 dias". */
export function descreverPagamento(p: {
  payment_method: string | null;
  installments: number;
  first_due_days: number;
  interval_days: number;
}) {
  const partes = [rotuloForma(p.payment_method)];
  const n = Math.max(1, num(p.installments, 1));
  const primeira = num(p.first_due_days);
  if (n === 1) {
    partes.push(primeira === 0 ? "à vista" : `em ${primeira} dias`);
  } else {
    partes.push(`${n}x`);
    partes.push(`1ª ${primeira === 0 ? "à vista" : `em ${primeira} dias`}, depois a cada ${num(p.interval_days, 30)} dias`);
  }
  return partes.join(" · ");
}

/** Hoje no fuso de São Paulo, como "yyyy-MM-dd" (o banco compara a validade assim). */
export function hojeISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function somarDiasISO(iso: string, dias: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + dias);
  return format(d, "yyyy-MM-dd");
}

/** Data do banco ("yyyy-MM-dd") ou timestamp para dd/MM/yyyy. DATE puro não passa por new Date (voltaria um dia). */
export function dataBR(v: string | Date | null | undefined) {
  if (!v) return "";
  if (v instanceof Date) return format(v, "dd/MM/yyyy");
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return format(parseISO(v), "dd/MM/yyyy");
  return format(new Date(v), "dd/MM/yyyy");
}

export function dataHoraBR(v: string | null | undefined) {
  if (!v) return "";
  return format(new Date(v), "dd/MM/yyyy 'às' HH:mm");
}

/**
 * A validade só vira "expired" no banco quando o cliente abre o link. Na lista, a proposta enviada com a validade
 * passada já aparece como vencida.
 */
export function statusEfetivo(p: { status: PropostaStatus; valid_until: string | null }): PropostaStatus {
  if (p.status === "sent" && p.valid_until && p.valid_until < hojeISO()) return "expired";
  return p.status;
}

export const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function formatarDocumento(v: string | null | undefined) {
  const d = soDigitos(v);
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v ?? "";
}

export function formatarCep(v: string | null | undefined) {
  const d = soDigitos(v);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : (v ?? "");
}

/** Nome que o vendedor usa no dia a dia: fantasia, senão o nome do cadastro. */
export function nomeCliente(c: Partial<VendasCliente> | null | undefined) {
  if (!c) return "Cliente";
  return (c.trade_name || c.name || c.company_name || "Cliente").trim();
}

export function enderecoCliente(c: Partial<VendasCliente> | null | undefined) {
  if (!c) return "";
  const rua = [c.street, c.address_number].filter(Boolean).join(", ");
  const linha1 = [rua, c.complement].filter(Boolean).join(" · ");
  const cidade = [c.city, c.state].filter(Boolean).join("/");
  return [linha1, c.district, cidade, c.cep ? `CEP ${formatarCep(c.cep)}` : ""].filter(Boolean).join(" · ");
}

export const formatarQtd = (v: number) => num(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
export const formatarPercent = (v: number) =>
  `${num(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
