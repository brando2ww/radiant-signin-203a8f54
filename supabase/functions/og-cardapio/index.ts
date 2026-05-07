import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug")?.trim().toLowerCase();
    const userIdParam = url.searchParams.get("userId")?.trim();

    let userId: string | null = null;
    let usedSlug: string | null = null;

    if (userIdParam && UUID_RE.test(userIdParam)) {
      userId = userIdParam;
    } else if (slug) {
      const { data } = await supabase
        .from("business_settings")
        .select("user_id, slug")
        .ilike("slug", slug)
        .maybeSingle();
      userId = data?.user_id ?? null;
      usedSlug = data?.slug ?? slug;
    }

    let businessName = "Cardápio Online";
    let description = "Faça seu pedido pelo nosso cardápio digital";
    let logoUrl =
      "https://storage.googleapis.com/gpt-engineer-file-uploads/xq3rsxM6G3Uju6VR6UIMsJ47WSN2/uploads/1760447776495-simbolo_velara_preto.png";

    if (userId) {
      const { data: bs } = await supabase
        .from("business_settings")
        .select("business_name, business_description, logo_url, cover_url, slug")
        .eq("user_id", userId)
        .maybeSingle();
      if (bs) {
        businessName = bs.business_name || businessName;
        description = bs.business_description || description;
        logoUrl = bs.cover_url || bs.logo_url || logoUrl;
        usedSlug = usedSlug ?? bs.slug ?? null;
      }
    }

    // Origin to redirect human visitors to. Prefer the request's referer
    // origin, otherwise fall back to the configured PUBLIC_APP_ORIGIN
    // or the user's custom domain.
    const appOrigin =
      Deno.env.get("PUBLIC_APP_ORIGIN") ?? "https://pdv.velaraia.app";
    const target = `${appOrigin}/cardapio/${usedSlug ?? userId ?? ""}`;

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(businessName)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(businessName)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(logoUrl)}" />
<meta property="og:url" content="${escapeHtml(target)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(businessName)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(logoUrl)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}" />
<link rel="canonical" href="${escapeHtml(target)}" />
<script>window.location.replace(${JSON.stringify(target)});</script>
</head>
<body>
<p>Abrindo cardápio… <a href="${escapeHtml(target)}">Clique aqui</a> se não for redirecionado.</p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
      status: 200,
    });
  } catch (err) {
    console.error("og-cardapio error", err);
    return new Response("error", {
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
      status: 500,
    });
  }
});
