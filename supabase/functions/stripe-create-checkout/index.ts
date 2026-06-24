import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ModuleKey = "tarefas" | "avaliacoes" | "compras" | "pdv_completo";

function getPriceId(moduleKey: ModuleKey): string | null {
  const map: Record<ModuleKey, string | undefined> = {
    tarefas: Deno.env.get("STRIPE_PRICE_TAREFAS"),
    avaliacoes: Deno.env.get("STRIPE_PRICE_AVALIACOES"),
    compras: Deno.env.get("STRIPE_PRICE_COMPRAS"),
    pdv_completo: Deno.env.get("STRIPE_PRICE_PDV_COMPLETO"),
  };
  return map[moduleKey] ?? null;
}

function getBillingAnchor(): number {
  const day = parseInt(Deno.env.get("STRIPE_BILLING_ANCHOR_DAY") || "1");
  const now = new Date();
  let anchor = new Date(now.getFullYear(), now.getMonth(), day);
  if (anchor <= now) {
    anchor = new Date(now.getFullYear(), now.getMonth() + 1, day);
  }
  return Math.floor(anchor.getTime() / 1000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const appUrl = Deno.env.get("APP_URL") ?? "https://app.velara.com.br";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenantId, moduleKeys } = await req.json() as {
      tenantId: string;
      moduleKeys: ModuleKey[];
    };

    if (!tenantId || !moduleKeys?.length) {
      return new Response(
        JSON.stringify({ error: "tenantId e moduleKeys são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verificar que caller é o proprietário do tenant
    const { data: tenant } = await adminClient
      .from("tenants")
      .select("id, name, owner_user_id, stripe_customer_id")
      .eq("id", tenantId)
      .maybeSingle();

    if (!tenant || tenant.owner_user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas o proprietário pode criar assinatura." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar moduleKeys e obter price IDs
    const lineItems: { price: string }[] = [];
    for (const mk of moduleKeys) {
      const priceId = getPriceId(mk);
      if (!priceId) {
        return new Response(
          JSON.stringify({ error: `Price ID não configurado para módulo: ${mk}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      lineItems.push({ price: priceId });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-11-20.acacia" });

    // Criar ou reutilizar Stripe Customer
    let stripeCustomerId = tenant.stripe_customer_id as string | null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: tenant.name,
        metadata: {
          tenant_id: tenantId,
          owner_user_id: user.id,
        },
      });
      stripeCustomerId = customer.id;

      // Salvar customer_id no tenant
      await adminClient
        .from("tenants")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", tenantId);

      // Salvar em stripe_customers
      await adminClient.from("stripe_customers").upsert({
        tenant_id: tenantId,
        owner_user_id: user.id,
        stripe_customer_id: stripeCustomerId,
      }, { onConflict: "tenant_id" });
    }

    const isPdvCompleto = moduleKeys.includes("pdv_completo");
    const planKey = isPdvCompleto ? "pdv_completo" : null;

    // Criar Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: lineItems,
      success_url: `${appUrl}/onboarding/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/onboarding?step=2`,
      subscription_data: {
        billing_cycle_anchor: getBillingAnchor(),
        proration_behavior: (Deno.env.get("STRIPE_PRORATION_BEHAVIOR") ?? "create_prorations") as Stripe.SubscriptionCreateParams.ProrationBehavior,
        metadata: {
          tenant_id: tenantId,
          owner_user_id: user.id,
          module_keys: moduleKeys.join(","),
          plan_key: planKey ?? "",
        },
      },
      metadata: {
        tenant_id: tenantId,
        owner_user_id: user.id,
        module_keys: moduleKeys.join(","),
        plan_key: planKey ?? "",
      },
      client_reference_id: tenantId,
      allow_promotion_codes: true,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("stripe-create-checkout error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
