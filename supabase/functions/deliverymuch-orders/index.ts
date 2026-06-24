import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getApiUrl() {
  const env = Deno.env.get("DELIVERYMUCH_ENV") ?? "dev";
  return env === "prod" ? "https://api.deliverymuch.com.br" : "https://api.devmuch.io";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: settings, error: settingsError } = await supabase
      .from("pdv_settings")
      .select("deliverymuch_access_token, deliverymuch_restaurant_uuid, deliverymuch_token_expires_at, deliverymuch_enabled")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) throw settingsError;
    if (!settings?.deliverymuch_enabled || !settings?.deliverymuch_access_token) {
      return json({ error: "Integração DeliveryMuch não conectada" }, 400);
    }

    const apiUrl = getApiUrl();
    const accessToken = settings.deliverymuch_access_token;
    const restaurantId = settings.deliverymuch_restaurant_uuid;

    const body = await req.json().catch(() => ({}));
    const { action, orderId, reason } = body;

    const apiHeaders = {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    // ── list_orders ──────────────────────────────────────────────────────────
    if (action === "list_orders") {
      const res = await fetch(`${apiUrl}/v2/orders?restaurantId=${restaurantId}&status=OPENED`, {
        headers: apiHeaders,
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("list_orders error:", err);
        return json({ error: "Erro ao buscar pedidos" }, res.status);
      }
      const data = await res.json();
      return json({ orders: data });
    }

    // ── confirm_order ────────────────────────────────────────────────────────
    if (action === "confirm_order") {
      if (!orderId) return json({ error: "orderId é obrigatório" }, 400);
      const res = await fetch(`${apiUrl}/v2/orders/${orderId}/confirm`, {
        method: "POST",
        headers: apiHeaders,
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("confirm_order error:", err);
        return json({ error: "Erro ao aceitar pedido" }, res.status);
      }
      return json({ success: true });
    }

    // ── mark_ready ───────────────────────────────────────────────────────────
    if (action === "mark_ready") {
      if (!orderId) return json({ error: "orderId é obrigatório" }, 400);
      const res = await fetch(`${apiUrl}/v2/orders/${orderId}/ready`, {
        method: "POST",
        headers: apiHeaders,
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("mark_ready error:", err);
        return json({ error: "Erro ao marcar pedido como pronto" }, res.status);
      }
      return json({ success: true });
    }

    // ── cancel_order ─────────────────────────────────────────────────────────
    if (action === "cancel_order") {
      if (!orderId) return json({ error: "orderId é obrigatório" }, 400);
      const res = await fetch(`${apiUrl}/v2/orders/${orderId}/cancel`, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({ reason: reason ?? "Cancelado pelo estabelecimento" }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("cancel_order error:", err);
        return json({ error: "Erro ao cancelar pedido" }, res.status);
      }
      return json({ success: true });
    }

    // ── mark_printed ─────────────────────────────────────────────────────────
    if (action === "mark_printed") {
      if (!orderId) return json({ error: "orderId é obrigatório" }, 400);
      const res = await fetch(`${apiUrl}/v2/orders/${orderId}/printed`, {
        method: "POST",
        headers: apiHeaders,
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("mark_printed error:", err);
        return json({ error: "Erro ao marcar pedido como impresso" }, res.status);
      }
      return json({ success: true });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    console.error("deliverymuch-orders error:", err);
    return json({ error: String(err) }, 500);
  }
});
