// food99-webhook — receptor do webhook do 99Food (fase 1: captura).
// Público (sem JWT), protegido por token na URL (?token=). Guarda o payload cru
// em food99_webhook_events para depois mapearmos os pedidos em delivery_orders.
// URL de registro no 99Food:
//   https://<proj>.supabase.co/functions/v1/food99-webhook?token=SECRET&store=<user_id>
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Tenta achar campos comuns independentemente do formato exato do 99Food.
function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const secret = Deno.env.get("FOOD99_WEBHOOK_TOKEN");
  if (!secret || url.searchParams.get("token") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Alguns webhooks fazem um "handshake" GET/HEAD de verificação — responde 200.
  if (req.method === "GET" || req.method === "HEAD") return ok({ ok: true, service: "food99-webhook" });

  let payload: any = null;
  try { payload = await req.json(); } catch { payload = { _raw: await req.text().catch(() => "") }; }

  const store = url.searchParams.get("store");
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  const eventType = pick(payload, ["event", "eventType", "type", "status", "code"]);
  const externalOrderId = pick(payload, ["orderId", "order_id", "id", "orderCode", "displayId"]) ??
    pick(payload?.order ?? {}, ["id", "orderId", "code"]);

  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await service.from("food99_webhook_events").insert({
      user_id: store || null,
      event_type: eventType ? String(eventType) : null,
      external_order_id: externalOrderId ? String(externalOrderId) : null,
      payload,
      headers,
    });
  } catch (e) {
    console.error("food99-webhook store error:", (e as Error).message);
  }

  // Sempre 200 para o 99Food não re-tentar em massa.
  return ok({ received: true });
});
