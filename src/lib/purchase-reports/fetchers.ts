/**
 * Busca dos dados dos relatórios de compras.
 *
 * FONTE DO GASTO E DO PREÇO: apenas pedidos de compra (pdv_purchase_orders +
 * pdv_purchase_order_items). A entrada por NF-e (InvoiceReviewWizard) é um
 * segundo funil de entrada de mercadoria — somar os dois duplicaria o gasto.
 *
 * NÃO usar pdv_stock_movements como fonte de preço: seu `unit_cost` é cópia
 * literal de pdv_purchase_order_items.unit_price (ver a função
 * pdv_receive_purchase_order_core), não tem coluna de unidade, e só existe
 * desde 16/07/2026. Ele serve para saber QUANDO o recebimento aconteceu.
 *
 * Tudo é agregado em memória. Nos volumes atuais (centenas de linhas) isso é
 * instantâneo. GATILHO PARA MIGRAR PARA RPC: passar de ~20 mil itens de pedido
 * na janela de lookback — aí a paginação vira dezenas de round-trips e vale um
 * RPC com `lag(unit_price) over (partition by ingredient_id, unit order by ...)`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CatalogIngredient, CatalogSupplier, RawPurchaseItem } from "./types";

/** Tabelas/colunas ausentes de src/integrations/supabase/types.ts moram aqui. */
const sbAny = supabase as any;

const PAGE = 1000;

/**
 * PostgREST devolve no máximo 1000 linhas por requisição, em silêncio.
 * Sem paginar, um relatório grande simplesmente mostra números menores.
 */
export async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** `.in()` com lista grande estoura o tamanho da URL. */
export async function chunked<T>(
  ids: string[],
  size: number,
  run: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(...(await run(ids.slice(i, i + size))));
  }
  return out;
}

const ITEM_SELECT = `
  id, ingredient_id, quantity, quantity_received, unit, unit_price, total_price,
  quotation_response_id,
  order:pdv_purchase_orders!inner(
    id, order_number, user_id, supplier_id, status,
    order_date, expected_delivery, actual_delivery,
    subtotal, freight, total, closed_incomplete, closure_reason
  )
`;

/**
 * Espinha dorsal: itens de pedido numa janela LARGA (o lookback inteiro), não
 * só o período selecionado. Sem o histórico anterior não existe "compra
 * anterior" para comparar, que é a métrica principal do relatório.
 *
 * `fromDate`/`toDate` são strings "YYYY-MM-DD" — order_date é coluna DATE.
 * A tabela filha não tem user_id: o escopo vem do !inner no pai.
 */
export async function fetchPurchaseLines(
  visibleUserId: string,
  fromDate: string,
  toDate: string,
): Promise<RawPurchaseItem[]> {
  return pageAll<RawPurchaseItem>((from, to) =>
    supabase
      .from("pdv_purchase_order_items")
      .select(ITEM_SELECT)
      .eq("order.user_id", visibleUserId)
      .neq("order.status", "cancelled")
      .gte("order.order_date", fromDate)
      .lte("order.order_date", toDate)
      .order("id", { ascending: true }) // ordem estável, senão a paginação repete/pula
      .range(from, to) as any,
  );
}

/**
 * Catálogos. Cache separado do período de propósito: alimentam os selects de
 * filtro e a hidratação de nomes, e não precisam refazer quando o usuário mexe
 * na data. Hidratação por Map, nunca por join !inner — join dropa a linha
 * inteira em silêncio quando o insumo foi apagado.
 */
export async function fetchCatalogs(visibleUserId: string): Promise<{
  suppliers: CatalogSupplier[];
  ingredients: CatalogIngredient[];
}> {
  const [suppliers, ingredients] = await Promise.all([
    pageAll<CatalogSupplier>((from, to) =>
      supabase
        .from("pdv_suppliers")
        .select("id, name, category, is_active, minimum_order")
        .eq("user_id", visibleUserId)
        .order("id", { ascending: true })
        .range(from, to) as any,
    ),
    pageAll<CatalogIngredient>((from, to) =>
      supabase
        .from("pdv_ingredients")
        .select("id, name, unit, category")
        .eq("user_id", visibleUserId)
        .order("id", { ascending: true })
        .range(from, to) as any,
    ),
  ]);
  return { suppliers, ingredients };
}

// ------------------------------------------------------------ bloco 3 · cotações

export interface RawQuotationRequest {
  id: string;
  request_number: string | null;
  status: string | null;
  deadline: string | null;
  created_at: string;
}

export interface RawQuotationItem {
  id: string;
  quotation_request_id: string;
  ingredient_id: string;
  quantity_needed: number | null;
  unit: string | null;
  responses: Array<{
    id: string;
    supplier_id: string;
    unit_price: number | null;
    is_winner: boolean | null;
    unavailable_reason: string | null;
    original_unit_price: number | null;
    corrected_at: string | null;
    created_at: string | null;
  }> | null;
}

export interface RawSupplierLink {
  quotation_request_id: string;
  supplier_id: string;
  status: string | null;
  sent_at: string | null;
  submitted_at: string | null;
}

/**
 * Cotações do período. `created_at` é timestamptz — aqui vale brtRange, não o
 * dateOnly usado nas colunas DATE dos pedidos.
 */
export async function fetchQuotationData(
  visibleUserId: string,
  startISO: string,
  endISO: string,
): Promise<{
  requests: RawQuotationRequest[];
  items: RawQuotationItem[];
  links: RawSupplierLink[];
  invites: Array<{ quotation_item_id: string; supplier_id: string }>;
}> {
  const requests = await pageAll<RawQuotationRequest>((from, to) =>
    supabase
      .from("pdv_quotation_requests")
      .select("id, request_number, status, deadline, created_at")
      .eq("user_id", visibleUserId)
      .gte("created_at", startISO)
      .lte("created_at", endISO)
      .order("id", { ascending: true })
      .range(from, to) as any,
  );

  const ids = requests.map((r) => r.id);
  if (!ids.length) return { requests, items: [], links: [], invites: [] };

  const items = await chunked<RawQuotationItem>(ids, 100, (chunk) =>
    pageAll<RawQuotationItem>((from, to) =>
      supabase
        .from("pdv_quotation_items")
        .select(`
          id, quotation_request_id, ingredient_id, quantity_needed, unit,
          responses:pdv_quotation_responses(
            id, supplier_id, unit_price, is_winner, unavailable_reason,
            original_unit_price, corrected_at, created_at
          )
        `)
        .in("quotation_request_id", chunk)
        .order("id", { ascending: true })
        .range(from, to) as any,
    ),
  );

  // pdv_quotation_supplier_links não está nos types gerados: cast isolado aqui.
  const links = await chunked<RawSupplierLink>(ids, 100, (chunk) =>
    pageAll<RawSupplierLink>((from, to) =>
      sbAny
        .from("pdv_quotation_supplier_links")
        .select("quotation_request_id, supplier_id, status, sent_at, submitted_at")
        .eq("user_id", visibleUserId)
        .in("quotation_request_id", chunk)
        .order("quotation_request_id", { ascending: true })
        .range(from, to),
    ),
  );

  const itemIds = items.map((i) => i.id);
  const invites = itemIds.length
    ? await chunked<{ quotation_item_id: string; supplier_id: string }>(itemIds, 200, (chunk) =>
        pageAll<{ quotation_item_id: string; supplier_id: string }>((from, to) =>
          supabase
            .from("pdv_quotation_item_suppliers")
            .select("quotation_item_id, supplier_id")
            .in("quotation_item_id", chunk)
            .order("quotation_item_id", { ascending: true })
            .range(from, to) as any,
        ),
      )
    : [];

  return { requests, items, links, invites };
}

// -------------------------------------------------------- bloco 4 · recebimentos

export interface RawReceiptEvent {
  purchase_order_id: string;
  actor_name: string | null;
  created_at: string;
}

/**
 * Eventos de recebimento pelo QR público. O recebimento pelo painel NÃO grava
 * aqui — por isso "canal" é derivado: pedido com evento = QR, sem evento = painel.
 */
export async function fetchReceiptEvents(
  visibleUserId: string,
  startISO: string,
  endISO: string,
): Promise<RawReceiptEvent[]> {
  return pageAll<RawReceiptEvent>((from, to) =>
    sbAny
      .from("pdv_receipt_events")
      .select("purchase_order_id, actor_name, created_at")
      .eq("user_id", visibleUserId)
      .gte("created_at", startISO)
      .lte("created_at", endISO)
      .order("created_at", { ascending: true })
      .range(from, to),
  );
}

export { sbAny };
