import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is a super admin
    const anonClient = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: caller },
      error: authError,
    } = await anonClient.auth.getUser(token);

    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if caller is super admin
    const { data: superAdmin } = await adminClient
      .from("super_admins")
      .select("id")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!superAdmin) {
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas super admins." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { name, document, modules, admin_email, admin_password, admin_name, admin_phone } =
      await req.json();

    if (!name || !admin_email || !admin_password || !admin_name) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: name, admin_email, admin_password, admin_name" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. Create auth user for the tenant owner
    const { data: authData, error: createUserError } =
      await adminClient.auth.admin.createUser({
        email: admin_email,
        password: admin_password,
        email_confirm: true,
        user_metadata: { full_name: admin_name },
      });

    if (createUserError) {
      const isDup =
        (createUserError as any).code === "email_exists" ||
        /already been registered|already registered|already exists/i.test(createUserError.message);
      const msg = isDup
        ? `O e-mail "${admin_email}" já está cadastrado. Use outro e-mail para o administrador deste tenant.`
        : createUserError.message;
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerUserId = authData.user.id;

    // 2. Create tenant
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .insert({
        name,
        document: document || null,
        owner_user_id: ownerUserId,
        created_by: caller.id,
      })
      .select()
      .single();

    if (tenantError) {
      await adminClient.auth.admin.deleteUser(ownerUserId);
      return new Response(JSON.stringify({ error: tenantError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Insert tenant modules
    if (modules && modules.length > 0) {
      const moduleRows = modules.map((m: string) => ({
        tenant_id: tenant.id,
        module: m,
        is_active: true,
      }));

      const { error: modulesError } = await adminClient
        .from("tenant_modules")
        .insert(moduleRows);

      if (modulesError) {
        console.error("Error inserting modules:", modulesError);
      }
    }

    // 4. Insert establishment_users with role proprietario
    const { error: euError } = await adminClient
      .from("establishment_users")
      .insert({
        establishment_owner_id: ownerUserId,
        user_id: ownerUserId,
        display_name: admin_name,
        email: admin_email,
        phone: admin_phone || null,
        role: "proprietario",
        tenant_id: tenant.id,
      });

    if (euError) {
      console.error("Error inserting establishment_user:", euError);
    }

    return new Response(JSON.stringify({ data: tenant }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
