import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Verificar usuário autenticado
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verificar que este usuário ainda não tem tenant
    const { data: existingTenant } = await adminClient
      .from("tenants")
      .select("id, name")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (existingTenant) {
      // Já tem tenant — retornar o existente
      return new Response(JSON.stringify({ tenantId: existingTenant.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { name } = await req.json();
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "Nome do estabelecimento é obrigatório (mínimo 2 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar dados do perfil para preencher document
    const { data: profile } = await adminClient
      .from("profiles")
      .select("document, document_type")
      .eq("id", user.id)
      .maybeSingle();

    // Criar tenant
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .insert({
        name: name.trim(),
        document: profile?.document ?? null,
        owner_user_id: user.id,
        created_by: user.id,
      })
      .select()
      .single();

    if (tenantError) {
      console.error("Error creating tenant:", tenantError);
      return new Response(JSON.stringify({ error: tenantError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Criar vínculo establishment_users com role proprietario
    const { error: euError } = await adminClient
      .from("establishment_users")
      .insert({
        establishment_owner_id: user.id,
        user_id: user.id,
        display_name: user.user_metadata?.full_name ?? name.trim(),
        email: user.email ?? "",
        role: "proprietario",
        tenant_id: tenant.id,
      });

    if (euError) {
      console.error("Error creating establishment_user:", euError);
    }

    return new Response(JSON.stringify({ tenantId: tenant.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
