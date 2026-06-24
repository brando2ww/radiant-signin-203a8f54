import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Mapa de price_id → módulos liberados
function buildPriceModuleMap(): Record<string, string[]> {
  return {
    [Deno.env.get("STRIPE_PRICE_TAREFAS") ?? ""]: ["tarefas"],
    [Deno.env.get("STRIPE_PRICE_AVALIACOES") ?? ""]: ["avaliacoes"],
    [Deno.env.get("STRIPE_PRICE_COMPRAS") ?? ""]: ["compras"],
    [Deno.env.get("STRIPE_PRICE_PDV_COMPLETO") ?? ""]: ["pdv", "compras", "tarefas", "avaliacoes"],
  };
}

async function activateModules(
  adminClient: ReturnType<typeof createClient>,
  tenantId: string,
  modules: string[],
  periodEnd: Date | null
) {
  if (!modules.length) return;
  const { error } = await adminClient.from("tenant_modules").upsert(
    modules.map((m) => ({
      tenant_id: tenantId,
      module: m,
      is_active: true,
      expires_at: periodEnd ? periodEnd.toISOString() : null,
    })),
    { onConflict: "tenant_id,module" }
  );
  if (error) console.error("activateModules error:", error);
}

async function deactivateModules(
  adminClient: ReturnType<typeof createClient>,
  tenantId: string,
  modules: string[]
) {
  if (!modules.length) return;
  const { error } = await adminClient
    .from("tenant_modules")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .in("module", modules);
  if (error) console.error("deactivateModules error:", error);
}

function getModulesFromSubscription(
  subscription: Stripe.Subscription,
  priceModuleMap: Record<string, string[]>
): string[] {
  const set = new Set<string>();
  for (const item of subscription.items.data) {
    const modules = priceModuleMap[item.price.id] ?? [];
    modules.forEach((m) => set.add(m));
  }
  return [...set];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-11-20.acacia" });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !webhookSecret) {
    return new Response(JSON.stringify({ error: "Missing signature or webhook secret" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(JSON.stringify({ error: `Webhook error: ${err.message}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Idempotência — pular se já processado
  const { data: existingEvent } = await adminClient
    .from("stripe_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existingEvent) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const priceModuleMap = buildPriceModuleMap();
  let tenantId: string | null = null;
  let errorMessage: string | null = null;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription" || !session.subscription) break;

        tenantId = session.metadata?.tenant_id ?? session.client_reference_id ?? null;
        if (!tenantId) {
          throw new Error("tenant_id não encontrado nos metadata da sessão");
        }

        const moduleKeys = (session.metadata?.module_keys ?? "").split(",").filter(Boolean);
        const planKey = session.metadata?.plan_key || null;
        const ownerUserId = session.metadata?.owner_user_id ?? "";

        // Buscar assinatura completa com items
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
          { expand: ["items.data.price"] }
        );

        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null;

        // Salvar stripe_customers
        await adminClient.from("stripe_customers").upsert({
          tenant_id: tenantId,
          owner_user_id: ownerUserId,
          stripe_customer_id: subscription.customer as string,
          updated_at: new Date().toISOString(),
        }, { onConflict: "tenant_id" });

        // Atualizar stripe_customer_id no tenant
        await adminClient.from("tenants")
          .update({ stripe_customer_id: subscription.customer as string })
          .eq("id", tenantId);

        // Salvar tenant_subscriptions
        const { data: sub, error: subError } = await adminClient
          .from("tenant_subscriptions")
          .upsert({
            tenant_id: tenantId,
            stripe_customer_id: subscription.customer as string,
            stripe_subscription_id: subscription.id,
            status: subscription.status,
            plan_key: planKey,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: periodEnd?.toISOString() ?? null,
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          }, { onConflict: "stripe_subscription_id" })
          .select()
          .single();

        if (subError) throw new Error(`Erro ao salvar subscription: ${subError.message}`);

        // Salvar subscription_items
        for (const item of subscription.items.data) {
          const itemModules = priceModuleMap[item.price.id] ?? [];
          const itemModuleKey = moduleKeys.find((mk) => {
            const priceForMk = Deno.env.get(`STRIPE_PRICE_${mk.toUpperCase().replace("_", "_")}`);
            return priceForMk === item.price.id;
          }) ?? itemModules[0] ?? "unknown";

          await adminClient.from("subscription_items").upsert({
            subscription_id: sub.id,
            tenant_id: tenantId,
            stripe_subscription_item_id: item.id,
            stripe_price_id: item.price.id,
            module_key: itemModuleKey,
            status: "active",
          }, { onConflict: "stripe_subscription_item_id" });
        }

        // Ativar módulos
        const modules = getModulesFromSubscription(subscription, priceModuleMap);
        await activateModules(adminClient, tenantId, modules, periodEnd);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        tenantId = subscription.metadata?.tenant_id ?? null;
        if (!tenantId) break;

        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null;

        await adminClient.from("tenant_subscriptions").upsert({
          tenant_id: tenantId,
          stripe_customer_id: subscription.customer as string,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          plan_key: subscription.metadata?.plan_key || null,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: periodEnd?.toISOString() ?? null,
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        }, { onConflict: "stripe_subscription_id" });

        if (subscription.status === "active") {
          const modules = getModulesFromSubscription(subscription, priceModuleMap);
          await activateModules(adminClient, tenantId, modules, periodEnd);
        } else if (["canceled", "unpaid", "incomplete_expired", "past_due"].includes(subscription.status)) {
          const modules = getModulesFromSubscription(subscription, priceModuleMap);
          await deactivateModules(adminClient, tenantId, modules);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        tenantId = subscription.metadata?.tenant_id ?? null;
        if (!tenantId) break;

        await adminClient.from("tenant_subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subscription.id);

        const modules = getModulesFromSubscription(subscription, priceModuleMap);
        await deactivateModules(adminClient, tenantId, modules);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        tenantId = subscription.metadata?.tenant_id ?? null;
        if (!tenantId) break;

        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null;

        await adminClient.from("tenant_subscriptions")
          .update({
            status: "active",
            current_period_end: periodEnd?.toISOString() ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        const modules = getModulesFromSubscription(subscription, priceModuleMap);
        await activateModules(adminClient, tenantId, modules, periodEnd);
        break;
      }

      case "invoice.payment_failed":
      case "invoice.payment_action_required": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        tenantId = subscription.metadata?.tenant_id ?? null;
        if (!tenantId) break;

        await adminClient.from("tenant_subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subscription.id);

        const modules = getModulesFromSubscription(subscription, priceModuleMap);
        await deactivateModules(adminClient, tenantId, modules);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`Error processing event ${event.type}:`, err);
    errorMessage = err.message;
  }

  // Registrar evento processado
  await adminClient.from("stripe_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    tenant_id: tenantId,
    status: errorMessage ? "failed" : "processed",
    error_message: errorMessage,
  });

  if (errorMessage) {
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
