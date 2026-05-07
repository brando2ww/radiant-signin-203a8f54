import { createClient } from "npm:@supabase/supabase-js@2";

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

const APP_ORIGIN =
  Deno.env.get("PUBLIC_APP_ORIGIN") ?? "https://pdv.velaraia.app";

const VELARA_LOGO =
  "https://storage.googleapis.com/gpt-engineer-file-uploads/xq3rsxM6G3Uju6VR6UIMsJ47WSN2/uploads/1760447776495-simbolo_velara_preto.png";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BOT_RE =
  /(facebookexternalhit|facebookcatalog|whatsapp|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|skypeuripreview|pinterest|redditbot|embedly|quora|outbrain|vkshare|w3c_validator|googlebot|bingbot|applebot|yandex|duckduckbot|baiduspider|ia_archiver|bot|crawler|spider|preview)/i;

function isBot(ua: string | null): boolean {
  if (!ua) return false;
  return BOT_RE.test(ua);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slugParam = url.searchParams.get("slug")?.trim().toLowerCase() ?? null;
    const userIdParam = url.searchParams.get("userId")?.trim() ?? null;
    const ua = req.headers.get("user-agent");
    const botRequest = isBot(ua);

    let userId: string | null = null;
    let slug: string | null = null;
    let businessName = "Cardápio Online";
    let description = "Faça seu pedido pelo nosso cardápio digital";
    let logoUrl = VELARA_LOGO;

    if (slugParam) {
      const { data, error } = await supabase
        .from("business_settings")
        .select("user_id, slug, business_name, business_description, logo_url, cover_url")
        .ilike("slug", slugParam)
        .maybeSingle();
      if (error) console.error("og-cardapio query error:", error);
      if (data) {
        userId = data.user_id;
        slug = data.slug ?? slugParam;
        businessName = data.business_name || businessName;
        description = data.business_description || description;
        logoUrl = data.logo_url || data.cover_url || logoUrl;
      }
    } else if (userIdParam && UUID_RE.test(userIdParam)) {
      const { data } = await supabase
        .from("business_settings")
        .select("user_id, slug, business_name, business_description, logo_url, cover_url")
        .eq("user_id", userIdParam)
        .maybeSingle();
      userId = userIdParam;
      if (data) {
        slug = data.slug ?? null;
        businessName = data.business_name || businessName;
        description = data.business_description || description;
        logoUrl = data.logo_url || data.cover_url || logoUrl;
      }
    }

    const handle = slug ?? userId ?? "";
    const target = `${APP_ORIGIN}/cardapio/${handle}`;

    // Real users: redirect immediately so they never see this page.
    if (!botRequest) {
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          Location: target || APP_ORIGIN,
          "Cache-Control": "no-store",
        },
      });
    }

    // Bots/scrapers: serve OG tags only — NO redirect — so they read THIS page.
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(businessName)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${escapeHtml(businessName)}" />
<meta property="og:title" content="${escapeHtml(businessName)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(logoUrl)}" />
<meta property="og:image:secure_url" content="${escapeHtml(logoUrl)}" />
<meta property="og:image:width" content="400" />
<meta property="og:image:height" content="400" />
<meta property="og:url" content="${escapeHtml(target)}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${escapeHtml(businessName)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(logoUrl)}" />
<link rel="canonical" href="${escapeHtml(target)}" />
</head>
<body>
<h1>${escapeHtml(businessName)}</h1>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(target)}">Abrir cardápio</a></p>
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
