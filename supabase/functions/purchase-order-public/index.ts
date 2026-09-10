// purchase-order-public — o pedido de compra visto pelo FORNECEDOR, sem login.
//
// Existe porque o modelo aprovado na Meta não comporta a relação de itens: cada
// parâmetro é uma linha só e estoura perto de 1024 caracteres. O WhatsApp leva o
// resumo e um botão; a lista inteira e a confirmação ficam aqui.
//
// Rota pública /pedido/:token no app chama esta função. O acesso é gateado pelo
// `public_token` de pdv_purchase_orders e tudo é lido/gravado com service-role
// (nenhuma política anônima é aberta no banco).
//
// Ações: "load" (pedido + itens) e "confirm" (aceite do fornecedor).
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

/** O botão da Meta pode colar lixo antes do token (ver og-cotacao). */
const limparToken = (bruto: string): string =>
  decodeURIComponent(bruto).match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  )?.[0] ?? bruto.trim();

// Confirmar um pedido já recebido ou cancelado não faz sentido: a confirmação é
// promessa de entrega, e a mercadoria desses já chegou ou não vai chegar.
const CONFIRMAVEL = ["draft", "sent", "confirmed"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const action: string = payload?.action;
  const token = limparToken(String(payload?.token ?? ""));
  if (!action || !token) return json({ error: "missing_params" }, 400);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: order } = await service
      .from("pdv_purchase_orders")
      .select(
        "id, user_id, supplier_id, order_number, status, order_date, expected_delivery, " +
        "subtotal, discount, freight, total, payment_terms, notes, whatsapp_sent_at, " +
        "supplier_viewed_at, supplier_confirmed_at, supplier_note",
      )
      .eq("public_token", token)
      .maybeSingle();

    if (!order) return json({ status: "invalid" });

    if (action === "confirm") {
      if (!CONFIRMAVEL.includes(order.status ?? "")) {
        return json({ status: "closed", orderStatus: order.status });
      }
      // Idempotente: reabrir o link e clicar de novo não reescreve a data do
      // primeiro aceite, que é a que vale como prova.
      const jaConfirmado = !!order.supplier_confirmed_at;
      const note = String(payload?.note ?? "").trim().slice(0, 500);
      const patch: Record<string, unknown> = {
        supplier_confirmed_at: jaConfirmado ? order.supplier_confirmed_at : new Date().toISOString(),
        status: "confirmed",
        updated_at: new Date().toISOString(),
      };
      if (note) patch.supplier_note = note;

      const { error } = await service
        .from("pdv_purchase_orders")
        .update(patch)
        .eq("id", order.id);
      if (error) {
        console.error("confirm error:", error.message);
        return json({ error: "confirm_failed" }, 500);
      }
      return json({ status: "ok", confirmedAt: patch.supplier_confirmed_at });
    }

    if (action !== "load") return json({ error: "unknown_action" }, 400);

    // Primeira abertura fica registrada: o comprador precisa saber se a mensagem
    // chegou de fato antes de ligar cobrando resposta.
    if (!order.supplier_viewed_at) {
      await service
        .from("pdv_purchase_orders")
        .update({ supplier_viewed_at: new Date().toISOString() })
        .eq("id", order.id);
    }

    const [{ data: brand }, { data: settings }, { data: supplier }, { data: items }] =
      await Promise.all([
        service
          .from("business_settings")
          .select("business_name, logo_url, primary_color")
          .eq("user_id", order.user_id)
          .maybeSingle(),
        service
          .from("pdv_settings")
          .select("business_name, business_cnpj, business_phone, business_address, business_city, business_state")
          .eq("user_id", order.user_id)
          .maybeSingle(),
        order.supplier_id
          ? service
              .from("pdv_suppliers")
              .select("name, contact_name")
              .eq("id", order.supplier_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        service
          .from("pdv_purchase_order_items")
          .select("id, quantity, unit, unit_price, total_price, notes, ingredient:pdv_ingredients(name)")
          .eq("purchase_order_id", order.id)
          .order("created_at", { ascending: true }),
      ]);

    return json({
      status: "ok",
      business: {
        name: settings?.business_name || brand?.business_name || "Pedido de compra",
        logo_url: brand?.logo_url ?? null,
        color: brand?.primary_color ?? null,
        cnpj: settings?.business_cnpj ?? null,
        phone: settings?.business_phone ?? null,
        address: settings?.business_address ?? null,
        city: settings?.business_city ?? null,
        state: settings?.business_state ?? null,
      },
      supplier: supplier ? { name: supplier.name, contact_name: supplier.contact_name } : null,
      order: {
        number: order.order_number,
        status: order.status,
        date: order.order_date,
        expected_delivery: order.expected_delivery,
        payment_terms: order.payment_terms,
        subtotal: Number(order.subtotal ?? 0),
        discount: Number(order.discount ?? 0),
        freight: Number(order.freight ?? 0),
        total: Number(order.total ?? 0),
        confirmed_at: order.supplier_confirmed_at,
        supplier_note: order.supplier_note,
      },
      items: (items ?? []).map((i: any) => ({
        id: i.id,
        name: i.ingredient?.name ?? "Item",
        quantity: Number(i.quantity ?? 0),
        unit: i.unit,
        unit_price: Number(i.unit_price ?? 0),
        total_price: Number(i.total_price ?? 0),
        notes: i.notes ?? null,
      })),
    });
  } catch (err) {
    console.error("purchase-order-public error:", err);
    return json({ error: "internal" }, 500);
  }
});
