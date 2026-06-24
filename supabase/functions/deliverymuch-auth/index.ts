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

function getEnvUrls(env: string) {
  if (env === "prod") {
    return {
      authUrl: "https://auth.deliverymuch.com.br/oauth/token",
      apiUrl: "https://api.deliverymuch.com.br",
      audience: "https://api.deliverymuch.com.br/",
    };
  }
  return {
    authUrl: "https://devmuch-api.auth0.com/oauth/token",
    apiUrl: "https://api.devmuch.io",
    audience: "https://api.devmuch.io/",
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

function extractRestaurantUuid(payload: Record<string, unknown>): string | null {
  // Auth0 stores custom claims with namespace prefix; try common patterns
  const candidates = [
    payload["https://deliverymuch.com.br/restaurant_uuid"],
    payload["https://api.deliverymuch.com.br/restaurant_uuid"],
    payload["restaurant_uuid"],
    payload["restaurantId"],
    payload["sub"],
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c) return c;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("DELIVERYMUCH_CLIENT_ID");
    const clientSecret = Deno.env.get("DELIVERYMUCH_CLIENT_SECRET");
    const envName = Deno.env.get("DELIVERYMUCH_ENV") ?? "dev";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // ── disconnect ──────────────────────────────────────────────────────────
    if (action === "disconnect") {
      const { error } = await supabase
        .from("pdv_settings")
        .update({
          deliverymuch_enabled: false,
          deliverymuch_access_token: null,
          deliverymuch_token_expires_at: null,
          deliverymuch_restaurant_uuid: null,
        })
        .eq("user_id", user.id);
      if (error) throw error;
      return json({ success: true });
    }

    // Remaining actions require app credentials
    if (!clientId || !clientSecret) {
      return json(
        { error: "Integração DeliveryMuch não configurada pelo administrador", code: "deliverymuch_not_configured" },
        503,
      );
    }

    const { authUrl, apiUrl, audience } = getEnvUrls(envName);

    // ── connect ─────────────────────────────────────────────────────────────
    if (action === "connect") {
      const { email, password } = body;
      if (!email || !password) return json({ error: "email e password são obrigatórios" }, 400);

      const tokenRes = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "password",
          username: email,
          password,
          client_id: clientId,
          client_secret: clientSecret,
          audience,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error("DeliveryMuch auth error:", err);
        return json({ error: "Credenciais inválidas ou erro na autenticação DeliveryMuch" }, 400);
      }

      const tokenData = await tokenRes.json();
      const accessToken: string = tokenData.access_token;

      const payload = decodeJwtPayload(accessToken);
      const restaurantUuid = extractRestaurantUuid(payload);

      const expiresAt = new Date(Date.now() + ((tokenData.expires_in ?? 86400) * 1000)).toISOString();

      const { error: updateError } = await supabase
        .from("pdv_settings")
        .update({
          deliverymuch_enabled: true,
          deliverymuch_email: email,
          deliverymuch_access_token: accessToken,
          deliverymuch_token_expires_at: expiresAt,
          deliverymuch_restaurant_uuid: restaurantUuid,
        })
        .eq("user_id", user.id);
      if (updateError) throw updateError;

      return json({ success: true, restaurantUuid });
    }

    // ── toggle_online ────────────────────────────────────────────────────────
    if (action === "toggle_online") {
      const { online } = body as { online: boolean };
      const settings = await getSettings(supabase, user.id);
      if (!settings?.deliverymuch_restaurant_uuid || !settings?.deliverymuch_access_token) {
        return json({ error: "Integração não conectada" }, 400);
      }

      const res = await fetch(`${apiUrl}/v2/restaurants/${settings.deliverymuch_restaurant_uuid}/status`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${settings.deliverymuch_access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ online }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("DeliveryMuch toggle_online error:", err);
        return json({ error: "Erro ao atualizar status online" }, 400);
      }

      return json({ success: true, online });
    }

    // ── set_delivery_time ────────────────────────────────────────────────────
    if (action === "set_delivery_time") {
      const { delivery_min, pickup_min } = body as { delivery_min: number; pickup_min: number };
      const settings = await getSettings(supabase, user.id);
      if (!settings?.deliverymuch_restaurant_uuid || !settings?.deliverymuch_access_token) {
        return json({ error: "Integração não conectada" }, 400);
      }

      const res = await fetch(`${apiUrl}/v2/restaurants/${settings.deliverymuch_restaurant_uuid}/delivery-time`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${settings.deliverymuch_access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deliveryTime: delivery_min, pickupTime: pickup_min }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("DeliveryMuch set_delivery_time error:", err);
        return json({ error: "Erro ao atualizar tempos de entrega" }, 400);
      }

      // Persist locally
      await supabase
        .from("pdv_settings")
        .update({ deliverymuch_delivery_time_min: delivery_min, deliverymuch_pickup_time_min: pickup_min })
        .eq("user_id", user.id);

      return json({ success: true });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    console.error("deliverymuch-auth error:", err);
    return json({ error: String(err) }, 500);
  }
});

async function getSettings(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from("pdv_settings")
    .select("deliverymuch_access_token, deliverymuch_restaurant_uuid, deliverymuch_token_expires_at, deliverymuch_email")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}
