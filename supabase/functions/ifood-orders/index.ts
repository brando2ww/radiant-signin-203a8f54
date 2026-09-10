// iFood · polling de eventos, ingestão de pedido e ações de volta.
//
// Uma função só, como a deliverymuch-orders, porque o cron e a tela precisam
// do mesmo token, do mesmo de-para merchant→tenant e do mesmo vocabulário de
// status. Separar duplicaria as três coisas.
//
// MODELO CENTRALIZADO: o token é da aplicação e enxerga todas as lojas de
// todos os clientes. Logo o polling é UM só para a plataforma inteira, e o
// roteamento de cada evento sai de ifood_merchants.
import {
  ifAppToken, ifApi, ifOk, ifLog, ifSetError, ifSetAppError, ifClearError,
  ifCors, ifJson, ifRequireUser, serviceClient, pick, IFOOD_SOURCE,
} from "../_shared/ifood.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const SWEEP_SECRET = Deno.env.get("IFOOD_SWEEP_SECRET") ?? "";

// ── util ────────────────────────────────────────────────────────────────────
const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

interface LinhaDeOpcao {
  name: string;
  groupName: string;
  quantity: number;
  unitPrice: number;
  externalCode: unknown;
}

/**
 * Achata os adicionais do iFood em linhas.
 *
 * O payload aninha até três níveis: item > complemento > customização. A
 * customização é escolha de verdade e tem preço próprio (visto em produção:
 * complemento de R$ 2 com três customizações de R$ 1 cada), então também vira
 * linha — senão some do estoque e do relatório.
 *
 * O nome do complemento pai entra no grupo da customização, para a comanda não
 * virar uma lista solta onde ninguém sabe a qual adicional aquilo pertence.
 */
function achatarOpcoes(opts: Record<string, unknown>[]): LinhaDeOpcao[] {
  const out: LinhaDeOpcao[] = [];

  for (const o of opts ?? []) {
    const nome = String(pick(o, ["name"], "")).trim();
    if (!nome) continue;

    out.push({
      name: nome,
      groupName: String(pick(o, ["groupName"], "Adicionais")).trim() || "Adicionais",
      quantity: Number(pick(o, ["quantity"], 1)) || 1,
      unitPrice: money(pick(o, ["unitPrice", "price"], 0)),
      externalCode: pick(o, ["externalCode"], null),
    });

    const custom = pick(o, ["customizations"], []) as Record<string, unknown>[];
    for (const c of custom ?? []) {
      const nomeC = String(pick(c, ["name"], "")).trim();
      if (!nomeC) continue;
      const grupoC = String(pick(c, ["groupName"], "")).trim();
      out.push({
        name: nomeC,
        groupName: grupoC ? `${nome} · ${grupoC}` : nome,
        quantity: Number(pick(c, ["quantity"], 1)) || 1,
        unitPrice: money(pick(c, ["unitPrice", "price"], 0)),
        externalCode: pick(c, ["externalCode"], null),
      });
    }
  }

  return out;
}
const nowIso = () => new Date().toISOString();

/**
 * Erro do PostgREST é objeto, não Error: `String(err)` vira "[object Object]"
 * e apaga a causa justamente quando ela mais importa.
 */
function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint, e.code].filter(Boolean).map(String);
    return parts.length ? parts.join(" · ") : JSON.stringify(err);
  }
  return String(err);
}

/**
 * O iFood entrega o evento por código curto e por fullCode. Mapear pelos dois
 * porque contas antigas ainda recebem só o curto.
 */
function eventKind(code: string, fullCode: string): string {
  const c = (fullCode || code || "").toUpperCase();
  if (c === "PLC" || c === "PLACED") return "placed";
  if (c === "CFM" || c === "CONFIRMED") return "confirmed";
  if (c === "CAN" || c === "CANCELLED") return "cancelled";
  // CANCELLATION_REQUESTED é AVISO: o cliente pediu cancelamento. A resposta
  // NÃO sai por aqui — os endpoints v1 accept/denyCancellation do pedido estão
  // mortos ("Negotiation platform is only available in version 2").
  if (c === "CAR" || c === "CANCELLATION_REQUESTED" || c === "CANCELLATION_REQUEST") {
    return "cancellation_requested";
  }
  // A negociação de verdade: responde-se a uma DISPUTA, com disputeId próprio,
  // em POST /order/v1.0/disputes/{disputeId}/accept|reject.
  if (c.startsWith("HANDSHAKE")) return "handshake_dispute";
  if (c === "DSP" || c === "DISPATCHED") return "dispatched";
  if (c === "CON" || c === "CONCLUDED") return "concluded";
  if (c === "RTP" || c === "READY_TO_PICKUP") return "ready_to_pickup";
  return "other";
}

// ── polling global + acknowledgment ─────────────────────────────────────────
/**
 * O acknowledgment é o critério que mais reprova homologação: TODO evento
 * recebido precisa ser confirmado, imediatamente após o polling, mesmo o que
 * a gente não sabe processar. Por isso ele acontece antes da ingestão e não
 * depende dela dar certo.
 */
async function sweep(supabase: SupabaseClient) {
  // A linha única precisa existir antes: a trava é um UPDATE condicional, e
  // UPDATE em tabela vazia afeta zero linhas, o que travaria o sweep para
  // sempre em toda instalação nova.
  await supabase.from("ifood_app_token")
    .upsert({ id: true }, { onConflict: "id", ignoreDuplicates: true });

  // Trava global de 25s: o iFood permite 1 polling a cada 30s POR TOKEN, e o
  // token é um só. UPDATE condicional, não leitura-depois-escrita, senão duas
  // invocações do cron pegam a mesma janela.
  const lockUntil = new Date(Date.now() + 25_000).toISOString();
  const { data: lock } = await supabase
    .from("ifood_app_token")
    .update({ polling_lock_until: lockUntil })
    .or(`polling_lock_until.is.null,polling_lock_until.lt.${nowIso()}`)
    .eq("id", true)
    .select("id")
    .maybeSingle();

  if (!lock) return { skipped: "locked" };

  const { data: merchants } = await supabase
    .from("ifood_merchants")
    .select("merchant_id, user_id")
    .eq("is_active", true);

  if (!merchants?.length) return { skipped: "no_merchants" };

  const routing = new Map(merchants.map((m) => [m.merchant_id, m.user_id]));
  const token = await ifAppToken(supabase);

  const { status, body } = await ifApi(token, "/events/v1.0/events:polling", {
    headers: { "x-polling-merchants": merchants.map((m) => m.merchant_id).join(",") },
  });

  await supabase.from("ifood_app_token")
    .update({ last_poll_at: nowIso(), polling_lock_until: null })
    .eq("id", true);

  // 204 = nenhum evento novo. A fila pendente ainda precisa ser retentada:
  // é justamente quando não chega nada que ela fica parada para sempre.
  if (status === 204) return { events: 0, retried: await retryPending(supabase, token) };
  if (!ifOk(status)) {
    await ifSetAppError(supabase, `Polling respondeu ${status}`);
    await ifLog(supabase, null, "polling", "error", { httpStatus: status, details: body });
    return { error: `polling ${status}` };
  }

  const events = Array.isArray(body) ? body : [];
  if (!events.length) return { events: 0, retried: await retryPending(supabase, token) };

  // 1. grava antes de confirmar: se o iFood confirmar e a gente perder o
  //    evento, ele não reenvia. A fila é a única rede de proteção.
  for (const ev of events) {
    const e = ev as Record<string, unknown>;
    await supabase.from("pdv_ifood_events").insert({
      event_id: String(e.id ?? ""),
      event_type: String(e.code ?? ""),
      full_code: String(e.fullCode ?? ""),
      merchant_id: String(e.merchantId ?? ""),
      order_external_id: String(e.orderId ?? ""),
      user_id: routing.get(String(e.merchantId ?? "")) ?? null,
      payload: e,
      processed: false,
    });   // conflito no event_id = já visto, segue
  }

  // 2. confirma TODOS, inclusive os repetidos e os de tipo desconhecido
  const ackIds = events.map((e) => ({ id: String((e as Record<string, unknown>).id ?? "") }));
  const ack = await ifApi(token, "/events/v1.0/events/acknowledgment", {
    method: "POST",
    body: JSON.stringify(ackIds),
  });

  if (ifOk(ack.status)) {
    await supabase.from("pdv_ifood_events")
      .update({ acknowledged_at: nowIso() })
      .in("event_id", ackIds.map((a) => a.id));
  } else {
    await ifLog(supabase, null, "acknowledgment", "error", { httpStatus: ack.status, details: ack.body });
  }

  // 3. só agora processa
  let processed = 0;
  for (const ev of events) {
    const e = ev as Record<string, unknown>;
    const userId = routing.get(String(e.merchantId ?? ""));
    if (!userId) continue;   // loja não vinculada: fica órfão na fila, não some
    try {
      await handleEvent(supabase, token, userId, e);
      processed++;
    } catch (err) {
      await bumpFailure(supabase, String(e.id ?? ""), errText(err));
      await ifLog(supabase, userId, "event", "error", { message: errText(err), details: e });
    }
  }

  const retried = await retryPending(supabase, token);
  return { events: events.length, processed, retried };
}

async function bumpFailure(supabase: SupabaseClient, eventId: string, message: string) {
  const { data: cur } = await supabase
    .from("pdv_ifood_events").select("attempts").eq("event_id", eventId).maybeSingle();
  await supabase.from("pdv_ifood_events")
    .update({ error_message: message.slice(0, 2000), attempts: (cur?.attempts ?? 0) + 1 })
    .eq("event_id", eventId);
}

/**
 * O iFood não reenvia evento já confirmado. Como o acknowledgment acontece
 * antes da ingestão (e tem que acontecer), um evento que falhou só volta se a
 * gente mesmo retentar. Sem isto, pedido perdido é perdido para sempre.
 */
async function retryPending(supabase: SupabaseClient, token: string): Promise<number> {
  const { data: pending } = await supabase
    .from("pdv_ifood_events")
    .select("event_id, payload, user_id, attempts")
    .eq("processed", false)
    .not("user_id", "is", null)
    .lt("attempts", 6)
    .order("created_at", { ascending: true })
    .limit(20);

  let ok = 0;
  for (const row of pending ?? []) {
    try {
      await handleEvent(supabase, token, row.user_id as string, row.payload as Record<string, unknown>);
      ok++;
    } catch (err) {
      await bumpFailure(supabase, row.event_id as string, errText(err));
    }
  }
  return ok;
}

async function handleEvent(
  supabase: SupabaseClient,
  token: string,
  userId: string,
  e: Record<string, unknown>,
) {
  const kind = eventKind(String(e.code ?? ""), String(e.fullCode ?? ""));
  const orderId = String(e.orderId ?? "");
  if (!orderId) return;

  if (kind === "cancellation_requested") {
    // Só registra: quem responde é o evento de disputa, que chega em seguida
    // com o disputeId. Chamar o endpoint v1 aqui devolve 400 e entope a fila.
    await supabase.from("delivery_orders")
      .update({
        external_status: "CANCELLATION_REQUESTED",
        external_last_event_at: nowIso(),
      })
      .eq("user_id", userId).eq("source", IFOOD_SOURCE).eq("external_order_id", orderId);

    await ifLog(supabase, userId, "cancellation_requested", "ok", {
      message: "Cliente solicitou cancelamento; aguardando a disputa para responder.",
      details: e,
    });

    await supabase.from("pdv_ifood_events")
      .update({ processed: true, processed_at: nowIso() })
      .eq("event_id", String(e.id ?? ""));
    return;
  }

  if (kind === "handshake_dispute") {
    // O disputeId não vem num lugar só dependendo do tipo de handshake, e
    // errar o caminho aqui custa uma reprovação inteira: sem resposta até o
    // expiresAt, o iFood decide sozinho (reembolso) e a loja perde.
    const disputeId = String(
      pick(e, [
        "metadata.disputeId",
        "metadata.handshakeDisputeId",
        "metadata.id",
        "disputeId",
      ], "") || "",
    );

    if (!disputeId) {
      // Não dá para responder sem o id. Guarda o evento cru para diagnóstico
      // em vez de descartar em silêncio.
      throw new Error(`HANDSHAKE sem disputeId identificável: ${JSON.stringify(e).slice(0, 500)}`);
    }

    const { data: settings } = await supabase
      .from("pdv_settings")
      .select("ifood_auto_accept_cancellation")
      .eq("user_id", userId)
      .maybeSingle();

    const accept = settings?.ifood_auto_accept_cancellation !== false;

    // O iFood exige um motivo da lista que ELE mandou no próprio evento.
    // Inventar um código reprova; por isso o fallback é o genérico oficial.
    const offered = pick(e, [
      "metadata.acceptCancellationReasons",
      "metadata.reasons",
    ], []) as unknown[];
    const reason = Array.isArray(offered) && offered.length
      ? String(
        (offered[0] as Record<string, unknown>)?.reason ??
          (offered[0] as Record<string, unknown>)?.code ??
          offered[0],
      )
      : "OTHER_REASONS";

    const path = accept ? "accept" : "reject";
    const { status, body } = await ifApi(
      token,
      `/order/v1.0/disputes/${disputeId}/${path}`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );

    await ifLog(supabase, userId, `dispute_${path}`, ifOk(status) ? "ok" : "error", {
      httpStatus: status,
      details: { disputeId, reason, response: body, event: e },
    });

    if (!ifOk(status)) throw new Error(`disputes/${path} respondeu ${status}`);

    await supabase.from("pdv_ifood_events")
      .update({ processed: true, processed_at: nowIso() })
      .eq("event_id", String(e.id ?? ""));
    return;
  }

  if (kind === "placed") {
    const { status, body } = await ifApi(token, `/order/v1.0/orders/${orderId}`);
    if (!ifOk(status)) throw new Error(`GET order ${status}`);
    await ingestOrder(supabase, userId, body as Record<string, unknown>, token);
  } else {
    // demais eventos só refletem estado no pedido já ingerido
    const local: Record<string, string> = {
      confirmed: "preparing", cancelled: "cancelled",
      dispatched: "delivering", concluded: "completed", ready_to_pickup: "ready",
    };
    const next = local[kind];

    // Evento que não muda estado (DDCR, CAR, HANDSHAKE…) já foi confirmado ao
    // iFood e não tem o que processar. Sem marcar como processado ele fica na
    // fila sendo retentado a cada 30s até estourar o limite de tentativas —
    // ruído puro, e mascara a fila de quem realmente falhou.
    if (!next) {
      await supabase.from("pdv_ifood_events")
        .update({ processed: true, processed_at: nowIso() })
        .eq("event_id", String(e.id ?? ""));
      return;
    }

    const patch: Record<string, unknown> = {
      external_status: String(e.fullCode ?? e.code ?? ""),
      external_last_event_at: nowIso(),
      status: next,
    };
    if (next === "cancelled") patch.cancelled_at = nowIso();
    if (next === "completed") patch.delivered_at = nowIso();

    const { data: touched } = await supabase.from("delivery_orders").update(patch)
      .eq("user_id", userId).eq("source", IFOOD_SOURCE).eq("external_order_id", orderId)
      .select("id");

    // Evento de estado pode chegar antes do pedido existir (o PLC falhou e
    // está na fila, ou a ordem dos eventos se inverteu). Atualizar zero linhas
    // em silêncio perde um cancelamento — que é o pior evento para perder.
    // Ingere primeiro e aplica o estado depois.
    if (!touched?.length) {
      const { status, body } = await ifApi(token, `/order/v1.0/orders/${orderId}`);
      if (!ifOk(status)) throw new Error(`pedido ${orderId} ainda não ingerido e GET respondeu ${status}`);
      await ingestOrder(supabase, userId, body as Record<string, unknown>, token);
      await supabase.from("delivery_orders").update(patch)
        .eq("user_id", userId).eq("source", IFOOD_SOURCE).eq("external_order_id", orderId);
    }
  }

  await supabase.from("pdv_ifood_events")
    .update({ processed: true, processed_at: nowIso() })
    .eq("event_id", String(e.id ?? ""));
}

// ── ingestão ────────────────────────────────────────────────────────────────
/**
 * customer_id e customer_phone são NOT NULL em delivery_orders. Resolver o
 * cliente ANTES do insert não é detalhe: é o que faltava na ingestão da
 * DeliveryMuch, que por isso nunca gravou um pedido.
 * phone é único global, então o upsert é por telefone.
 */
async function resolveCustomer(
  supabase: SupabaseClient,
  order: Record<string, unknown>,
): Promise<{ id: string; phone: string; name: string; document: string | null }> {
  const name = String(pick(order, ["customer.name"], "Cliente iFood"));
  const document = pick(order, ["customer.documentNumber"], null) as string | null;
  // o telefone do iFood é temporário e mascarado; quando falta, o id do
  // cliente na plataforma é o identificador estável que sobra
  const raw = pick(order, ["customer.phone.number"], null) as string | null;
  const phone = raw && String(raw).trim()
    ? String(raw).trim()
    : `ifood:${pick(order, ["customer.id"], order.id)}`;

  const { data: found } = await supabase
    .from("delivery_customers").select("id").eq("phone", phone).maybeSingle();
  if (found) return { id: found.id, phone, name, document };

  const { data: created, error } = await supabase
    .from("delivery_customers")
    .insert({ phone, name, cpf: document })
    .select("id").single();

  if (error) {
    // corrida entre dois sweeps
    const { data: retry } = await supabase
      .from("delivery_customers").select("id").eq("phone", phone).maybeSingle();
    if (retry) return { id: retry.id, phone, name, document };
    throw error;
  }
  return { id: created.id, phone, name, document };
}

async function ingestOrder(
  supabase: SupabaseClient,
  userId: string,
  order: Record<string, unknown>,
  token: string,
) {
  const externalId = String(order.id ?? "");
  if (!externalId) return;

  const { data: exists } = await supabase
    .from("delivery_orders").select("id")
    .eq("user_id", userId).eq("source", IFOOD_SOURCE).eq("external_order_id", externalId)
    .maybeSingle();
  if (exists) return;

  const { data: settings } = await supabase
    .from("pdv_settings")
    .select("ifood_default_production_center_id, ifood_shadow_mode, ifood_auto_accept, ifood_require_open_cashier")
    .eq("user_id", userId).maybeSingle();

  const customer = await resolveCustomer(supabase, order);

  const orderType = String(pick(order, ["orderType"], "DELIVERY")).toUpperCase() === "TAKEOUT"
    ? "pickup" : "delivery";

  const addr = pick(order, ["delivery.deliveryAddress"], null) as Record<string, unknown> | null;
  const addressText = addr
    ? [addr.streetName, addr.streetNumber, addr.neighborhood, addr.city, addr.complement, addr.reference]
      .filter(Boolean).join(", ")
    : null;

  const subTotal = money(pick(order, ["total.subTotal"], 0));
  const deliveryFee = money(pick(order, ["total.deliveryFee"], 0));
  const benefits = money(pick(order, ["total.benefits"], 0));
  const total = money(pick(order, ["total.orderAmount"], 0));

  // o critério exige mostrar QUEM banca o desconto, não só o valor
  let sponsorIfood = 0, sponsorMerchant = 0;
  const benefitList = pick(order, ["benefits"], []) as Record<string, unknown>[];
  if (Array.isArray(benefitList)) {
    for (const b of benefitList) {
      for (const s of (pick(b, ["sponsorshipValues"], []) as Record<string, unknown>[]) ?? []) {
        const v = money(s.value);
        if (String(s.name ?? "").toUpperCase() === "IFOOD") sponsorIfood += v;
        else sponsorMerchant += v;
      }
    }
  }

  const method = pick(order, ["payments.methods.0"], {}) as Record<string, unknown>;
  const prepaid = money(pick(order, ["payments.prepaid"], 0));

  const { data: inserted, error } = await supabase
    .from("delivery_orders")
    .insert({
      user_id: userId,
      source: IFOOD_SOURCE,
      // order_number é NOT NULL e o gatilho delivery_orders_assign_number só
      // numera quando há caixa aberto — sem caixa ele devolve a linha como
      // veio. O contrato dele é receber um TMP-… provisório, que a abertura de
      // caixa depois substitui. Sem isto o insert morre com 23502, que é o que
      // impede a ingestão da DeliveryMuch de funcionar até hoje.
      order_number: `TMP-${String(pick(order, ["displayId"], externalId)).slice(-8)}`,
      external_order_id: externalId,
      external_code: pick(order, ["displayId"], null),
      external_status: "PLACED",
      external_payload: order,
      external_synced_at: nowIso(),
      external_last_event_at: nowIso(),
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_document: customer.document,
      delivery_address_text: addressText,
      delivery_notes: pick(order, ["delivery.observations"], null),
      order_type: orderType,
      status: "pending",
      subtotal: subTotal,
      delivery_fee: deliveryFee,
      discount: benefits,
      total,
      payment_method: String(pick(method, ["method"], "OTHER")).toLowerCase(),
      payment_status: prepaid > 0 ? "paid" : "pending",
      external_payment_type: pick(method, ["type"], null),
      external_payment_brand: pick(method, ["card.brand"], null),
      external_benefits: benefitList ?? null,
      discount_sponsor_ifood: sponsorIfood,
      discount_sponsor_merchant: sponsorMerchant,
      change_for: money(pick(method, ["cash.changeFor"], 0)) || null,
      order_timing: pick(order, ["orderTiming"], null),
      scheduled_for: pick(order, ["schedule.deliveryDateTimeStart"], null),
      scheduled_until: pick(order, ["schedule.deliveryDateTimeEnd"], null),
      external_delivered_by: pick(order, ["delivery.deliveredBy"], null),
      external_collection_code: pick(order, ["takeout.collectionCode", "pickupCode"], null),
      notes: pick(order, ["extraInfo"], null),
    })
    .select("id").single();

  if (error) {
    if ((error as { code?: string }).code === "23505") return;   // corrida
    throw error;
  }

  // Ponte com o catálogo interno.
  //
  // O cardápio do iFood carrega o NOSSO código numérico no campo de código
  // externo (a lista sai em Integrações > iFood > Códigos). É ele que liga o
  // item do pedido ao produto daqui — e sem essa ligação não há baixa de
  // estoque nem agrupamento em relatório.
  //
  // O id e o código do próprio iFood NÃO servem para isso: o mesmo complemento
  // chega com código diferente a cada pedido. Medido nos payloads reais —
  // "Complemento 1" veio como 3009 num pedido e 9978 no seguinte, com o UUID
  // trocando junto.
  const [{ data: codigos }, { data: prods }, { data: opcoesCat }, { data: fichasProd }, { data: fichasOpc }] =
    await Promise.all([
      supabase.from("delivery_catalog_codes").select("code, kind, ref_id").eq("user_id", userId),
      supabase.from("delivery_products").select("id, name, source_pdv_product_id").eq("user_id", userId),
      supabase
        .from("delivery_product_option_items")
        .select("id, name, source_pdv_option_item_id, option:delivery_product_options!inner(product:delivery_products!inner(user_id))")
        .eq("option.product.user_id", userId),
      supabase.from("pdv_product_recipes").select("product_id"),
      supabase.from("pdv_option_item_recipes").select("option_item_id"),
    ]);

  const normalizar = (t: unknown) =>
    String(t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

  // Quais cadastros do cardápio têm ficha técnica por trás.
  //
  // Importa porque o mesmo item está cadastrado várias vezes — "Wassabi"
  // aparece 11 vezes no cardápio do Kōten, uma por combo, e o PDV duplica na
  // mesma proporção. Todos dividem um código só, mas a ficha costuma estar em
  // UM deles. Apontar para outro daria vínculo sem baixa nenhuma.
  const origensProduto = new Set(
    ((fichasProd ?? []) as Record<string, unknown>[]).map((f) => String(f.product_id)),
  );
  const origensOpcao = new Set(
    ((fichasOpc ?? []) as Record<string, unknown>[]).map((f) => String(f.option_item_id)),
  );

  const comFicha = new Set<string>();
  for (const p of (prods ?? []) as Record<string, unknown>[]) {
    if (p.source_pdv_product_id && origensProduto.has(String(p.source_pdv_product_id))) {
      comFicha.add(String(p.id));
    }
  }
  for (const o of (opcoesCat ?? []) as Record<string, unknown>[]) {
    if (o.source_pdv_option_item_id && origensOpcao.has(String(o.source_pdv_option_item_id))) {
      comFicha.add(String(o.id));
    }
  }

  // Ponte com o catálogo interno.
  //
  // O cardápio do iFood carrega o NOSSO código numérico no campo de código
  // externo (a lista sai em Integrações > iFood > Códigos). É ele que liga o
  // item do pedido ao cadastro daqui — sem essa ligação não há baixa de estoque
  // nem agrupamento em relatório.
  //
  // O código do próprio iFood NÃO serve: o mesmo complemento chega com código
  // diferente a cada pedido. Medido nos payloads reais — "Complemento 1" veio
  // como 3009 num pedido e 9978 no seguinte, com o UUID trocando junto.
  const catalogo = new Map<string, string>();
  for (const c of (codigos ?? []) as Record<string, unknown>[]) {
    const chave = `${c.kind}:${String(c.code)}`;
    const atual = catalogo.get(chave);
    const novo = String(c.ref_id);
    // Vários cadastros dividem o mesmo código; fica o que tem ficha.
    if (!atual || (!comFicha.has(atual) && comFicha.has(novo))) catalogo.set(chave, novo);
  }

  // Rede pelo NOME, para o estoque já funcionar antes de o lojista colar os
  // códigos no cardápio do iFood. Mesma identidade que o código usa (nome
  // normalizado), então as duas rotas levam ao mesmo cadastro.
  const porNome = (linhas: Record<string, unknown>[] | null) => {
    const mapa = new Map<string, string>();
    for (const l of linhas ?? []) {
      const k = normalizar(l.name);
      if (!k) continue;
      const atual = mapa.get(k);
      const id = String(l.id);
      if (!atual || (!comFicha.has(atual) && comFicha.has(id))) mapa.set(k, id);
    }
    return mapa;
  };

  const nomeProduto = porNome(prods as Record<string, unknown>[] | null);
  const nomeOpcao = porNome(opcoesCat as Record<string, unknown>[] | null);

  const refDe = (kind: string, code: unknown, nome?: unknown): string | null => {
    const c = String(code ?? "").trim();
    const porCodigo = c ? catalogo.get(`${kind}:${c}`) ?? null : null;
    if (porCodigo) return porCodigo;
    const k = normalizar(nome);
    if (!k) return null;
    return (kind === "product" ? nomeProduto.get(k) : nomeOpcao.get(k)) ?? null;
  };

  const items = pick(order, ["items"], []) as Record<string, unknown>[];
  for (const it of items ?? []) {
    const qty = Number(pick(it, ["quantity"], 1)) || 1;
    const unit = money(pick(it, ["unitPrice"], 0));
    const opts = pick(it, ["options"], []) as Record<string, unknown>[];
    const obs = pick(it, ["observations"], null) as string | null;

    const { data: linha, error: itemErr } = await supabase
      .from("delivery_order_items")
      .insert({
        order_id: inserted.id,
        product_id: refDe("product", pick(it, ["externalCode"], null), pick(it, ["name"], null)),
        // NULL de propósito: quem decide a praça é o gatilho
        // delivery_resolve_item_center, que tenta o produto primeiro e só
        // depois cai no padrão da integração. Gravar o padrão aqui atropelaria
        // a praça correta do item.
        production_center_id: null,
        product_name: String(pick(it, ["name"], "Item")),
        quantity: qty,
        unit_price: unit,
        subtotal: money(pick(it, ["totalPrice"], unit * qty)),
        // Os adicionais viraram linha própria (abaixo), então repeti-los aqui
        // sairia duas vezes na comanda impressa. Fica só a observação do cliente.
        notes: obs || null,
        external_product_id: pick(it, ["externalCode", "id"], null),
        external_name: pick(it, ["name"], null),
        external_options: opts ?? null,
        external_unique_id: pick(it, ["uniqueId"], null),
        external_index: pick(it, ["index"], null),
      })
      .select("id")
      .single();

    if (itemErr) {
      console.error("[ifood] item insert:", errText(itemErr));
      continue;
    }

    // Cada adicional vira uma LINHA do pedido (decisão do cliente em
    // 10/09/2026). É a mesma tabela que o delivery próprio usa, então
    // impressão, fila do caixa, detalhe do pedido e a baixa de estoque já
    // sabem ler — não precisou de tela nova.
    const linhasOpcao = achatarOpcoes(opts);
    if (linha && linhasOpcao.length) {
      const { error: optErr } = await supabase.from("delivery_order_item_options").insert(
        linhasOpcao.map((o) => ({
          order_item_id: linha.id,
          option_item_id: refDe("option_item", o.externalCode, o.name),
          option_name: o.groupName,
          item_name: o.name,
          quantity: o.quantity,
          price_adjustment: o.unitPrice,
        })),
      );
      if (optErr) console.error("[ifood] options insert:", errText(optErr));
    }
  }

  await ifLog(supabase, userId, "order_ingest", "ok", {
    message: `Pedido ${pick(order, ["displayId"], externalId)} recebido`,
  });
  await ifClearError(supabase, userId);

  // Aceite automático. O iFood cancela pedido não confirmado em poucos
  // minutos, e a homologação reprova o cenário inteiro quando isso acontece.
  // Fica atrás de configuração porque confirmar sem ninguém no balcão é uma
  // decisão do estabelecimento, não do software.
  if (settings?.ifood_auto_accept) {
    const { status, body } = await ifApi(token, `/order/v1.0/orders/${externalId}/confirm`, {
      method: "POST",
    });
    await ifLog(supabase, userId, "auto_confirm", ifOk(status) ? "ok" : "error", {
      httpStatus: status,
      details: body,
      message: `Pedido ${pick(order, ["displayId"], externalId)}`,
    });
    if (ifOk(status)) {
      await supabase.from("delivery_orders")
        .update({ status: "preparing", confirmed_at: nowIso() })
        .eq("id", inserted.id);
    }
  }
}

// ── ações de volta para a plataforma ────────────────────────────────────────
const ACTION_PATH: Record<string, string> = {
  confirm: "confirm",
  ready_to_pickup: "readyToPickup",
  dispatch: "dispatch",
};

async function pushAction(
  supabase: SupabaseClient,
  userId: string,
  orderId: string,
  action: string,
  extra: Record<string, unknown>,
) {
  const { data: order } = await supabase
    .from("delivery_orders")
    .select("id, external_order_id, order_type, status, external_code")
    .eq("id", orderId).eq("user_id", userId).eq("source", IFOOD_SOURCE)
    .maybeSingle();

  if (!order?.external_order_id) throw new Error("Pedido do iFood não encontrado.");

  const token = await ifAppToken(supabase);
  const ext = order.external_order_id;

  if (action === "cancel") {
    const code = String(extra.cancellationCode ?? "");
    const reason = String(extra.reason ?? "");
    if (!code) throw new Error("O iFood exige um código de motivo para cancelar.");

    const { status, body } = await ifApi(token, `/order/v1.0/orders/${ext}/requestCancellation`, {
      method: "POST",
      body: JSON.stringify({ reason, cancellationCode: code }),
    });
    await ifLog(supabase, userId, "cancel", ifOk(status) ? "ok" : "error", { httpStatus: status, details: body });
    if (!ifOk(status)) {
      await ifSetError(supabase, userId, `O iFood recusou o cancelamento (${status}).`);
      throw new Error(`iFood recusou o cancelamento (${status}).`);
    }
    // não marca cancelado aqui: o cancelamento vale quando o evento CAN chega
    await supabase.from("delivery_orders")
      .update({ external_cancellation_code: code, cancellation_reason: reason })
      .eq("id", order.id);
    return { ok: true, pending: true };
  }

  const path = ACTION_PATH[action];
  if (!path) throw new Error(`Ação "${action}" não existe no iFood.`);

  const { status, body } = await ifApi(token, `/order/v1.0/orders/${ext}/${path}`, { method: "POST" });
  await ifLog(supabase, userId, action, ifOk(status) ? "ok" : "error", { httpStatus: status, details: body });

  if (!ifOk(status)) {
    await ifSetError(supabase, userId, `O iFood recusou "${action}" (${status}).`);
    throw new Error(`iFood recusou "${action}" (${status}).`);
  }

  // 202 = aceito, não aplicado. O estado verdadeiro chega no próximo evento;
  // o reflexo local aqui é só para a tela não ficar parada.
  const localStatus = action === "confirm" ? "preparing"
    : action === "dispatch" ? "delivering" : "ready";
  const patch: Record<string, unknown> = { status: localStatus };
  if (action === "confirm") patch.confirmed_at = nowIso();
  if (action === "ready_to_pickup") patch.ready_at = nowIso();
  await supabase.from("delivery_orders").update(patch).eq("id", order.id);

  await ifClearError(supabase, userId);
  return { ok: true, httpStatus: status };
}

// ── handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: ifCors });

  const supabase = serviceClient();

  try {
    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action ?? "");

    // cron: sem usuário, autenticado por secret
    if (action === "sweep" || req.headers.get("x-sweep-secret")) {
      if (SWEEP_SECRET && req.headers.get("x-sweep-secret") !== SWEEP_SECRET) {
        return ifJson({ error: "unauthorized" }, 401);
      }
      return ifJson(await sweep(supabase));
    }

    const user = await ifRequireUser(supabase, req);

    if (action === "cancellation_reasons") {
      const { data: order } = await supabase
        .from("delivery_orders").select("external_order_id")
        .eq("id", String(payload.orderId ?? "")).eq("user_id", user.id).maybeSingle();
      if (!order?.external_order_id) throw new Error("Pedido não encontrado.");
      const token = await ifAppToken(supabase);
      const { body } = await ifApi(token, `/order/v1.0/orders/${order.external_order_id}/cancellationReasons`);
      return ifJson({ reasons: body });
    }

    return ifJson(await pushAction(supabase, user.id, String(payload.orderId ?? ""), action, payload));
  } catch (err) {
    const e = err as { message?: string; status?: number };
    return ifJson({ error: e.message ?? String(err) }, e.status ?? 400);
  }
});
