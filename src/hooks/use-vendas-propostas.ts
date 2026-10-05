/**
 * Força de vendas · propostas (lista, edição e ações), para a gestão e para o representante.
 *
 * O banco faz o trabalho pesado: número, dono, representante (quando quem grava é representante), total de cada item e
 * da proposta. Aqui só se grava o que a pessoa escolheu e se relê o que o banco calculou.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import type {
  FormaPagamento,
  VendasCliente,
  VendasProduto,
  VendasProposta,
  VendasPropostaItem,
  VendasRepresentante,
} from "@/lib/vendas/types";
import { hojeISO, somarDiasISO } from "@/components/vendas/propostas/calculos";

// O types.ts gerado não conhece as tabelas do módulo (ver src/lib/vendas/types.ts).
const db = supabase as any;

/** O PostgREST corta em 1000 linhas: busca em páginas até acabar. */
export async function buscarTodas<T>(montar: (de: number, ate: number) => any, pagina = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += pagina) {
    const { data, error } = await montar(de, de + pagina - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < pagina) break;
  }
  return out;
}

export type ClienteResumo = Pick<
  VendasCliente,
  "id" | "name" | "trade_name" | "company_name" | "cnpj" | "cpf" | "whatsapp" | "phone" | "email" | "city" | "state" | "representative_id"
>;

export type PropostaLinha = Pick<
  VendasProposta,
  | "id" | "number" | "status" | "customer_id" | "representative_id" | "valid_until" | "subtotal" | "total" | "created_at"
  | "sent_at" | "viewed_at" | "responded_at" | "order_id" | "public_token"
> & {
  customer: Pick<VendasCliente, "name" | "trade_name" | "company_name" | "city"> | null;
  rep: Pick<VendasRepresentante, "name"> | null;
};

export type PropostaCompleta = VendasProposta & {
  customer: VendasCliente | null;
  rep: Pick<VendasRepresentante, "id" | "name" | "phone" | "email"> | null;
  order: { id: string; number: string; status: string } | null;
};

export const chavesPropostas = {
  lista: (owner: string | null) => ["vendas-propostas", owner] as const,
  uma: (id: string | undefined) => ["vendas-proposta", id] as const,
};

export function useVendasPropostas() {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: chavesPropostas.lista(visibleUserId),
    enabled: !!visibleUserId,
    queryFn: () =>
      buscarTodas<PropostaLinha>((de, ate) =>
        db
          .from("vendas_propostas")
          .select(
            "id, number, status, customer_id, representative_id, valid_until, subtotal, total, created_at, sent_at, viewed_at, responded_at, order_id, public_token, customer:pdv_customers(name, trade_name, company_name, city), rep:vendas_representantes(name)",
          )
          .eq("user_id", visibleUserId)
          .order("created_at", { ascending: false })
          .range(de, ate),
      ),
  });
}

export function useVendasProposta(id: string | undefined) {
  return useQuery({
    queryKey: chavesPropostas.uma(id),
    enabled: !!id,
    queryFn: async () => {
      const [{ data: p, error }, { data: itens, error: e2 }] = await Promise.all([
        db
          .from("vendas_propostas")
          .select("*, customer:pdv_customers(*), rep:vendas_representantes(id, name, phone, email)")
          .eq("id", id)
          .maybeSingle(),
        db.from("vendas_proposta_itens").select("*").eq("proposta_id", id).order("position"),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      if (!p) return null;
      let order: PropostaCompleta["order"] = null;
      if (p.order_id) {
        const { data: o } = await db.from("vendas_pedidos").select("id, number, status").eq("id", p.order_id).maybeSingle();
        order = o ?? null;
      }
      return { proposta: { ...p, order } as PropostaCompleta, itens: (itens ?? []) as VendasPropostaItem[] };
    },
  });
}

/** Cadastro do representante logado (o desconto máximo dele limita a proposta). */
export function useMeuRepresentante() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["vendas-meu-representante", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db.from("vendas_representantes").select("*").eq("rep_user_id", user!.id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as VendasRepresentante | null;
    },
  });
}

export function useRepresentantesDaEmpresa(enabled = true) {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-representantes-lista", visibleUserId],
    enabled: enabled && !!visibleUserId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from("vendas_representantes")
        .select("id, name, phone, email, commission_percent, max_discount_percent, is_active")
        .eq("user_id", visibleUserId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Pick<
        VendasRepresentante,
        "id" | "name" | "phone" | "email" | "commission_percent" | "max_discount_percent" | "is_active"
      >[];
    },
  });
}

/** Clientes B2B (para o representante, as regras do banco já limitam à carteira dele). */
export function useClientesParaProposta() {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-clientes-proposta", visibleUserId],
    enabled: !!visibleUserId,
    staleTime: 60 * 1000,
    queryFn: () =>
      buscarTodas<ClienteResumo>((de, ate) =>
        db
          .from("pdv_customers")
          .select("id, name, trade_name, company_name, cnpj, cpf, whatsapp, phone, email, city, state, representative_id")
          .eq("user_id", visibleUserId)
          .or("is_b2b.eq.true,representative_id.not.is.null")
          .order("name")
          .range(de, ate),
      ),
  });
}

export type ProdutoParaProposta = Pick<
  VendasProduto,
  "id" | "name" | "description" | "category" | "image_url" | "price_balcao" | "price_b2b" | "sku" | "sales_unit" | "min_qty" | "pack_qty" | "ean"
>;

export function useProdutosParaProposta() {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-produtos-proposta", visibleUserId],
    enabled: !!visibleUserId,
    staleTime: 60 * 1000,
    queryFn: () =>
      buscarTodas<ProdutoParaProposta>((de, ate) =>
        db
          .from("pdv_products")
          .select("id, name, description, category, image_url, price_balcao, price_b2b, sku, sales_unit, min_qty, pack_qty, ean")
          .eq("user_id", visibleUserId)
          .eq("b2b_enabled", true)
          .order("name")
          .range(de, ate),
      ),
  });
}

export interface PropostaMarca {
  name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  cnpj: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

/** Marca do estabelecimento (função vendas_marca, que o representante também pode ler). */
export async function carregarMarca(owner: string): Promise<PropostaMarca> {
  const { data, error } = await db.rpc("vendas_marca", { p_owner: owner });
  if (!error && data) return data as PropostaMarca;
  const { data: b } = await db
    .from("business_settings")
    .select("business_name, logo_url, primary_color")
    .eq("user_id", owner)
    .maybeSingle();
  return {
    name: b?.business_name ?? null,
    logo_url: b?.logo_url ?? null,
    primary_color: b?.primary_color ?? null,
    cnpj: null,
    phone: null,
    address: null,
    city: null,
    state: null,
  };
}

export function useMarcaDaEmpresa() {
  const { visibleUserId } = useEstablishmentId();
  return useQuery({
    queryKey: ["vendas-marca", visibleUserId],
    enabled: !!visibleUserId,
    staleTime: 10 * 60 * 1000,
    queryFn: () => carregarMarca(visibleUserId!),
  });
}

// ── Gravação ────────────────────────────────────────────────────────────────

export interface ItemRascunho {
  /** id da linha no banco; vazio para item novo. */
  id?: string;
  /** chave local estável para a lista na tela. */
  key: string;
  product_id: string | null;
  description: string;
  image_url: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  /** Preço de tabela do produto (o representante não mexe no preço de item do catálogo). */
  preco_tabela?: number | null;
  min_qty?: number | null;
  pack_qty?: number | null;
  sku?: string | null;
}

export interface PropostaRascunho {
  customer_id: string | null;
  representative_id: string | null;
  valid_until: string | null;
  payment_method: FormaPagamento | null;
  installments: number;
  first_due_days: number;
  interval_days: number;
  payment_terms: string;
  delivery_date: string | null;
  delivery_terms: string;
  notes: string;
  internal_notes: string;
  discount_amount: number;
  shipping_amount: number;
  itens: ItemRascunho[];
}

export const VALIDADE_PADRAO_DIAS = 7;

export function rascunhoVazio(): PropostaRascunho {
  return {
    customer_id: null,
    representative_id: null,
    valid_until: somarDiasISO(hojeISO(), VALIDADE_PADRAO_DIAS),
    payment_method: "boleto",
    installments: 1,
    first_due_days: 30,
    interval_days: 30,
    payment_terms: "",
    delivery_date: null,
    delivery_terms: "",
    notes: "",
    internal_notes: "",
    discount_amount: 0,
    shipping_amount: 0,
    itens: [],
  };
}

const texto = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

function cabecalho(r: PropostaRascunho, modo: "gestao" | "representante") {
  const base: Record<string, unknown> = {
    customer_id: r.customer_id,
    valid_until: r.valid_until || null,
    payment_method: r.payment_method,
    installments: Math.min(24, Math.max(1, Math.trunc(r.installments || 1))),
    first_due_days: Math.min(365, Math.max(0, Math.trunc(r.first_due_days || 0))),
    interval_days: Math.min(365, Math.max(1, Math.trunc(r.interval_days || 30))),
    payment_terms: texto(r.payment_terms),
    delivery_date: r.delivery_date || null,
    delivery_terms: texto(r.delivery_terms),
    notes: texto(r.notes),
    internal_notes: texto(r.internal_notes),
    discount_amount: Math.max(0, Number(r.discount_amount) || 0),
    shipping_amount: Math.max(0, Number(r.shipping_amount) || 0),
  };
  // O representante nunca escolhe o representante: o banco grava o dele.
  if (modo === "gestao") base.representative_id = r.representative_id || null;
  return base;
}

function linhaItem(i: ItemRascunho, position: number) {
  return {
    position,
    product_id: i.product_id,
    description: i.description.trim(),
    image_url: i.image_url,
    unit: texto(i.unit),
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    discount_percent: Math.min(100, Math.max(0, Number(i.discount_percent) || 0)),
  };
}

/**
 * Grava a proposta: cabeçalho primeiro (o banco preenche número, dono e representante) e depois os itens, como
 * diferença do que já estava no banco. Devolve o id.
 */
export async function salvarProposta(opts: {
  id?: string;
  rascunho: PropostaRascunho;
  modo: "gestao" | "representante";
  itensNoBanco?: VendasPropostaItem[];
}): Promise<string> {
  const { rascunho, modo } = opts;
  const head = cabecalho(rascunho, modo);
  let id = opts.id;
  if (!id) {
    const { data, error } = await db.from("vendas_propostas").insert(head).select("id").single();
    if (error) throw error;
    id = data.id as string;
  } else {
    const { error } = await db.from("vendas_propostas").update(head).eq("id", id);
    if (error) throw error;
  }

  const antes = new Map((opts.itensNoBanco ?? []).map((i) => [i.id, i]));
  const ficam = new Set(rascunho.itens.filter((i) => i.id).map((i) => i.id!));
  const remover = [...antes.keys()].filter((k) => !ficam.has(k));
  if (remover.length) {
    const { error } = await db.from("vendas_proposta_itens").delete().in("id", remover);
    if (error) throw error;
  }
  const novos: Record<string, unknown>[] = [];
  for (const [idx, item] of rascunho.itens.entries()) {
    const linha = linhaItem(item, idx + 1);
    if (item.id && antes.has(item.id)) {
      const a = antes.get(item.id)!;
      const mudou =
        a.position !== linha.position ||
        a.description !== linha.description ||
        (a.unit ?? null) !== linha.unit ||
        Number(a.quantity) !== linha.quantity ||
        Number(a.unit_price) !== linha.unit_price ||
        Number(a.discount_percent) !== linha.discount_percent ||
        (a.product_id ?? null) !== (linha.product_id ?? null) ||
        (a.image_url ?? null) !== (linha.image_url ?? null);
      if (mudou) {
        const { error } = await db.from("vendas_proposta_itens").update(linha).eq("id", item.id);
        if (error) throw error;
      }
    } else {
      novos.push({ ...linha, proposta_id: id });
    }
  }
  if (novos.length) {
    const { error } = await db.from("vendas_proposta_itens").insert(novos);
    if (error) throw error;
  }
  return id!;
}

export async function mudarStatusProposta(id: string, status: "sent" | "cancelled" | "draft") {
  const patch: Record<string, unknown> = { status };
  if (status === "sent") patch.sent_at = new Date().toISOString();
  const { error } = await db.from("vendas_propostas").update(patch).eq("id", id);
  if (error) throw error;
}

export async function converterProposta(id: string): Promise<string> {
  const { data, error } = await db.rpc("vendas_converter_proposta", { p_proposta: id });
  if (error) throw error;
  return data as string;
}

/** Nova proposta (rascunho) com o mesmo cliente, condições e itens. */
export async function duplicarProposta(
  p: VendasProposta,
  itens: VendasPropostaItem[],
  modo: "gestao" | "representante",
): Promise<string> {
  const dias =
    p.valid_until && p.created_at
      ? Math.max(1, Math.round((Date.parse(p.valid_until) - Date.parse(p.created_at.slice(0, 10))) / 86400000))
      : VALIDADE_PADRAO_DIAS;
  const rascunho: PropostaRascunho = {
    customer_id: p.customer_id,
    representative_id: p.representative_id,
    valid_until: somarDiasISO(hojeISO(), dias),
    payment_method: p.payment_method,
    installments: p.installments,
    first_due_days: p.first_due_days,
    interval_days: p.interval_days,
    payment_terms: p.payment_terms ?? "",
    delivery_date: null,
    delivery_terms: p.delivery_terms ?? "",
    notes: p.notes ?? "",
    internal_notes: p.internal_notes ?? "",
    discount_amount: Number(p.discount_amount),
    shipping_amount: Number(p.shipping_amount),
    itens: itens.map((i) => ({
      key: crypto.randomUUID(),
      product_id: i.product_id,
      description: i.description,
      image_url: i.image_url,
      unit: i.unit,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      discount_percent: Number(i.discount_percent),
    })),
  };
  return salvarProposta({ rascunho, modo });
}

export interface RespostaEnvio {
  ok: boolean;
  message?: string;
  error?: string;
  code?: string;
}

/**
 * Envio da proposta pelo canal da loja (function vendas-enviar, que só aceita kind "proposta" ou "cobranca"; o
 * pedido é compartilhado pelo próprio celular). Rascunho enviado vira "sent" no servidor. Se a function não responder,
 * a tela segue com o link + WhatsApp do celular.
 */
export async function enviarPelaLoja(id: string, channel: "whatsapp" | "email"): Promise<RespostaEnvio> {
  const { data, error } = await supabase.functions.invoke("vendas-enviar", { body: { kind: "proposta", id, channel } });
  if (error) {
    let msg = "O envio pela loja não está disponível agora.";
    try {
      const ctx = (error as any)?.context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        msg = body?.message || body?.error || msg;
      }
    } catch {
      /* resposta sem corpo */
    }
    return { ok: false, message: msg };
  }
  const r = (data ?? {}) as RespostaEnvio;
  return { ...r, ok: !!r.ok, message: r.message || r.error };
}

export function useInvalidarPropostas() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: ["vendas-propostas"] });
    qc.invalidateQueries({ queryKey: ["vendas-pedidos"] });
    if (id) qc.invalidateQueries({ queryKey: chavesPropostas.uma(id) });
  };
}
