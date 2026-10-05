/**
 * Asaas do estabelecimento (Força de vendas).
 *
 * Cada estabelecimento conecta a PRÓPRIA conta do Asaas: a chave fica no cofre do banco (vendas_asaas_gravar /
 * vendas_asaas_chave, só com a chave de serviço) e nunca volta para a tela. Este módulo concentra o que as funções
 * vendas-asaas e vendas-asaas-webhook têm em comum:
 *
 *   · o cliente HTTP da API v3 (header `access_token`, User-Agent obrigatório para contas novas);
 *   · a tradução do cadastro de cliente do PDV para o cliente do Asaas;
 *   · a regra que aplica um pagamento do Asaas numa conta a receber (`mapearPagamento`), usada IGUAL pelo webhook e
 *     pela sincronização manual. Ter uma regra só é o que impede a sincronização de baixar diferente do webhook.
 *
 * Nada aqui toca o banco nem lê `Deno` no carregamento: dá para testar fora do runtime com um fetch falso.
 */

export type AsaasEnv = "production" | "sandbox";

export const ASAAS_BASE: Record<AsaasEnv, string> = {
  production: "https://api.asaas.com/v3",
  sandbox: "https://api-sandbox.asaas.com/v3",
};

export const AMBIENTE_ROTULO: Record<AsaasEnv, string> = {
  production: "produção",
  sandbox: "sandbox (testes)",
};

/**
 * Eventos assinados no webhook. Não existe evento "PAYMENT_RECEIVED_IN_CASH": o recebimento em dinheiro chega como
 * PAYMENT_RECEIVED com status RECEIVED_IN_CASH, e o desfazer chega como PAYMENT_RECEIVED_IN_CASH_UNDONE. Mandar um
 * nome que o Asaas não conhece faz o cadastro do webhook inteiro ser recusado.
 */
export const EVENTOS_WEBHOOK = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
];

/** Situações do Asaas em que o dinheiro do cliente já entrou (ou foi confirmado no cartão). */
export const STATUS_RECEBIDO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"]);

export const TIPOS_COBRANCA = ["BOLETO", "PIX", "CREDIT_CARD", "UNDEFINED"] as const;
export type TipoCobranca = (typeof TIPOS_COBRANCA)[number];

/** O formato novo da chave diz o ambiente: $aact_prod_… é produção, $aact_hmlg_… é sandbox. Chave antiga: null. */
export function ambienteDaChave(chave: string): AsaasEnv | null {
  if (/^\$?aact_prod_/i.test(chave)) return "production";
  if (/^\$?aact_hmlg_/i.test(chave)) return "sandbox";
  return null;
}

export interface AsaasResposta<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Mensagem pronta para a tela, em português. */
  erro?: string;
  /** Código do Asaas (ex.: invalid_access_token) ou "network"/"timeout". */
  codigo?: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class Asaas {
  readonly base: string;

  constructor(
    private readonly chave: string,
    readonly ambiente: AsaasEnv,
    private readonly fetchImpl: FetchLike = (i, init) => fetch(i, init),
    private readonly timeoutMs = 15000,
  ) {
    this.base = ASAAS_BASE[ambiente];
  }

  async req<T = any>(method: string, path: string, body?: unknown): Promise<AsaasResposta<T>> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Velara PDV",
          access_token: this.chave,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      const timeout = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      return {
        ok: false,
        status: 0,
        data: null,
        codigo: timeout ? "timeout" : "network",
        erro: "O Asaas não respondeu. Tente de novo em instantes.",
      };
    }

    const texto = await res.text().catch(() => "");
    let data: any = null;
    try {
      data = texto ? JSON.parse(texto) : null;
    } catch { /* corpo não JSON */ }

    if (res.ok) return { ok: true, status: res.status, data };
    const { codigo, erro } = traduzirErro(res.status, data);
    return { ok: false, status: res.status, data, codigo, erro };
  }

  /** Dados comerciais da conta: valida a chave e devolve nome e documento. */
  conta() {
    return this.req("GET", "/myAccount/commercialInfo/");
  }
  saldo() {
    return this.req("GET", "/finance/balance");
  }
  carteiras() {
    return this.req("GET", "/wallets/");
  }
  webhooks() {
    return this.req("GET", "/webhooks?limit=100");
  }
  criarWebhook(body: Record<string, unknown>) {
    return this.req("POST", "/webhooks", body);
  }
  apagarWebhook(id: string) {
    return this.req("DELETE", `/webhooks/${encodeURIComponent(id)}`);
  }
  criarCliente(body: Record<string, unknown>) {
    return this.req("POST", "/customers", body);
  }
  /** Clientes da conta com este CPF/CNPJ (para reaproveitar quem a loja já cadastrou no Asaas). */
  clientesPorDocumento(cpfCnpj: string) {
    return this.req("GET", `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}&limit=10`);
  }
  criarCobranca(body: Record<string, unknown>) {
    return this.req("POST", "/payments", body);
  }
  cobranca(id: string) {
    return this.req("GET", `/payments/${encodeURIComponent(id)}`);
  }
  apagarCobranca(id: string) {
    return this.req("DELETE", `/payments/${encodeURIComponent(id)}`);
  }
  pixQrCode(id: string) {
    return this.req("GET", `/payments/${encodeURIComponent(id)}/pixQrCode`);
  }
}

/** O Asaas já escreve as descrições em português; aqui só se cobre o que vem sem descrição ou é genérico demais. */
export function traduzirErro(status: number, data: any): { codigo: string; erro: string } {
  const primeiro = Array.isArray(data?.errors) ? data.errors[0] : null;
  const codigo = String(primeiro?.code ?? `http_${status}`);
  const descricao = typeof primeiro?.description === "string" ? primeiro.description.trim() : "";

  if (status === 401 || codigo === "invalid_access_token") {
    return { codigo: "invalid_access_token", erro: "Chave de API do Asaas inválida." };
  }
  if (status === 403) {
    return { codigo, erro: descricao || "A conta do Asaas não permite esta operação com esta chave." };
  }
  if (status === 404) {
    return { codigo: codigo === `http_${status}` ? "not_found" : codigo, erro: descricao || "Registro não encontrado no Asaas." };
  }
  if (status === 429) {
    return { codigo, erro: "O Asaas pediu uma pausa entre as requisições. Tente de novo em um minuto." };
  }
  if (status >= 500) {
    return { codigo, erro: "O Asaas está instável no momento. Tente de novo em instantes." };
  }
  return { codigo, erro: descricao || `O Asaas recusou a operação (HTTP ${status}).` };
}

// ── Cliente ────────────────────────────────────────────────────────────────

export const soDigitos = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

export interface ClientePdv {
  id: string;
  name: string | null;
  person_type?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  company_name?: string | null;
  trade_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  cep?: string | null;
  street?: string | null;
  address_number?: string | null;
  complement?: string | null;
  district?: string | null;
  state_registration?: string | null;
  asaas_customer_id?: string | null;
}

/** CPF (11) ou CNPJ (14) só com dígitos. PJ prefere o CNPJ; PF prefere o CPF. */
export function documentoDoCliente(c: ClientePdv): string | null {
  const cnpj = soDigitos(c.cnpj);
  const cpf = soDigitos(c.cpf);
  const ordem = c.person_type === "PF" ? [cpf, cnpj] : [cnpj, cpf];
  for (const d of ordem) if (d.length === 11 || d.length === 14) return d;
  return null;
}

/** Celular no formato que o Asaas aceita: DDD + número, sem o 55. */
export function telefoneAsaas(v: unknown): string | undefined {
  let d = soDigitos(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : undefined;
}

const emailValido = (v: unknown): string | undefined => {
  const e = String(v ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined;
};

export function nomeDoCliente(c: ClientePdv): string {
  const pj = c.person_type === "PJ" || soDigitos(c.cnpj).length === 14;
  const nome = pj ? c.company_name || c.trade_name || c.name : c.name || c.trade_name || c.company_name;
  return String(nome ?? "").trim() || "Cliente";
}

/** Corpo do POST /customers. `externalReference` = id do cliente no PDV (é o que permite achar de volta). */
export function clienteParaAsaas(c: ClientePdv): Record<string, unknown> | null {
  const cpfCnpj = documentoDoCliente(c);
  if (!cpfCnpj) return null;
  const pj = cpfCnpj.length === 14;
  const celular = telefoneAsaas(c.whatsapp) ?? telefoneAsaas(c.phone);
  const fixo = telefoneAsaas(c.phone);
  const body: Record<string, unknown> = {
    name: nomeDoCliente(c).slice(0, 100),
    cpfCnpj,
    externalReference: c.id,
  };
  const empresa = pj ? (c.trade_name || c.company_name || "").trim() : "";
  if (empresa) body.company = empresa.slice(0, 100);
  const email = emailValido(c.email);
  if (email) body.email = email;
  if (celular) body.mobilePhone = celular;
  if (fixo && fixo !== celular) body.phone = fixo;
  const cep = soDigitos(c.cep);
  if (cep.length === 8) body.postalCode = cep;
  if (c.street?.trim()) body.address = c.street.trim();
  if (c.address_number?.trim()) body.addressNumber = c.address_number.trim();
  if (c.complement?.trim()) body.complement = c.complement.trim();
  if (c.district?.trim()) body.province = c.district.trim();
  if (pj && c.state_registration?.trim()) body.stateInscription = c.state_registration.trim();
  return body;
}

// ── Datas ──────────────────────────────────────────────────────────────────

/** Hoje no fuso de São Paulo, em AAAA-MM-DD (o vencimento do Asaas é uma data, sem hora). */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** O Asaas recusa vencimento no passado: parcela já vencida é cobrada para hoje. */
export function vencimentoParaAsaas(due: string | null | undefined, hoje: string): string {
  const d = String(due ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= hoje ? d : hoje;
}

// ── Pagamento → conta a receber ────────────────────────────────────────────

export interface TxAsaas {
  id: string;
  status: string;
  amount: number | string;
  asaas_payment_id: string | null;
  asaas_status: string | null;
  charge_url?: string | null;
  bank_slip_url?: string | null;
  pix_payload?: string | null;
  net_amount?: number | string | null;
  fee_amount?: number | string | null;
  gross_amount?: number | string | null;
}

export interface PagamentoAsaas {
  id: string;
  status?: string;
  deleted?: boolean;
  value?: number;
  netValue?: number;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  externalReference?: string | null;
}

const dataValida = (v: unknown): string | null => {
  const d = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * O que muda na conta a receber quando chega um pagamento do Asaas (pelo webhook ou pela sincronização).
 * Devolve só os campos que mudam; objeto vazio = nada a gravar (é isso que torna o webhook repetido inofensivo).
 *
 * Regras:
 *   · recebido/confirmado e a conta em aberto (pending/overdue) → paga, com a data em que o cliente pagou e a taxa do
 *     Asaas (valor − líquido). Conta cancelada não é reaberta por aqui: o Asaas fica registrado e a gestão decide.
 *   · vencido e a conta pendente → overdue.
 *   · estorno (ou recebimento em dinheiro desfeito) de conta paga → volta a pending; o gatilho do banco cancela a
 *     comissão que ainda não foi paga ao representante.
 *   · apagada no Asaas → asaas_status DELETED e os links somem (não servem mais para pagar).
 *   · pagamento de uma cobrança ANTIGA (o id não é o atual da conta): só a baixa vale; links e situação ficam os da
 *     cobrança atual.
 *
 * Uma conta paga à mão no PDV nunca volta a pending por causa de um evento comum do Asaas: só estorno explícito
 * desfaz baixa.
 */
export function mapearPagamento(
  tx: TxAsaas,
  p: PagamentoAsaas,
  evento: string | null,
  hoje: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const mesmaCobranca = !tx.asaas_payment_id || tx.asaas_payment_id === p.id;
  const apagada = p.deleted === true || evento === "PAYMENT_DELETED";
  const situacao = apagada ? "DELETED" : String(p.status ?? "").toUpperCase();
  const emAberto = tx.status === "pending" || tx.status === "overdue";
  const recebido = !apagada && STATUS_RECEBIDO.has(situacao);

  if (mesmaCobranca) {
    if (!tx.asaas_payment_id && p.id) patch.asaas_payment_id = p.id;
    if (situacao && situacao !== tx.asaas_status) patch.asaas_status = situacao;
    if (apagada) {
      if (tx.charge_url) patch.charge_url = null;
      if (tx.bank_slip_url) patch.bank_slip_url = null;
      if (tx.pix_payload) patch.pix_payload = null;
    } else {
      if (p.invoiceUrl && p.invoiceUrl !== tx.charge_url) patch.charge_url = p.invoiceUrl;
      if (p.bankSlipUrl && p.bankSlipUrl !== tx.bank_slip_url) patch.bank_slip_url = p.bankSlipUrl;
    }
  }

  if (recebido && emAberto) {
    patch.status = "paid";
    patch.payment_date =
      dataValida(p.clientPaymentDate) ?? dataValida(p.paymentDate) ?? dataValida(p.confirmedDate) ?? hoje;
  }

  // Taxa do Asaas: na confirmação do cartão o líquido ainda é estimado; o RECEIVED que vem depois corrige.
  if (recebido && mesmaCobranca && (emAberto || tx.status === "paid") && typeof p.netValue === "number") {
    const bruto = typeof p.value === "number" ? p.value : Number(tx.amount);
    const liquido = centavos(p.netValue);
    const taxa = Math.max(0, centavos(bruto - liquido));
    if (Number(tx.net_amount) !== liquido) patch.net_amount = liquido;
    if (Number(tx.gross_amount) !== centavos(bruto)) patch.gross_amount = centavos(bruto);
    if (Number(tx.fee_amount) !== taxa) patch.fee_amount = taxa;
  }

  if (mesmaCobranca && !apagada && situacao === "OVERDUE" && tx.status === "pending") {
    patch.status = "overdue";
  }

  const estorno =
    situacao === "REFUNDED" || evento === "PAYMENT_REFUNDED" || evento === "PAYMENT_RECEIVED_IN_CASH_UNDONE";
  if (mesmaCobranca && estorno && tx.status === "paid") {
    const valor = centavos(Number(tx.amount) || 0);
    patch.status = "pending";
    patch.payment_date = null;
    patch.net_amount = valor;
    patch.gross_amount = valor;
    patch.fee_amount = 0;
  }

  return patch;
}
