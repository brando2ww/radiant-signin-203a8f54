// purchase-order-receipt — recebimento de pedido de compra pelo QR público.
//
// Um QR fixo fica colado na doca. Quem recebe aponta o celular, escolhe o pedido
// que chegou, confere item a item e confirma com a senha de operador. A rota
// pública /recebimento/:token chama esta função; o acesso é gateado pelo token
// de pdv_receipt_links e tudo é lido/gravado com service-role (sem RLS anônima).
//
// Ações: "list" (pedidos em aberto), "load" (itens de um pedido), "receive".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Só pedido que já saiu para o fornecedor pode chegar na doca. 'draft' fica de
// fora de propósito: nada foi pedido ainda, então nada está chegando.
const RECEIVABLE = ["sent", "confirmed", "partial"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const action: string = payload?.action;
  const token: string = payload?.token;
  if (!action || !token) return json({ error: "missing_params" }, 400);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Resolve o tenant pelo token do QR. Um QR revogado morre aqui.
    const { data: link } = await service
      .from("pdv_receipt_links")
      .select("id, user_id, is_active")
      .eq("token", token)
      .maybeSingle();

    if (!link || !link.is_active) return json({ status: "invalid" });

    const { data: settings } = await service
      .from("business_settings")
      .select("business_name, logo_url, primary_color")
      .eq("user_id", link.user_id)
      .maybeSingle();

    const business = {
      name: settings?.business_name ?? null,
      logo_url: settings?.logo_url ?? null,
      color: settings?.primary_color ?? null,
    };

    // ---------- LIST ----------
    if (action === "list") {
      const { data: orders } = await service
        .from("pdv_purchase_orders")
        .select(`
          id, order_number, status, order_date, expected_delivery, total,
          supplier:pdv_suppliers(name),
          items:pdv_purchase_order_items(id)
        `)
        .eq("user_id", link.user_id)
        .in("status", RECEIVABLE)
        .order("order_date", { ascending: false });

      return json({
        status: "ok",
        business,
        orders: (orders ?? []).map((o: any) => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          order_date: o.order_date,
          expected_delivery: o.expected_delivery,
          total: o.total,
          supplier_name: o.supplier?.name ?? "Fornecedor",
          item_count: (o.items ?? []).length,
        })),
      });
    }

    const orderId: string = payload?.orderId;
    if (!orderId) return json({ error: "missing_params" }, 400);

    // O pedido tem que ser do dono do token, senão o token de um tenant leria
    // o pedido de outro.
    const { data: order } = await service
      .from("pdv_purchase_orders")
      .select(`
        id, order_number, status, order_date, expected_delivery,
        subtotal, freight, discount, total, notes,
        supplier:pdv_suppliers(name, phone, whatsapp)
      `)
      .eq("id", orderId)
      .eq("user_id", link.user_id)
      .maybeSingle();

    if (!order) return json({ status: "invalid" });

    // ---------- LOAD ----------
    if (action === "load") {
      // Marca e conservação não vivem no item do pedido: vêm da resposta de
      // cotação que venceu. Sem elas quem confere não sabe se o entrecot que
      // chegou é o congelado ou o resfriado que foi comprado.
      const { data: items } = await service
        .from("pdv_purchase_order_items")
        .select(`
          id, quantity, quantity_received, unit, unit_price, total_price, notes,
          ingredient:pdv_ingredients(name),
          response:pdv_quotation_responses(brand, conservation)
        `)
        .eq("purchase_order_id", orderId);

      return json({
        status: RECEIVABLE.includes(order.status ?? "") ? "open" : "closed",
        business,
        order: {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          expected_delivery: order.expected_delivery,
          subtotal: order.subtotal,
          freight: order.freight,
          discount: order.discount,
          total: order.total,
          notes: order.notes,
          supplier_name: (order.supplier as any)?.name ?? "Fornecedor",
        },
        items: (items ?? []).map((it: any) => ({
          id: it.id,
          ingredient_name: it.ingredient?.name ?? "Item",
          brand: it.response?.brand ?? null,
          conservation: it.response?.conservation ?? null,
          quantity: Number(it.quantity) || 0,
          quantity_received: it.quantity_received == null ? null : Number(it.quantity_received),
          unit: it.unit,
          unit_price: Number(it.unit_price) || 0,
          total_price: Number(it.total_price) || 0,
          notes: it.notes,
        })),
      });
    }

    // ---------- RECEIVE ----------
    if (action === "receive") {
      if (!RECEIVABLE.includes(order.status ?? "")) return json({ status: "closed" });

      const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
      if (items.length === 0) return json({ error: "no_items" }, 400);

      const password: string = (payload?.password ?? "").trim();
      if (!password) return json({ error: "password_required" }, 400);

      // Mesma senha de operador da sangria/fechamento de caixa. É o que
      // transforma "qualquer um marcou" em "Marcelo conferiu".
      const { data: users } = await service
        .from("establishment_users")
        .select("id, user_id, display_name, discount_password")
        .eq("establishment_owner_id", link.user_id)
        .eq("is_active", true);

      const actor = (users ?? []).find(
        (u: any) => (u.discount_password ?? "") !== "" && u.discount_password === password,
      );
      // 200 de propósito: supabase-js transforma não-2xx em exceção no cliente,
      // e aí a página perderia a mensagem exata (senha errada vira "erro").
      if (!actor) return json({ error: "invalid_password" });

      const actorName = actor.display_name || "operador";

      const cleanItems = items
        .filter((i) => i?.item_id && i?.quantity != null && !Number.isNaN(Number(i.quantity)))
        .map((i) => ({ item_id: i.item_id, quantity: Number(i.quantity) }));

      if (cleanItems.length === 0) return json({ error: "no_items" }, 400);

      // O core valida posse, trava estorno/excesso no canal 'public' e é a
      // única fonte da verdade do estoque e do custo médio.
      const { data: result, error: rpcErr } = await service.rpc(
        "pdv_receive_purchase_order_core",
        {
          p_user_id: link.user_id,
          p_order_id: orderId,
          p_items: cleanItems,
          p_actor: `conferido por ${actorName}, via QR`,
          p_channel: "public",
        },
      );

      // Idem: a trava de estorno/excesso do core vira mensagem na tela.
      if (rpcErr) {
        console.error("receive error:", rpcErr.message);
        return json({ error: "receive_failed", message: rpcErr.message });
      }

      await service.from("pdv_receipt_events").insert({
        user_id: link.user_id,
        purchase_order_id: orderId,
        actor_name: actorName,
        actor_user_id: actor.user_id ?? null,
        payload: cleanItems,
        result,
      });

      return json({ status: "ok", actor_name: actorName, result });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("purchase-order-receipt error:", (e as Error).message);
    return json({ error: "server_error" }, 500);
  }
});
