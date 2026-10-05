/**
 * Força de vendas · tipos compartilhados (espelho das tabelas da migration 20261005120100_vendas_fundacao.sql).
 * O types.ts gerado do Supabase está desatualizado neste projeto; as telas do módulo usam estes tipos.
 */

export type VendasRepresentante = {
  id: string;
  user_id: string;
  rep_user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  region: string | null;
  commission_percent: number;
  max_discount_percent: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** pdv_customers com os campos B2B acrescentados pela fundação. */
export type VendasCliente = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  cpf: string | null;
  email: string | null;
  notes: string | null;
  person_type: "PF" | "PJ" | null;
  cnpj: string | null;
  company_name: string | null;
  trade_name: string | null;
  state_registration: string | null;
  contact_name: string | null;
  whatsapp: string | null;
  cep: string | null;
  street: string | null;
  address_number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  ibge_code: string | null;
  representative_id: string | null;
  payment_terms: string | null;
  credit_limit: number | null;
  is_b2b: boolean;
  asaas_customer_id: string | null;
  created_at: string;
};

/** pdv_products com os campos de venda B2B. */
export type VendasProduto = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string;
  image_url: string | null;
  price_balcao: number | null;
  price_b2b: number | null;
  b2b_enabled: boolean;
  sku: string | null;
  sales_unit: string | null;
  min_qty: number | null;
  pack_qty: number | null;
  gallery: string[];
  ean: string | null;
};

export type PropostaStatus = "draft" | "sent" | "approved" | "rejected" | "expired" | "converted" | "cancelled";
export type PedidoStatus = "confirmed" | "invoiced" | "delivered" | "cancelled";
export type FormaPagamento = "boleto" | "pix" | "cartao" | "transferencia" | "dinheiro" | "a_combinar";

type Documento = {
  id: string;
  user_id: string;
  number: string;
  representative_id: string | null;
  customer_id: string;
  payment_method: FormaPagamento | null;
  installments: number;
  first_due_days: number;
  interval_days: number;
  payment_terms: string | null;
  delivery_date: string | null;
  delivery_terms: string | null;
  notes: string | null;
  internal_notes: string | null;
  subtotal: number;
  discount_amount: number;
  shipping_amount: number;
  total: number;
  public_token: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VendasProposta = Documento & {
  status: PropostaStatus;
  valid_until: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  responder_name: string | null;
  rejection_reason: string | null;
  order_id: string | null;
};

export type VendasPedido = Documento & {
  status: PedidoStatus;
  proposta_id: string | null;
  commission_percent: number;
  confirmed_at: string;
  invoiced_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

export type VendasItem = {
  id: string;
  position: number;
  product_id: string | null;
  description: string;
  image_url: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  /** Calculado pelo banco: quantidade × preço × (1 − desconto%). */
  total: number;
};
export type VendasPropostaItem = VendasItem & { proposta_id: string };
export type VendasPedidoItem = VendasItem & { pedido_id: string };

export type VendasComissao = {
  id: string;
  user_id: string;
  representative_id: string;
  pedido_id: string | null;
  transaction_id: string;
  base_amount: number;
  percent: number;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  received_at: string | null;
  paid_at: string | null;
  payable_id: string | null;
  created_at: string;
};

export type AgendaTipo = "visita" | "ligacao" | "reuniao" | "entrega" | "tarefa" | "outro";
export type VendasAgendaItem = {
  id: string;
  user_id: string;
  representative_id: string | null;
  customer_id: string | null;
  proposta_id: string | null;
  kind: AgendaTipo;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  status: "scheduled" | "done" | "cancelled";
  outcome: string | null;
  created_at: string;
};

export type VendasAsaas = {
  user_id: string;
  environment: "production" | "sandbox";
  key_hint: string | null;
  webhook_id: string | null;
  account_name: string | null;
  account_document: string | null;
  wallet_id: string | null;
  status: "connected" | "disconnected" | "error";
  last_error: string | null;
  connected_at: string | null;
};

export const PROPOSTA_STATUS_LABEL: Record<PropostaStatus, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  approved: "Aprovada",
  rejected: "Recusada",
  expired: "Vencida",
  converted: "Virou pedido",
  cancelled: "Cancelada",
};
export const PEDIDO_STATUS_LABEL: Record<PedidoStatus, string> = {
  confirmed: "Confirmado",
  invoiced: "Faturado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};
export const FORMA_PAGAMENTO_LABEL: Record<FormaPagamento, string> = {
  boleto: "Boleto",
  pix: "PIX",
  cartao: "Cartão",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
  a_combinar: "A combinar",
};
export const AGENDA_TIPO_LABEL: Record<AgendaTipo, string> = {
  visita: "Visita",
  ligacao: "Ligação",
  reuniao: "Reunião",
  entrega: "Entrega",
  tarefa: "Tarefa",
  outro: "Outro",
};
