/**
 * Tipos dos relatórios de compras.
 *
 * Regra que vale em todos os blocos: TAXA é `number | null`, nunca 0 por falta
 * de denominador. "0% no prazo" e "não dá para medir" são coisas diferentes, e
 * confundir as duas é o jeito mais rápido de um relatório perder a confiança.
 */

export type PurchaseStatus =
  | "draft" | "sent" | "confirmed" | "partial" | "received" | "cancelled";

/** `${ingredient_id}|${unidade normalizada}` — ver units.ts */
export type PriceKey = string;

export interface PurchaseReportFilters {
  start: Date;
  end: Date;
  supplierIds?: string[];
  supplierCategories?: string[];
  ingredientIds?: string[];
  ingredientCategories?: string[];
  /** Mínimo de compras na vida para o insumo entrar no ranking. Default 2. */
  minPurchases?: number;
  /** Variação mínima em módulo para entrar no ranking. Default 0.05 (5%). */
  minDeltaPct?: number;
  /** Meses de histórico buscados para achar "a compra anterior". Default 12. */
  lookbackMonths?: number;
}

// ---------------------------------------------------------------- linha crua

/** Uma linha = um item de um pedido de compra, já hidratado e datado. */
export interface PurchaseLine {
  item_id: string;
  order_id: string;
  order_number: string;
  status: PurchaseStatus;

  supplier_id: string | null;
  supplier_name: string;
  supplier_category: string | null;

  ingredient_id: string;
  ingredient_name: string;
  /** Categoria do INSUMO (pdv_ingredients.category), não a do fornecedor. */
  ingredient_category: string | null;
  unit_raw: string;
  unit: string;
  key: PriceKey;

  quantity: number;
  quantity_received: number;
  unit_price: number;
  total_price: number;
  /** Do PEDIDO, repetido em cada item: só somar por order_id único. */
  order_freight: number;

  order_date: string;                 // "YYYY-MM-DD"
  expected_delivery: string | null;
  actual_delivery: string | null;
  /** actual_delivery ?? order_date — é por esta data que tudo é posicionado. */
  effective_date: string;

  in_period: boolean;
  in_prev_period: boolean;

  closed_incomplete: boolean;
  closure_reason: string | null;
  quotation_response_id: string | null;

  /** |unit_price * quantity - total_price| > 0.01 — os dois campos divergem. */
  price_inconsistent: boolean;
}

// ------------------------------------------------------- bloco 1 · variação

export type Confidence = "alta" | "media" | "baixa";

export interface PriceVariationRow {
  key: PriceKey;
  ingredient_id: string;
  ingredient_name: string;
  unit: string;

  last_price: number;
  last_date: string;
  last_supplier_name: string | null;

  prev_price: number | null;
  prev_date: string | null;
  prev_supplier_name: string | null;

  /** null quando não há base de comparação. NUNCA 0 ou 1 nesse caso. */
  delta_pct: number | null;
  delta_abs: number | null;
  days_between: number | null;

  qty_period: number;
  spend_period: number;
  /** delta_abs × quantidade comprada no período. É por aqui que se ordena. */
  impact_brl: number | null;

  purchases_period: number;
  purchases_lifetime: number;
  suppliers_count: number;
  supplier_changed: boolean;
  /** O insumo foi comprado em mais de uma unidade — comparar exige cuidado. */
  multi_unit: boolean;
  /** Variação grande em unidade de embalagem: provável troca de embalagem. */
  suspect_packaging: boolean;
  confidence: Confidence;
}

export interface PricePoint {
  date: string;
  unit_price: number;
  quantity: number;
  supplier_name: string;
  order_number: string;
}

export interface PriceSeries {
  key: PriceKey;
  ingredient_name: string;
  unit: string;
  points: PricePoint[];
}

export interface SupplierPriceDelta {
  supplier_id: string | null;
  name: string;
  /** Só insumos que ele vendeu nas DUAS pontas — senão mede mudança de mix. */
  basket_size: number;
  weighted_delta_pct: number | null;
  impact_brl: number;
}

export interface PriceVariationBlock {
  rows: PriceVariationRow[];
  topIncreases: PriceVariationRow[];
  topDecreases: PriceVariationRow[];
  suspects: PriceVariationRow[];
  totals: { impactUp: number; impactDown: number; net: number };
  sample: {
    series: number;
    comparable: number;
    noBase: number;
    warning: boolean;
  };
  bySupplier: SupplierPriceDelta[];
}

// ---------------------------------------------------- bloco 2 · fornecedores

export interface SupplierRow {
  supplier_id: string | null;
  name: string;
  category: string | null;
  orders: number;
  items: number;
  spend: number;
  share: number;
  avg_lead_days: number | null;
  promised_lead_days: number | null;
  on_time: number;
  late: number;
  measurable: number;
  on_time_pct: number | null;
  fill_rate: number | null;
  minimum_order: number | null;
  below_minimum_orders: number;
}

export interface SupplierBlock {
  rows: SupplierRow[];
  top3Share: number;
  hhi: number;
  activeSuppliers: number;
  singleSourceIngredients: number;
}

// --------------------------------------------------------- bloco 5 · ABC

export interface AbcRow {
  ingredient_id: string;
  name: string;
  unit: string;
  spend: number;
  share: number;
  cum_share: number;
  abc: "A" | "B" | "C";
  purchases: number;
  suppliers: number;
  qty: number;
  avg_price: number;
}

export interface AbcBlock {
  rows: AbcRow[];
  summary: Record<"A" | "B" | "C", { count: number; spend: number; share: number }>;
}

// ------------------------------------------------------------ bloco 3 · cotações

export interface QuotationSupplierRow {
  supplier_id: string;
  name: string;
  invited: number;
  responded: number;
  response_rate: number | null;
  wins: number;
  refusals: number;
  avg_response_hours: number | null;
}

export interface QuotationBlock {
  requests: number;
  itemsQuoted: number;
  linksSent: number;
  linksSubmitted: number;
  responseRate: number | null;
  avgResponseHours: number | null;
  medianResponseHours: number | null;
  itemsWithoutOffer: number;
  itemsWithSingleOffer: number;
  itemsComparable: number;
  /** Vencedor vs média das ofertas do item. Só itens com 2+ ofertas. */
  savingsVsAvg: number;
  /** Teto teórico (vs oferta mais cara). Rotular como POTENCIAL, nunca economia. */
  savingsVsMax: number;
  /** Escolheu quem não era o mais barato: quanto isso custou. */
  overpayVsMin: number;
  refusals: Array<{ reason: string; count: number }>;
  corrections: number;
  bySupplier: QuotationSupplierRow[];
}

// -------------------------------------------------------- bloco 4 · recebimentos

export interface ReceivingDivergence {
  order_number: string;
  supplier: string;
  ingredient: string;
  unit: string;
  ordered: number;
  received: number;
  diff: number;
  kind: "falta" | "sobra";
  value_diff: number;
}

export interface ReceivingBlock {
  ordersInPeriod: number;
  received: number;
  partial: number;
  pending: number;
  onTime: number;
  late: number;
  measurable: number;
  onTimePct: number | null;
  avgDelayDays: number | null;
  qtyOrdered: number;
  qtyReceived: number;
  fillRate: number | null;
  divergences: ReceivingDivergence[];
  closedIncomplete: Array<{
    order_number: string;
    supplier: string;
    date: string;
    reason: string;
    missing_value: number;
  }>;
  channels: { qr: number; painel: number };
}

// ----------------------------------------------------------------- fachada

export interface PurchaseKpis {
  orders: number;
  spend: number;
  avgOrder: number;
  freight: number;
  freightPct: number | null;
  suppliers: number;
  ingredients: number;
  spendPrev: number;
  spendDeltaPct: number | null;
}

export interface DataQuality {
  itemsWithoutPrice: number;
  priceInconsistencies: number;
  multiUnitIngredients: number;
  ordersWithoutExpectedDelivery: number;
  ordersWithoutSupplier: number;
  /** Todas as queries vazias E catálogo vazio = provável falta de permissão. */
  likelyPermissionIssue: boolean;
}

export interface PurchaseReportsData {
  lines: PurchaseLine[];
  kpis: PurchaseKpis;
  price: PriceVariationBlock;
  suppliers: SupplierBlock;
  abc: AbcBlock;
  receiving: ReceivingBlock;
  dataQuality: DataQuality;
}

// ------------------------------------------- linhas cruas vindas do Supabase

export interface RawPurchaseItem {
  id: string;
  ingredient_id: string;
  quantity: number | null;
  quantity_received: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  quotation_response_id: string | null;
  order: {
    id: string;
    order_number: string | null;
    user_id: string;
    supplier_id: string | null;
    status: string | null;
    order_date: string | null;
    expected_delivery: string | null;
    actual_delivery: string | null;
    subtotal: number | null;
    freight: number | null;
    total: number | null;
    closed_incomplete: boolean | null;
    closure_reason: string | null;
  } | null;
}

export interface CatalogSupplier {
  id: string;
  name: string;
  category: string | null;
  is_active: boolean | null;
  minimum_order: number | null;
}

export interface CatalogIngredient {
  id: string;
  name: string;
  unit: string | null;
  category: string | null;
}
