/**
 * Agregadores puros: (linhas cruas, filtros) => blocos do relatório.
 * Sem React e sem Supabase de propósito — dá para testar chamando a função.
 */
import { dateOnly, diffDays, prevDateWindow, withinDateOnly } from "./dates";
import { isPackagingUnit, normalizeUnit, priceKey } from "./units";
import type {
  AbcBlock, AbcRow, CatalogIngredient, CatalogSupplier, Confidence, DataQuality,
  PriceSeries, PriceVariationBlock, PriceVariationRow, PurchaseKpis, PurchaseLine,
  PurchaseReportFilters, PurchaseStatus, QuotationBlock, RawPurchaseItem,
  ReceivingBlock, ReceivingDivergence, SupplierBlock, SupplierRow,
} from "./types";
import type {
  RawQuotationItem, RawQuotationRequest, RawSupplierLink,
} from "./fetchers";

/**
 * Variação percentual que ADMITE não ter resposta.
 * pctDelta() de report-period.ts devolve 1 quando a base é zero — para preço
 * isso vira um "+100%" que significa apenas "não comprou antes", e esse ruído
 * domina qualquer ranking. Aqui, sem base, o resultado é null.
 */
export function safeDelta(cur: number, prev: number | null | undefined): number | null {
  if (prev == null || prev <= 0 || cur <= 0) return null;
  return (cur - prev) / prev;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Taxa que devolve null em vez de 0 quando não há denominador. */
const rate = (part: number, whole: number): number | null =>
  whole > 0 ? part / whole : null;

// ------------------------------------------------------------------ linhas

export function buildLines(
  raw: RawPurchaseItem[],
  suppliers: CatalogSupplier[],
  ingredients: CatalogIngredient[],
  filters: PurchaseReportFilters,
): PurchaseLine[] {
  const supMap = new Map(suppliers.map((s) => [s.id, s]));
  const ingMap = new Map(ingredients.map((i) => [i.id, i]));

  const start = dateOnly(filters.start);
  const end = dateOnly(filters.end);
  const prev = prevDateWindow(filters.start, filters.end);
  const prevStart = dateOnly(prev.start);
  const prevEnd = dateOnly(prev.end);

  const lines: PurchaseLine[] = [];

  for (const r of raw) {
    const o = r.order;
    if (!o) continue; // sem pai não há escopo nem data: descartar
    const status = (o.status ?? "draft") as PurchaseStatus;
    if (status === "cancelled" || status === "draft") continue;

    const orderDate = (o.order_date ?? "").slice(0, 10);
    if (!orderDate) continue;

    const actual = o.actual_delivery ? o.actual_delivery.slice(0, 10) : null;
    const effective = actual ?? orderDate;

    const quantity = num(r.quantity);
    const unitPriceRaw = num(r.unit_price);
    const totalRaw = num(r.total_price);
    // unit_price e total_price são gravados separadamente pelo app e podem
    // divergir; o unitário manda, e a divergência é contada em dataQuality.
    const unitPrice = unitPriceRaw > 0 ? unitPriceRaw : quantity > 0 ? totalRaw / quantity : 0;
    const total = totalRaw > 0 ? totalRaw : unitPrice * quantity;

    const sup = r.order.supplier_id ? supMap.get(r.order.supplier_id) : undefined;
    const ing = ingMap.get(r.ingredient_id);
    const unitRaw = r.unit ?? ing?.unit ?? "";

    lines.push({
      item_id: r.id,
      order_id: o.id,
      order_number: o.order_number ?? "—",
      status,
      supplier_id: o.supplier_id,
      supplier_name: sup?.name ?? (o.supplier_id ? "Fornecedor removido" : "Sem fornecedor"),
      supplier_category: sup?.category ?? null,
      ingredient_id: r.ingredient_id,
      ingredient_name: ing?.name ?? "Insumo removido",
      ingredient_category: ing?.category ?? null,
      unit_raw: unitRaw,
      unit: normalizeUnit(unitRaw),
      key: priceKey(r.ingredient_id, unitRaw),
      quantity,
      quantity_received: num(r.quantity_received),
      unit_price: unitPrice,
      total_price: total,
      order_freight: num(o.freight),
      order_date: orderDate,
      expected_delivery: o.expected_delivery ? o.expected_delivery.slice(0, 10) : null,
      actual_delivery: actual,
      effective_date: effective,
      in_period: withinDateOnly(effective, start, end),
      in_prev_period: withinDateOnly(effective, prevStart, prevEnd),
      closed_incomplete: !!o.closed_incomplete,
      closure_reason: o.closure_reason,
      quotation_response_id: r.quotation_response_id,
      price_inconsistent:
        unitPriceRaw > 0 && totalRaw > 0 && Math.abs(unitPriceRaw * quantity - totalRaw) > 0.01,
    });
  }

  return lines;
}

/** Filtros de fornecedor/categoria/insumo são aplicados aqui, em memória.
 *  Aplicá-los na query truncaria o histórico e faria "a compra anterior"
 *  apontar para a compra errada. */
export function applyFilters(lines: PurchaseLine[], f: PurchaseReportFilters): PurchaseLine[] {
  const sup = f.supplierIds?.length ? new Set(f.supplierIds) : null;
  const cat = f.supplierCategories?.length ? new Set(f.supplierCategories) : null;
  const ing = f.ingredientIds?.length ? new Set(f.ingredientIds) : null;
  const ingCat = f.ingredientCategories?.length ? new Set(f.ingredientCategories) : null;
  if (!sup && !cat && !ing && !ingCat) return lines;
  return lines.filter(
    (l) =>
      (!sup || (l.supplier_id && sup.has(l.supplier_id))) &&
      (!cat || (l.supplier_category && cat.has(l.supplier_category))) &&
      (!ing || ing.has(l.ingredient_id)) &&
      (!ingCat || (l.ingredient_category && ingCat.has(l.ingredient_category))),
  );
}

// ------------------------------------------------------------------- KPIs

export function buildKpis(lines: PurchaseLine[]): PurchaseKpis {
  const inPeriod = lines.filter((l) => l.in_period);
  const orders = new Map<string, PurchaseLine>();
  inPeriod.forEach((l) => orders.set(l.order_id, l));

  const spend = inPeriod.reduce((s, l) => s + l.total_price, 0);
  const spendPrev = lines.filter((l) => l.in_prev_period).reduce((s, l) => s + l.total_price, 0);

  // Frete é do pedido e vem repetido em cada item: somar uma vez por pedido.
  const freight = [...orders.values()].reduce((s, l) => s + l.order_freight, 0);

  return {
    orders: orders.size,
    spend,
    avgOrder: orders.size > 0 ? spend / orders.size : 0,
    freight,
    freightPct: rate(freight, spend),
    suppliers: new Set(inPeriod.map((l) => l.supplier_id ?? "sem")).size,
    ingredients: new Set(inPeriod.map((l) => l.ingredient_id)).size,
    spendPrev,
    spendDeltaPct: safeDelta(spend, spendPrev),
  };
}

// -------------------------------------------------- bloco 1 · variação de preço

const confidenceOf = (lifetime: number, days: number | null): Confidence => {
  if (lifetime >= 3 && days != null && days <= 90) return "alta";
  if (lifetime === 2 || (days != null && days <= 180)) return "media";
  return "baixa";
};

export function buildPriceVariation(
  lines: PurchaseLine[],
  filters: PurchaseReportFilters,
): PriceVariationBlock {
  const minPurchases = filters.minPurchases ?? 2;
  const minDelta = filters.minDeltaPct ?? 0.05;

  // Uma série por (insumo + unidade). Comparar "kg" com "cx" é inválido.
  const series = new Map<string, PurchaseLine[]>();
  for (const l of lines) {
    if (l.unit_price <= 0) continue;
    const arr = series.get(l.key);
    if (arr) arr.push(l);
    else series.set(l.key, [l]);
  }

  // Insumo comprado em mais de uma unidade: marcar, porque a comparação por
  // série está certa mas o total do insumo não é somável entre unidades.
  const unitsByIngredient = new Map<string, Set<string>>();
  for (const l of lines) {
    const set = unitsByIngredient.get(l.ingredient_id) ?? new Set<string>();
    set.add(l.unit);
    unitsByIngredient.set(l.ingredient_id, set);
  }

  const rows: PriceVariationRow[] = [];
  let noBase = 0;

  for (const [key, group] of series) {
    const sorted = [...group].sort((a, b) =>
      a.effective_date === b.effective_date
        ? a.order_number.localeCompare(b.order_number)
        : a.effective_date.localeCompare(b.effective_date),
    );

    // A última compra DENTRO do período é o ponto que interessa; a base é a
    // compra imediatamente anterior, venha ela de antes do período ou não.
    const lastIdx = sorted.map((l) => l.in_period).lastIndexOf(true);
    if (lastIdx === -1) continue; // não comprou no período: fora do relatório

    const last = sorted[lastIdx];
    const prev = lastIdx > 0 ? sorted[lastIdx - 1] : null;

    const inPeriod = sorted.filter((l) => l.in_period);
    const qtyPeriod = inPeriod.reduce((s, l) => s + l.quantity, 0);
    const spendPeriod = inPeriod.reduce((s, l) => s + l.total_price, 0);

    const deltaPct = safeDelta(last.unit_price, prev?.unit_price ?? null);
    if (deltaPct == null) noBase += 1;

    const deltaAbs = prev ? last.unit_price - prev.unit_price : null;
    const days = prev ? diffDays(prev.effective_date, last.effective_date) : null;
    const units = unitsByIngredient.get(last.ingredient_id);

    rows.push({
      key,
      ingredient_id: last.ingredient_id,
      ingredient_name: last.ingredient_name,
      unit: last.unit,
      last_price: last.unit_price,
      last_date: last.effective_date,
      last_supplier_name: last.supplier_name,
      prev_price: prev?.unit_price ?? null,
      prev_date: prev?.effective_date ?? null,
      prev_supplier_name: prev?.supplier_name ?? null,
      delta_pct: deltaPct,
      delta_abs: deltaAbs,
      days_between: days,
      qty_period: qtyPeriod,
      spend_period: spendPeriod,
      impact_brl: deltaAbs != null ? deltaAbs * qtyPeriod : null,
      purchases_period: inPeriod.length,
      purchases_lifetime: sorted.length,
      suppliers_count: new Set(sorted.map((l) => l.supplier_id ?? "sem")).size,
      supplier_changed: !!prev && prev.supplier_id !== last.supplier_id,
      multi_unit: (units?.size ?? 1) > 1,
      // Não existe tamanho de embalagem no cadastro: caixa de 12 vs de 24 do
      // mesmo insumo aparece como +100% que não é aumento de preço.
      suspect_packaging:
        deltaPct != null && Math.abs(deltaPct) > 0.6 && isPackagingUnit(last.unit),
      confidence: confidenceOf(sorted.length, days),
    });
  }

  const eligible = rows.filter(
    (r) =>
      r.delta_pct != null &&
      r.purchases_lifetime >= minPurchases &&
      Math.abs(r.delta_pct) >= minDelta,
  );
  const clean = eligible.filter((r) => !r.suspect_packaging);
  const byImpact = (a: PriceVariationRow, b: PriceVariationRow) =>
    Math.abs(b.impact_brl ?? 0) - Math.abs(a.impact_brl ?? 0);

  const ups = clean.filter((r) => (r.delta_pct ?? 0) > 0).sort(byImpact);
  const downs = clean.filter((r) => (r.delta_pct ?? 0) < 0).sort(byImpact);

  // Por fornecedor, só com CESTA COMPARÁVEL: insumos que ele vendeu nas duas
  // pontas. Sem isso o número mede mudança de mix, não negociação.
  const bySupplierMap = new Map<
    string,
    { name: string; basket: number; weighted: number; weight: number; impact: number }
  >();
  for (const r of clean) {
    if (r.supplier_changed || !r.last_supplier_name) continue;
    const id = r.last_supplier_name;
    const acc = bySupplierMap.get(id) ?? { name: id, basket: 0, weighted: 0, weight: 0, impact: 0 };
    acc.basket += 1;
    acc.weighted += (r.delta_pct ?? 0) * r.spend_period;
    acc.weight += r.spend_period;
    acc.impact += r.impact_brl ?? 0;
    bySupplierMap.set(id, acc);
  }

  return {
    rows,
    topIncreases: ups.slice(0, 15),
    topDecreases: downs.slice(0, 15),
    suspects: eligible.filter((r) => r.suspect_packaging).sort(byImpact),
    totals: {
      impactUp: ups.reduce((s, r) => s + (r.impact_brl ?? 0), 0),
      impactDown: downs.reduce((s, r) => s + (r.impact_brl ?? 0), 0),
      net: clean.reduce((s, r) => s + (r.impact_brl ?? 0), 0),
    },
    sample: {
      series: rows.length,
      comparable: rows.filter((r) => r.delta_pct != null).length,
      noBase,
      warning: rows.filter((r) => r.delta_pct != null).length < 10,
    },
    bySupplier: [...bySupplierMap.values()]
      .map((v) => ({
        supplier_id: null,
        name: v.name,
        basket_size: v.basket,
        weighted_delta_pct: v.weight > 0 ? v.weighted / v.weight : null,
        impact_brl: v.impact,
      }))
      .sort((a, b) => Math.abs(b.impact_brl) - Math.abs(a.impact_brl)),
  };
}

/** Série temporal de um insumo. Não precisa de query: já está no lookback. */
export function buildPriceSeries(lines: PurchaseLine[], key: string): PriceSeries | null {
  const group = lines.filter((l) => l.key === key && l.unit_price > 0);
  if (!group.length) return null;
  return {
    key,
    ingredient_name: group[0].ingredient_name,
    unit: group[0].unit,
    points: group
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
      .map((l) => ({
        date: l.effective_date,
        unit_price: l.unit_price,
        quantity: l.quantity,
        supplier_name: l.supplier_name,
        order_number: l.order_number,
      })),
  };
}

// ---------------------------------------------------- bloco 2 · fornecedores

export function buildSuppliers(
  lines: PurchaseLine[],
  catalog: CatalogSupplier[],
): SupplierBlock {
  const inPeriod = lines.filter((l) => l.in_period);
  const supCatalog = new Map(catalog.map((s) => [s.id, s]));

  const acc = new Map<string, {
    row: SupplierRow;
    orders: Set<string>;
    leads: number[];
    promised: number[];
    qtyOrdered: number;
    qtyReceived: number;
  }>();

  for (const l of inPeriod) {
    const id = l.supplier_id ?? "sem-fornecedor";
    let e = acc.get(id);
    if (!e) {
      const cat = l.supplier_id ? supCatalog.get(l.supplier_id) : undefined;
      e = {
        row: {
          supplier_id: l.supplier_id,
          name: l.supplier_name,
          category: l.supplier_category,
          orders: 0, items: 0, spend: 0, share: 0,
          avg_lead_days: null, promised_lead_days: null,
          on_time: 0, late: 0, measurable: 0, on_time_pct: null,
          fill_rate: null,
          minimum_order: cat?.minimum_order ?? null,
          below_minimum_orders: 0,
        },
        orders: new Set(), leads: [], promised: [], qtyOrdered: 0, qtyReceived: 0,
      };
      acc.set(id, e);
    }
    e.row.items += 1;
    e.row.spend += l.total_price;
    e.qtyOrdered += l.quantity;
    e.qtyReceived += l.quantity_received;
    e.orders.add(l.order_id);
  }

  // Prazo é do PEDIDO, não do item: percorrer pedidos únicos.
  const seen = new Set<string>();
  for (const l of inPeriod) {
    if (seen.has(l.order_id)) continue;
    seen.add(l.order_id);
    const e = acc.get(l.supplier_id ?? "sem-fornecedor");
    if (!e) continue;
    if (l.actual_delivery) {
      e.leads.push(diffDays(l.order_date, l.actual_delivery));
      if (l.expected_delivery) {
        e.row.measurable += 1;
        if (l.actual_delivery <= l.expected_delivery) e.row.on_time += 1;
        else e.row.late += 1;
      }
    }
    if (l.expected_delivery) e.promised.push(diffDays(l.order_date, l.expected_delivery));

    const orderTotal = inPeriod
      .filter((x) => x.order_id === l.order_id)
      .reduce((s, x) => s + x.total_price, 0);
    if (e.row.minimum_order && e.row.minimum_order > 0 && orderTotal < e.row.minimum_order) {
      e.row.below_minimum_orders += 1;
    }
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const totalSpend = inPeriod.reduce((s, l) => s + l.total_price, 0);

  const rows = [...acc.values()]
    .map((e) => ({
      ...e.row,
      orders: e.orders.size,
      share: totalSpend > 0 ? e.row.spend / totalSpend : 0,
      avg_lead_days: avg(e.leads),
      promised_lead_days: avg(e.promised),
      on_time_pct: rate(e.row.on_time, e.row.measurable),
      fill_rate: rate(e.qtyReceived, e.qtyOrdered),
    }))
    .sort((a, b) => b.spend - a.spend);

  // Insumo com fonte única é risco de abastecimento, não estatística.
  const supplierByIngredient = new Map<string, Set<string>>();
  for (const l of inPeriod) {
    const set = supplierByIngredient.get(l.ingredient_id) ?? new Set<string>();
    set.add(l.supplier_id ?? "sem");
    supplierByIngredient.set(l.ingredient_id, set);
  }

  return {
    rows,
    top3Share: rows.slice(0, 3).reduce((s, r) => s + r.share, 0),
    hhi: rows.reduce((s, r) => s + r.share * r.share, 0),
    activeSuppliers: rows.length,
    singleSourceIngredients: [...supplierByIngredient.values()].filter((s) => s.size === 1).length,
  };
}

// ------------------------------------------------------------ bloco 5 · ABC

export function buildAbc(lines: PurchaseLine[]): AbcBlock {
  const inPeriod = lines.filter((l) => l.in_period);
  const byIngredient = new Map<string, AbcRow & { _suppliers: Set<string> }>();

  for (const l of inPeriod) {
    let r = byIngredient.get(l.ingredient_id);
    if (!r) {
      r = {
        ingredient_id: l.ingredient_id, name: l.ingredient_name, unit: l.unit,
        spend: 0, share: 0, cum_share: 0, abc: "C",
        purchases: 0, suppliers: 0, qty: 0, avg_price: 0,
        _suppliers: new Set<string>(),
      };
      byIngredient.set(l.ingredient_id, r);
    }
    r.spend += l.total_price;
    r.qty += l.quantity;
    r.purchases += 1;
    r._suppliers.add(l.supplier_id ?? "sem");
  }

  const total = inPeriod.reduce((s, l) => s + l.total_price, 0);
  const rows = [...byIngredient.values()].sort((a, b) => b.spend - a.spend);

  let cum = 0;
  const summary = {
    A: { count: 0, spend: 0, share: 0 },
    B: { count: 0, spend: 0, share: 0 },
    C: { count: 0, spend: 0, share: 0 },
  };

  const out: AbcRow[] = rows.map((r) => {
    const share = total > 0 ? r.spend / total : 0;
    cum += share;
    const abc: "A" | "B" | "C" = cum <= 0.8 ? "A" : cum <= 0.95 ? "B" : "C";
    summary[abc].count += 1;
    summary[abc].spend += r.spend;
    const { _suppliers, ...rest } = r;
    return {
      ...rest,
      suppliers: _suppliers.size,
      avg_price: r.qty > 0 ? r.spend / r.qty : 0,
      share,
      cum_share: cum,
      abc,
    };
  });

  (["A", "B", "C"] as const).forEach((k) => {
    summary[k].share = total > 0 ? summary[k].spend / total : 0;
  });

  return { rows: out, summary };
}

// ------------------------------------------------------ bloco 3 · cotações

export function buildQuotations(
  requests: RawQuotationRequest[],
  items: RawQuotationItem[],
  links: RawSupplierLink[],
  invites: Array<{ quotation_item_id: string; supplier_id: string }>,
  suppliers: CatalogSupplier[],
): QuotationBlock {
  const supMap = new Map(suppliers.map((s) => [s.id, s]));

  const hours: number[] = [];
  for (const l of links) {
    if (l.sent_at && l.submitted_at) {
      const h = (new Date(l.submitted_at).getTime() - new Date(l.sent_at).getTime()) / 3_600_000;
      if (h >= 0) hours.push(h);
    }
  }
  hours.sort((a, b) => a - b);

  let itemsWithoutOffer = 0;
  let itemsSingle = 0;
  let itemsComparable = 0;
  let savingsVsAvg = 0;
  let savingsVsMax = 0;
  let overpayVsMin = 0;
  let corrections = 0;
  const refusalCount = new Map<string, number>();

  const perSupplier = new Map<string, { responded: number; wins: number; refusals: number }>();

  for (const item of items) {
    const all = item.responses ?? [];
    const qty = num(item.quantity_needed);

    for (const r of all) {
      const e = perSupplier.get(r.supplier_id) ?? { responded: 0, wins: 0, refusals: 0 };
      e.responded += 1;
      if (r.is_winner) e.wins += 1;
      if (r.unavailable_reason) {
        e.refusals += 1;
        refusalCount.set(r.unavailable_reason, (refusalCount.get(r.unavailable_reason) ?? 0) + 1);
      }
      if (r.original_unit_price != null) corrections += 1;
      perSupplier.set(r.supplier_id, e);
    }

    // Recusa não é oferta: fica fora de qualquer conta de preço.
    const offers = all.filter((r) => !r.unavailable_reason && num(r.unit_price) > 0);
    if (offers.length === 0) {
      itemsWithoutOffer += 1;
      continue;
    }
    if (offers.length === 1) {
      itemsSingle += 1;
      continue;
    }

    itemsComparable += 1;
    const prices = offers.map((o) => num(o.unit_price));
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const max = Math.max(...prices);
    const min = Math.min(...prices);
    // Sem vencedor marcado, assume-se a mais barata — senão o item sumiria da
    // conta de economia só porque ninguém clicou em "selecionar".
    const winner = offers.find((o) => o.is_winner);
    const chosen = winner ? num(winner.unit_price) : min;

    savingsVsAvg += (avg - chosen) * qty;
    savingsVsMax += (max - chosen) * qty;
    overpayVsMin += (chosen - min) * qty;
  }

  const invitedBySupplier = new Map<string, Set<string>>();
  for (const inv of invites) {
    const set = invitedBySupplier.get(inv.supplier_id) ?? new Set<string>();
    set.add(inv.quotation_item_id);
    invitedBySupplier.set(inv.supplier_id, set);
  }

  const hoursBySupplier = new Map<string, number[]>();
  for (const l of links) {
    if (!l.sent_at || !l.submitted_at) continue;
    const h = (new Date(l.submitted_at).getTime() - new Date(l.sent_at).getTime()) / 3_600_000;
    if (h < 0) continue;
    const arr = hoursBySupplier.get(l.supplier_id) ?? [];
    arr.push(h);
    hoursBySupplier.set(l.supplier_id, arr);
  }

  const supplierIds = new Set([
    ...perSupplier.keys(),
    ...invitedBySupplier.keys(),
    ...links.map((l) => l.supplier_id),
  ]);

  const bySupplier = [...supplierIds]
    .map((id) => {
      const stats = perSupplier.get(id) ?? { responded: 0, wins: 0, refusals: 0 };
      const invited = invitedBySupplier.get(id)?.size ?? 0;
      const hs = hoursBySupplier.get(id) ?? [];
      return {
        supplier_id: id,
        name: supMap.get(id)?.name ?? "Fornecedor removido",
        invited,
        responded: stats.responded,
        response_rate: rate(stats.responded, invited),
        wins: stats.wins,
        refusals: stats.refusals,
        avg_response_hours: hs.length ? hs.reduce((s, h) => s + h, 0) / hs.length : null,
      };
    })
    .sort((a, b) => b.responded - a.responded);

  const submitted = links.filter((l) => l.status === "submitted" || l.submitted_at).length;

  return {
    requests: requests.length,
    itemsQuoted: items.length,
    linksSent: links.length,
    linksSubmitted: submitted,
    responseRate: rate(submitted, links.length),
    avgResponseHours: hours.length ? hours.reduce((s, h) => s + h, 0) / hours.length : null,
    medianResponseHours: hours.length ? hours[Math.floor(hours.length / 2)] : null,
    itemsWithoutOffer,
    itemsWithSingleOffer: itemsSingle,
    itemsComparable,
    savingsVsAvg,
    savingsVsMax,
    overpayVsMin,
    refusals: [...refusalCount.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    corrections,
    bySupplier,
  };
}

// -------------------------------------------------- bloco 4 · recebimentos

export function buildReceiving(
  lines: PurchaseLine[],
  events: Array<{ purchase_order_id: string }>,
): ReceivingBlock {
  const inPeriod = lines.filter((l) => l.in_period);
  const orders = new Map<string, PurchaseLine>();
  inPeriod.forEach((l) => orders.set(l.order_id, l));

  let onTime = 0;
  let late = 0;
  let measurable = 0;
  const delays: number[] = [];
  const closedIncomplete: ReceivingBlock["closedIncomplete"] = [];

  for (const o of orders.values()) {
    if (o.actual_delivery && o.expected_delivery) {
      measurable += 1;
      if (o.actual_delivery <= o.expected_delivery) onTime += 1;
      else {
        late += 1;
        delays.push(diffDays(o.expected_delivery, o.actual_delivery));
      }
    }
    if (o.closed_incomplete) {
      const missing = inPeriod
        .filter((l) => l.order_id === o.order_id && l.quantity_received < l.quantity)
        .reduce((s, l) => s + (l.quantity - l.quantity_received) * l.unit_price, 0);
      closedIncomplete.push({
        order_number: o.order_number,
        supplier: o.supplier_name,
        date: o.actual_delivery ?? o.order_date,
        reason: o.closure_reason ?? "sem motivo informado",
        missing_value: missing,
      });
    }
  }

  const divergences: ReceivingDivergence[] = inPeriod
    .filter(
      (l) =>
        (l.status === "received" || l.status === "partial") &&
        Math.abs(l.quantity_received - l.quantity) > 0.0001,
    )
    .map((l) => {
      const diff = l.quantity_received - l.quantity;
      return {
        order_number: l.order_number,
        supplier: l.supplier_name,
        ingredient: l.ingredient_name,
        unit: l.unit,
        ordered: l.quantity,
        received: l.quantity_received,
        diff,
        kind: diff < 0 ? ("falta" as const) : ("sobra" as const),
        value_diff: diff * l.unit_price,
      };
    })
    .sort((a, b) => Math.abs(b.value_diff) - Math.abs(a.value_diff));

  const received = [...orders.values()].filter((o) => o.status === "received").length;
  const partial = [...orders.values()].filter((o) => o.status === "partial").length;

  const qrOrders = new Set(events.map((e) => e.purchase_order_id));
  const qr = [...orders.keys()].filter((id) => qrOrders.has(id)).length;

  const qtyOrdered = inPeriod.reduce((s, l) => s + l.quantity, 0);
  const qtyReceived = inPeriod.reduce((s, l) => s + l.quantity_received, 0);

  return {
    ordersInPeriod: orders.size,
    received,
    partial,
    pending: orders.size - received - partial,
    onTime,
    late,
    measurable,
    onTimePct: rate(onTime, measurable),
    avgDelayDays: delays.length ? delays.reduce((s, d) => s + d, 0) / delays.length : null,
    qtyOrdered,
    qtyReceived,
    fillRate: rate(qtyReceived, qtyOrdered),
    divergences,
    closedIncomplete,
    // O recebimento pelo painel não grava evento: quem tem evento veio do QR.
    channels: { qr, painel: received + partial - qr },
  };
}

// ------------------------------------------------------- qualidade dos dados

export function buildDataQuality(
  lines: PurchaseLine[],
  suppliers: CatalogSupplier[],
): DataQuality {
  const inPeriod = lines.filter((l) => l.in_period);
  const unitsByIngredient = new Map<string, Set<string>>();
  for (const l of lines) {
    const set = unitsByIngredient.get(l.ingredient_id) ?? new Set<string>();
    set.add(l.unit);
    unitsByIngredient.set(l.ingredient_id, set);
  }
  const orders = new Map(inPeriod.map((l) => [l.order_id, l]));

  return {
    itemsWithoutPrice: inPeriod.filter((l) => l.unit_price <= 0).length,
    priceInconsistencies: inPeriod.filter((l) => l.price_inconsistent).length,
    multiUnitIngredients: [...unitsByIngredient.values()].filter((s) => s.size > 1).length,
    ordersWithoutExpectedDelivery: [...orders.values()].filter((l) => !l.expected_delivery).length,
    ordersWithoutSupplier: [...orders.values()].filter((l) => !l.supplier_id).length,
    // Query vazia COM catálogo vazio quase sempre é permissão, não ausência de
    // compra — distinguir os dois evita caça a fantasma.
    likelyPermissionIssue: lines.length === 0 && suppliers.length === 0,
  };
}
