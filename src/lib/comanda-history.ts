export interface ClosedComanda {
  id: string;
  order_id: string | null;
  numero: string;
  cliente: string | null;
  telefone: string | null;
  aberta_em: string;
  fechada_em: string;
  consumo: number;
  mesa: string | null;
  local: string;
  atendimento_numero: string | null;
  valor_pago: number | null;
  pagamento_escopo: "atendimento" | "comanda" | null;
}
export interface HistoryPayment {
  id: string;
  valor: number;
  forma: string | null;
  data: string | null;
  recebido?: number | null;
  troco?: number | null;
  motivo_desconto?: string | null;
}
export interface ClosedComandaDetail {
  business?: { name?: string | null; cnpj?: string | null; address?: string | null; phone?: string | null } | null;
  comanda: {
    id: string; numero: string; cliente: string | null; telefone: string | null;
    consumo: number; aberta_em: string; fechada_em: string; observacoes: string | null;
  };
  atendimento: {
    id: string; numero: string; status: string; mesa: string | null; balcao: boolean;
    desconto: number | null; taxa_servico: number | null; taxa_servico_paga: number | null;
  } | null;
  itens: {
    id: string; produto: string; quantidade: number; preco_unitario: number; subtotal: number;
    observacoes: string | null; parent_item_id: string | null; complemento: boolean;
  }[];
  pagamentos_atendimento: HistoryPayment[];
  movimentos_comanda: HistoryPayment[];
  comandas_atendimento: { id: string; numero: string; cliente: string | null; status: string; consumo: number }[];
  cashback_usado: number;
  cancelados: { id: string; produto: string; quantidade: number; subtotal: number; motivo: string | null; data: string }[];
}

export function historyTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

/** Pagamentos e movimentos podem representar a mesma venda. Nunca somar os dois. */
export function historyPaymentSummary(detail: ClosedComandaDetail) {
  const isAttendance = detail.pagamentos_atendimento.length > 0;
  const payments = isAttendance ? detail.pagamentos_atendimento : detail.movimentos_comanda;
  return {
    scope: isAttendance ? "atendimento" as const : "comanda" as const,
    payments,
    total: payments.length ? Math.round(payments.reduce((sum, payment) => sum + Number(payment.valor), 0) * 100) / 100 : null,
  };
}
