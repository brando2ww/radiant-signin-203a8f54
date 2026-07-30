// DeliveryMuch · ingestão de pedidos
//
// Dois modos de entrada:
//   · sweep  · chamado pelo pg_cron com o header x-sweep-secret, varre todos os
//              tenants conectados. É o que faz o pedido chegar sozinho.
//   · ações  · chamado pelo PDV com JWT do usuário: sync_now, accept, ready,
//              cancel, seed_payment_map.
//
// Regra que rege o desenho: pedido não aceito em 15 minutos é cancelado pela
// plataforma E a loja é colocada offline. Por isso o polling é curto e o aceite
// automático existe. Em contrapartida, a documentação é explícita: depois de
// aceito, o restaurante não consegue mais cancelar pela API, só a franquia.
// Daí a trava de caixa aberto antes de aceitar qualquer coisa.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  DmError,
  type DmEnv,
  dmApi,
  dmCors,
  dmJson,
  dmLog,
  dmRequireUser,
  dmValidToken,
  serviceClient,
} from "../_shared/deliverymuch.ts";

const SOURCE = "deliverymuch";

// ── mapeamento de estados ───────────────────────────────────────────────────
// status/stage da plataforma -> vocabulário de delivery_orders daqui
function mapStatus(status: string, stage: string): string {
  if (status === "CANCELED") return "cancelled";
  if (status === "CLOSED") return "completed";
  switch (stage) {
    case "WAITING_PAYMENT":
    case "WAITING_COMPANY":
      return "pending";
    case "CONFIRMED":
      return "preparing";
    case "READY":
      return "ready";
    case "DELIVERED":
      return "completed";
    default:
      return "pending";
  }
}

/**
 * Lê o primeiro caminho que existir no objeto.
 *
 * A coleção da DeliveryMuch documenta os campos de filtro (`payment.total_price`,
 * `delivery_form.method` e afins) mas não publica o payload completo do pedido,
 * e o sandbox está fora do ar, então não deu para conferir contra um pedido de
 * verdade. Os caminhos alternativos abaixo são defensivos de propósito: o
 * payload cru fica salvo em external_payload para ajustar isso na primeira
 * ingestão real.
 */
// deno-lint-ignore no-explicit-any
function pick(obj: any, paths: string[], fallback: any = null) {
  for (const path of paths) {
    let cur = obj;
    let ok = true;
    for (const part of path.split(".")) {
      if (cur && typeof cur === "object" && part in cur) cur = cur[part];
      else { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return fallback;
}

// deno-lint-ignore no-explicit-any
function money(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ── pagamentos ──────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
function paymentKey(order: any): { key: string; method: string; cardName: string | null } {
  const method = String(pick(order, ["payment.payment_form.method", "payment.method"], "MONEY"));
  const cardId = pick(order, ["payment.payment_form.card.id", "payment.card.id"], null);
  const cardName = pick(order, ["payment.payment_form.card.name", "payment.card.name"], null);
  return {
    key: method === "MACHINE" && cardId !== null ? `MACHINE:${cardId}` : method,
    method,
    cardName: cardName ? String(cardName) : null,
  };
}

/** Palpite honesto quando o cliente ainda não configurou o de-para. */
function defaultPaymentMethod(method: string, cardName: string | null): { payment_method: string; is_prepaid: boolean } {
  if (method === "ONLINE") return { payment_method: "online", is_prepaid: true };
  if (method === "MACHINE") {
    const name = (cardName ?? "").toLowerCase();
    if (name.includes("débito") || name.includes("debito")) return { payment_method: "debit", is_prepaid: false };
    if (name.includes("vale") || name.includes("alimentação") || name.includes("refeição")) {
      return { payment_method: "voucher", is_prepaid: false };
    }
    return { payment_method: "credit", is_prepaid: false };
  }
  return { payment_method: "cash", is_prepaid: false };
}

async function resolvePayment(
  supabase: SupabaseClient,
  userId: string,
  // deno-lint-ignore no-explicit-any
  order: any,
): Promise<{ payment_method: string; payment_status: string }> {
  const { key, method, cardName } = paymentKey(order);

  const { data: mapped } = await supabase
    .from("deliverymuch_payment_map")
    .select("payment_method, is_prepaid")
    .eq("user_id", userId)
    .eq("external_key", key)
    .maybeSingle();

  const resolved = mapped ?? defaultPaymentMethod(method, cardName);

  return {
    payment_method: resolved.payment_method,
    // pago online não pode entrar como "a receber na porta", senão o caixa não fecha
    payment_status: resolved.is_prepaid ? "paid" : "pending",
  };
}

// ── produtos ────────────────────────────────────────────────────────────────
/**
 * Descreve as escolhas do cliente (tamanho, sabores, adicionais) em uma linha
 * legível para a comanda impressa. A estrutura é grupo -> subgrupo -> itens,
 * conforme o documento "Organização e valor dos produtos".
 */
// deno-lint-ignore no-explicit-any
function describeOptions(product: any): string | null {
  const parts: string[] = [];

  const size = pick(product, ["size_options.size.name", "size_option.size.name", "size.name"], null);
  if (size) parts.push(String(size));

  const groups = pick(product, ["groups"], []) as unknown[];
  if (Array.isArray(groups)) {
    for (const group of groups) {
      // deno-lint-ignore no-explicit-any
      const subgroups = pick(group as any, ["subgroups"], []) as unknown[];
      if (!Array.isArray(subgroups)) continue;
      for (const subgroup of subgroups) {
        // deno-lint-ignore no-explicit-any
        const items = pick(subgroup as any, ["items"], []) as unknown[];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          // deno-lint-ignore no-explicit-any
          const name = pick(item as any, ["name", "product.name"], null);
          // deno-lint-ignore no-explicit-any
          const qty = Number(pick(item as any, ["quantity"], 1)) || 1;
          if (name) parts.push(qty > 1 ? `${qty}x ${name}` : String(name));
        }
      }
    }
  }

  return parts.length ? parts.join(" · ") : null;
}

/**
 * Registra o produto externo na fila de vinculação e devolve o vínculo local,
 * se já existir. Item sem vínculo nunca impede o pedido de entrar.
 */
async function resolveProduct(
  supabase: SupabaseClient,
  userId: string,
  externalId: string,
  externalName: string,
  defaultCenterId: string | null,
): Promise<{ delivery_product_id: string | null; production_center_id: string | null }> {
  const { data: existing } = await supabase
    .from("deliverymuch_product_map")
    .select("delivery_product_id, production_center_id, times_seen")
    .eq("user_id", userId)
    .eq("external_product_id", externalId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("deliverymuch_product_map")
      .update({ times_seen: (existing.times_seen ?? 0) + 1, last_seen_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("external_product_id", externalId);

    return {
      delivery_product_id: existing.delivery_product_id ?? null,
      production_center_id: existing.production_center_id ?? defaultCenterId,
    };
  }

  await supabase.from("deliverymuch_product_map").insert({
    user_id: userId,
    external_product_id: externalId,
    external_name: externalName,
    status: "pending",
  });

  return { delivery_product_id: null, production_center_id: defaultCenterId };
}

/**
 * Traduz o pedido da plataforma para o formato do PDV, sem gravar nada.
 * Usado tanto pela ingestão real quanto pelo modo sombra, para que a prévia que
 * o cliente compara com o Eugênio seja exatamente o que entraria de verdade.
 */
// deno-lint-ignore no-explicit-any
function mapOrder(order: any) {
  const deliveryMethod = String(pick(order, ["delivery_form.method"], "DELIVERY"));
  const address = pick(order, ["delivery_form.address", "address", "user.address"], null);

  const addressText = address
    ? [
      pick(address, ["street"], ""),
      pick(address, ["number"], ""),
      pick(address, ["district"], ""),
      pick(address, ["city"], ""),
      pick(address, ["complement"], ""),
      pick(address, ["reference"], ""),
    ].filter(Boolean).join(", ")
    : null;

  const deliveryFee = money(pick(order, ["delivery_form.price", "payment.delivery_price"], 0));
  const total = money(pick(order, ["payment.total_price", "total_price"], 0));
  const discount = money(pick(order, ["payment.discount", "coupon.value"], 0));

  const products = pick(order, ["products"], []) as unknown[];
  const items = Array.isArray(products)
    ? products.map((product) => {
      // deno-lint-ignore no-explicit-any
      const p = product as any;
      const quantity = Number(pick(p, ["quantity"], 1)) || 1;
      const unitPrice = money(pick(p, ["total_price", "price"], 0));
      return {
        external_product_id: String(pick(p, ["_id", "id", "product._id", "product.id"], "")),
        product_name: String(pick(p, ["name", "product.name"], "Item")),
        quantity,
        unit_price: unitPrice,
        subtotal: unitPrice * quantity,
        options: describeOptions(p),
        raw_options: pick(p, ["groups"], null),
      };
    })
    : [];

  return {
    customer_name: pick(order, ["user.name", "customer.name", "client.name"], "Cliente DeliveryMuch"),
    customer_phone: pick(order, ["user.phone", "customer.phone", "client.phone"], null),
    delivery_address_text: addressText,
    order_type: deliveryMethod === "PICKUP" ? "pickup" : "delivery",
    subtotal: Math.max(total - deliveryFee + discount, 0),
    delivery_fee: deliveryFee,
    discount,
    total,
    notes: pick(order, ["observation", "note", "notes"], null),
    estimated_time: pick(order, ["delivery_form.estimated_time"], null),
    items,
  };
}

// ── ingestão de um pedido ───────────────────────────────────────────────────
interface TenantContext {
  userId: string;
  env: DmEnv;
  accessToken: string;
  companyUuid: string;
  autoAccept: boolean;
  requireOpenCashier: boolean;
  defaultCenterId: string | null;
  shadowMode: boolean;
}

async function hasOpenCashier(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("pdv_cashier_sessions")
    .select("id")
    .eq("user_id", userId)
    .is("closed_at", null)
    .limit(1);
  return Boolean(data && data.length > 0);
}

/**
 * Modo sombra: observa sem participar. Grava o pedido cru e a prévia numa
 * tabela isolada, sem tocar em delivery_orders e sem escrever nada na
 * plataforma. A única gravação fora daí é a fila de vinculação de produtos, que
 * é interna e serve justamente para o cardápio já estar amarrado quando a
 * operação de verdade começar.
 */
async function shadowIngest(
  supabase: SupabaseClient,
  ctx: TenantContext,
  // deno-lint-ignore no-explicit-any
  order: any,
): Promise<"created" | "updated" | "skipped"> {
  const externalId = String(pick(order, ["_id", "id"], ""));
  if (!externalId) return "skipped";

  const preview = mapOrder(order);
  const payment = await resolvePayment(supabase, ctx.userId, order);

  for (const item of preview.items) {
    if (item.external_product_id) {
      await resolveProduct(
        supabase,
        ctx.userId,
        item.external_product_id,
        item.product_name,
        ctx.defaultCenterId,
      );
    }
  }

  const { data: existing } = await supabase
    .from("deliverymuch_shadow_orders")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("external_order_id", externalId)
    .maybeSingle();

  const row = {
    user_id: ctx.userId,
    external_order_id: externalId,
    external_code: pick(order, ["code"], null),
    external_status: pick(order, ["status"], null),
    external_stage: pick(order, ["stage"], null),
    payload: order,
    preview: { ...preview, ...payment },
    last_seen_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from("deliverymuch_shadow_orders").update(row).eq("id", existing.id);
    return "updated";
  }

  const { error } = await supabase.from("deliverymuch_shadow_orders").insert(row);
  if (error) {
    if (error.code === "23505") return "skipped";
    throw error;
  }
  return "created";
}

async function ingestOrder(
  supabase: SupabaseClient,
  ctx: TenantContext,
  // deno-lint-ignore no-explicit-any
  order: any,
): Promise<"created" | "updated" | "skipped"> {
  const externalId = String(pick(order, ["_id", "id"], ""));
  if (!externalId) return "skipped";

  const status = String(pick(order, ["status"], "OPENED"));
  const stage = String(pick(order, ["stage"], "WAITING_COMPANY"));
  const localStatus = mapStatus(status, stage);

  const { data: existing } = await supabase
    .from("delivery_orders")
    .select("id, status")
    .eq("user_id", ctx.userId)
    .eq("source", SOURCE)
    .eq("external_order_id", externalId)
    .maybeSingle();

  // ── já existe: só reflete a mudança de estado vinda da plataforma ────────
  if (existing) {
    const patch: Record<string, unknown> = {
      external_status: status,
      external_stage: stage,
      external_payload: order,
      external_synced_at: new Date().toISOString(),
    };

    // não rebaixa o que o restaurante já avançou localmente
    const rank = ["pending", "preparing", "ready", "delivering", "completed"];
    const shouldAdvance = localStatus === "cancelled" ||
      rank.indexOf(localStatus) > rank.indexOf(existing.status ?? "pending");

    if (shouldAdvance && existing.status !== localStatus) {
      patch.status = localStatus;
      if (localStatus === "cancelled") {
        patch.cancelled_at = new Date().toISOString();
        patch.cancellation_reason = pick(order, ["cancellation_description"], "Cancelado na DeliveryMuch");
      }
    }

    await supabase.from("delivery_orders").update(patch).eq("id", existing.id);
    return "updated";
  }

  // ── pedido novo ──────────────────────────────────────────────────────────
  const deliveryMethod = String(pick(order, ["delivery_form.method"], "DELIVERY"));
  const orderType = deliveryMethod === "PICKUP" ? "pickup" : "delivery";

  const payment = await resolvePayment(supabase, ctx.userId, order);

  const address = pick(order, ["delivery_form.address", "address", "user.address"], null);
  const addressText = address
    ? [
      pick(address, ["street"], ""),
      pick(address, ["number"], ""),
      pick(address, ["district"], ""),
      pick(address, ["city"], ""),
      pick(address, ["complement"], ""),
      pick(address, ["reference"], ""),
    ].filter(Boolean).join(", ")
    : null;

  const deliveryFee = money(pick(order, ["delivery_form.price", "payment.delivery_price"], 0));
  const total = money(pick(order, ["payment.total_price", "total_price"], 0));
  const discount = money(pick(order, ["payment.discount", "coupon.value"], 0));

  const { data: inserted, error: insertError } = await supabase
    .from("delivery_orders")
    .insert({
      user_id: ctx.userId,
      source: SOURCE,
      external_order_id: externalId,
      external_code: pick(order, ["code"], null),
      external_status: status,
      external_stage: stage,
      external_payload: order,
      external_synced_at: new Date().toISOString(),
      customer_name: pick(order, ["user.name", "customer.name", "client.name"], "Cliente DeliveryMuch"),
      customer_phone: pick(order, ["user.phone", "customer.phone", "client.phone"], null),
      delivery_address_text: addressText,
      order_type: orderType,
      status: "pending",
      subtotal: Math.max(total - deliveryFee + discount, 0),
      delivery_fee: deliveryFee,
      discount,
      total,
      payment_method: payment.payment_method,
      payment_status: payment.payment_status,
      notes: pick(order, ["observation", "note", "notes"], null),
      estimated_time: pick(order, ["delivery_form.estimated_time"], null),
    })
    .select("id")
    .single();

  if (insertError) {
    // corrida entre dois sweeps: o índice único resolveu, não é erro de verdade
    if (insertError.code === "23505") return "skipped";
    throw insertError;
  }

  // ── itens ────────────────────────────────────────────────────────────────
  const products = pick(order, ["products"], []) as unknown[];
  if (Array.isArray(products)) {
    for (const product of products) {
      // deno-lint-ignore no-explicit-any
      const p = product as any;
      const externalProductId = String(pick(p, ["_id", "id", "product._id", "product.id"], ""));
      const name = String(pick(p, ["name", "product.name"], "Item"));
      const quantity = Number(pick(p, ["quantity"], 1)) || 1;
      const unitPrice = money(pick(p, ["total_price", "price"], 0));

      const link = externalProductId
        ? await resolveProduct(supabase, ctx.userId, externalProductId, name, ctx.defaultCenterId)
        : { delivery_product_id: null, production_center_id: ctx.defaultCenterId };

      await supabase.from("delivery_order_items").insert({
        order_id: inserted.id,
        product_id: link.delivery_product_id,
        production_center_id: link.production_center_id,
        product_name: name,
        quantity,
        unit_price: unitPrice,
        subtotal: unitPrice * quantity,
        notes: describeOptions(p),
        external_product_id: externalProductId || null,
        external_name: name,
        external_options: pick(p, ["groups"], null),
      });
    }
  }

  // ── auditoria na plataforma: marcar como recebido ────────────────────────
  await dmApi(ctx.accessToken, ctx.env, `/orders/${externalId}/receive`, { method: "PATCH" })
    .catch(() => {/* auditoria não pode derrubar a ingestão */});

  // ── aceite automático ────────────────────────────────────────────────────
  if (ctx.autoAccept && stage === "WAITING_COMPANY" && status === "OPENED") {
    const cashierOk = ctx.requireOpenCashier ? await hasOpenCashier(supabase, ctx.userId) : true;

    if (!cashierOk) {
      await dmLog(supabase, ctx.userId, "auto_accept", "error", {
        message: `Pedido ${pick(order, ["code"], externalId)} NÃO foi aceito: caixa fechado. Aceite manualmente antes de 15 minutos ou a loja será colocada offline.`,
      });
    } else {
      const { status: httpStatus, body } = await dmApi(
        ctx.accessToken,
        ctx.env,
        `/orders/${externalId}/accept`,
        { method: "PATCH" },
      );

      if (httpStatus >= 200 && httpStatus < 300) {
        await supabase
          .from("delivery_orders")
          .update({ status: "preparing", confirmed_at: new Date().toISOString(), external_stage: "CONFIRMED" })
          .eq("id", inserted.id);
        await dmLog(supabase, ctx.userId, "auto_accept", "ok", {
          httpStatus,
          message: `Pedido ${pick(order, ["code"], externalId)} aceito automaticamente`,
        });
      } else {
        await dmLog(supabase, ctx.userId, "auto_accept", "error", {
          httpStatus,
          message: `Falha ao aceitar o pedido ${pick(order, ["code"], externalId)}`,
          details: body,
        });
      }
    }
  }

  return "created";
}

// ── sincronização de um tenant ──────────────────────────────────────────────
async function syncTenant(supabase: SupabaseClient, userId: string) {
  const { data: settings } = await supabase
    .from("pdv_settings")
    .select(
      "deliverymuch_enabled, deliverymuch_paused, deliverymuch_company_uuid, deliverymuch_env, deliverymuch_auto_accept, deliverymuch_require_open_cashier, deliverymuch_default_production_center_id, deliverymuch_shadow_mode",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings?.deliverymuch_enabled || settings.deliverymuch_paused) {
    return { userId, skipped: true, reason: settings?.deliverymuch_paused ? "paused" : "disabled" };
  }
  if (!settings.deliverymuch_company_uuid) {
    return { userId, skipped: true, reason: "no_company" };
  }

  const env = (settings.deliverymuch_env === "prod" ? "prod" : "dev") as DmEnv;
  const accessToken = await dmValidToken(supabase, userId, env);

  const query = new URLSearchParams({
    "company.id": settings.deliverymuch_company_uuid,
    status: "OPENED",
    sort: "-created_at",
    limit: "100",
  });

  const { status: httpStatus, body } = await dmApi(accessToken, env, `/orders?${query}`);

  if (httpStatus < 200 || httpStatus >= 300) {
    await dmLog(supabase, userId, "sync", "error", {
      httpStatus,
      message: `Falha ao buscar pedidos: HTTP ${httpStatus}`,
      details: body,
    });
    await supabase
      .from("pdv_settings")
      .update({
        deliverymuch_last_error: `Falha ao buscar pedidos: HTTP ${httpStatus}`,
        deliverymuch_last_error_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return { userId, error: `http_${httpStatus}` };
  }

  // deno-lint-ignore no-explicit-any
  const docs = (pick(body as any, ["docs"], []) ?? []) as unknown[];
  const counters = { created: 0, updated: 0, skipped: 0 };

  // modo sombra nasce ligado: só sai dele por escolha explícita na tela
  const shadowMode = settings.deliverymuch_shadow_mode !== false;

  const ctx: TenantContext = {
    userId,
    env,
    accessToken,
    companyUuid: settings.deliverymuch_company_uuid,
    autoAccept: Boolean(settings.deliverymuch_auto_accept),
    requireOpenCashier: settings.deliverymuch_require_open_cashier !== false,
    defaultCenterId: settings.deliverymuch_default_production_center_id ?? null,
    shadowMode,
  };

  for (const order of docs) {
    try {
      const result = shadowMode
        ? await shadowIngest(supabase, ctx, order)
        : await ingestOrder(supabase, ctx, order);
      counters[result] += 1;
    } catch (err) {
      // um pedido problemático não pode travar a fila inteira
      await dmLog(supabase, userId, "ingest", "error", {
        message: err instanceof Error ? err.message : String(err),
        // deno-lint-ignore no-explicit-any
        details: { external_order_id: pick(order as any, ["_id", "id"], null) },
      });
    }
  }

  await supabase
    .from("pdv_settings")
    .update({
      deliverymuch_last_poll_at: new Date().toISOString(),
      deliverymuch_last_sync_at: new Date().toISOString(),
      deliverymuch_last_error: null,
      deliverymuch_last_error_at: null,
    })
    .eq("user_id", userId);

  if (counters.created > 0) {
    await dmLog(supabase, userId, "sync", "ok", {
      message: shadowMode
        ? `${counters.created} pedido(s) observado(s) em modo sombra, sem entrar no PDV`
        : `${counters.created} pedido(s) novo(s), ${counters.updated} atualizado(s)`,
    });
  }

  return { userId, shadowMode, ...counters };
}

// ── ações do operador ───────────────────────────────────────────────────────
async function pushOrderAction(
  supabase: SupabaseClient,
  userId: string,
  orderId: string,
  action: "accept" | "ready" | "cancel",
  reason?: string,
) {
  const { data: order } = await supabase
    .from("delivery_orders")
    .select("id, external_order_id, status, source")
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!order || order.source !== SOURCE || !order.external_order_id) {
    throw new DmError("Pedido da DeliveryMuch não encontrado.", "order_not_found", 404);
  }

  const { data: settings } = await supabase
    .from("pdv_settings")
    .select("deliverymuch_env")
    .eq("user_id", userId)
    .maybeSingle();

  const env = (settings?.deliverymuch_env === "prod" ? "prod" : "dev") as DmEnv;
  const accessToken = await dmValidToken(supabase, userId, env);

  const { status, body } = await dmApi(
    accessToken,
    env,
    `/orders/${order.external_order_id}/${action}`,
    {
      method: "PATCH",
      ...(action === "cancel"
        ? { body: JSON.stringify({ cancellation_description: reason ?? "Cancelado pelo estabelecimento" }) }
        : {}),
    },
  );

  if (status < 200 || status >= 300) {
    await dmLog(supabase, userId, action, "error", { httpStatus: status, details: body });
    // a mensagem precisa explicar a regra, senão o operador não entende o 403
    const hint = action === "cancel"
      ? " Pedidos já aceitos só podem ser cancelados pela franquia."
      : "";
    throw new DmError(`A DeliveryMuch respondeu ${status}.${hint}`, "api_error", 502, body);
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { external_synced_at: now };
  if (action === "accept") {
    patch.status = "preparing";
    patch.confirmed_at = now;
    patch.external_stage = "CONFIRMED";
  } else if (action === "ready") {
    patch.status = "ready";
    patch.ready_at = now;
    patch.external_stage = "READY";
  } else {
    patch.status = "cancelled";
    patch.cancelled_at = now;
    patch.cancellation_reason = reason ?? "Cancelado pelo estabelecimento";
    patch.external_status = "CANCELED";
  }

  await supabase.from("delivery_orders").update(patch).eq("id", order.id);
  await dmLog(supabase, userId, action, "ok", { httpStatus: status });

  return { success: true };
}

/** Semeia o de-para de pagamentos com os cartões que a loja realmente aceita. */
async function seedPaymentMap(supabase: SupabaseClient, userId: string) {
  const { data: settings } = await supabase
    .from("pdv_settings")
    .select("deliverymuch_env, deliverymuch_company_uuid")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings?.deliverymuch_company_uuid) {
    throw new DmError("Selecione a loja antes de configurar os pagamentos.", "no_company_selected", 400);
  }

  const env = (settings.deliverymuch_env === "prod" ? "prod" : "dev") as DmEnv;
  const accessToken = await dmValidToken(supabase, userId, env);

  const { status, body } = await dmApi(accessToken, env, `/companies/${settings.deliverymuch_company_uuid}`);
  if (status < 200 || status >= 300) {
    throw new DmError(`A DeliveryMuch respondeu ${status} ao buscar a loja.`, "api_error", 502, body);
  }

  const rows: Array<Record<string, unknown>> = [
    { user_id: userId, external_key: "MONEY", label: "Dinheiro", ...defaultPaymentMethod("MONEY", null) },
    { user_id: userId, external_key: "ONLINE", label: "Online (cartão ou Pix)", ...defaultPaymentMethod("ONLINE", null) },
  ];

  // deno-lint-ignore no-explicit-any
  const forms = (pick(body as any, ["delivery_forms"], []) ?? []) as any[];
  for (const form of forms) {
    for (const method of (form.payment_methods ?? [])) {
      for (const card of (method.cards ?? [])) {
        if (card?.id === undefined) continue;
        rows.push({
          user_id: userId,
          external_key: `MACHINE:${card.id}`,
          label: card.name ?? `Cartão ${card.id}`,
          ...defaultPaymentMethod("MACHINE", card.name ?? null),
        });
      }
    }
  }

  // ignoreDuplicates: não sobrescreve escolha que o cliente já fez
  const { error } = await supabase
    .from("deliverymuch_payment_map")
    .upsert(rows, { onConflict: "user_id,external_key", ignoreDuplicates: true });
  if (error) throw error;

  await dmLog(supabase, userId, "seed_payment_map", "ok", { message: `${rows.length} forma(s) de pagamento` });
  return { success: true, count: rows.length };
}

// ── handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: dmCors });
  }

  const supabase = serviceClient();

  try {
    // ── modo sweep (pg_cron) ──────────────────────────────────────────────
    const sweepSecret = req.headers.get("x-sweep-secret");
    if (sweepSecret) {
      if (sweepSecret !== Deno.env.get("DELIVERYMUCH_SWEEP_SECRET")) {
        return dmJson({ error: "Unauthorized" }, 401);
      }

      const { data: tenants } = await supabase
        .from("pdv_settings")
        .select("user_id")
        .eq("deliverymuch_enabled", true)
        .eq("deliverymuch_paused", false)
        .not("deliverymuch_company_uuid", "is", null);

      const results = [];
      for (const tenant of tenants ?? []) {
        try {
          results.push(await syncTenant(supabase, tenant.user_id));
        } catch (err) {
          results.push({ userId: tenant.user_id, error: err instanceof Error ? err.message : String(err) });
        }
      }

      return dmJson({ swept: results.length, results });
    }

    // ── modo usuário ──────────────────────────────────────────────────────
    const user = await dmRequireUser(supabase, req);
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    switch (action) {
      case "sync_now":
        return dmJson(await syncTenant(supabase, user.id));

      case "accept":
      case "ready":
        return dmJson(await pushOrderAction(supabase, user.id, String(body.order_id), action));

      case "cancel":
        return dmJson(
          await pushOrderAction(supabase, user.id, String(body.order_id), "cancel", body.reason),
        );

      case "seed_payment_map":
        return dmJson(await seedPaymentMap(supabase, user.id));

      default:
        throw new DmError(`Ação desconhecida: ${action}`, "unknown_action", 400);
    }
  } catch (err) {
    const isDm = err instanceof DmError;
    const message = err instanceof Error ? err.message : String(err);
    if (!isDm) console.error("deliverymuch-orders error:", err);

    return dmJson(
      { error: message, code: isDm ? err.code : "internal_error" },
      isDm ? err.httpStatus : 500,
    );
  }
});
