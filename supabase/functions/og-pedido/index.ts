// og-pedido — preview rico (Open Graph/WhatsApp) do link do PEDIDO ao fornecedor.
// Gêmeo do og-cotacao: robô recebe as meta tags com a marca do cliente, pessoa é
// redirecionada (302) para /pedido/:token no app.
// Chamado via rewrite do Vercel: pdv.velaraia.app/l/pedido/:token → esta função.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const APP_ORIGIN = Deno.env.get("PUBLIC_APP_ORIGIN") ?? "https://pdv.velaraia.app";
const VELARA_LOGO = `${APP_ORIGIN}/velara-symbol.png`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const BOT_RE =
  /(facebookexternalhit|facebookcatalog|whatsapp|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|skypeuripreview|pinterest|redditbot|embedly|quora|outbrain|vkshare|w3c_validator|googlebot|bingbot|applebot|yandex|duckduckbot|baiduspider|ia_archiver|bot|crawler|spider|preview)/i;
const isBot = (ua: string | null) => (ua ? BOT_RE.test(ua) : false);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const bruto =
      url.searchParams.get("token")?.trim() ||
      url.pathname.split("/").filter(Boolean).pop() ||
      "";

    // Mesma defesa do og-cotacao: a Meta pode colar o token depois de lixo
    // URL-encoded ("%7B%7B1%7D%7D<uuid>"). Quem se adapta é a rota.
    const token =
      (decodeURIComponent(bruto).match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      )?.[0] ?? bruto);
    const botRequest = isBot(req.headers.get("user-agent"));
    const target = `${APP_ORIGIN}/pedido/${token}`;

    let businessName = "Pedido de compra";
    let orderNumber = "";
    let logoUrl = VELARA_LOGO;

    if (token) {
      const { data: order } = await supabase
        .from("pdv_purchase_orders")
        .select("user_id, order_number")
        .eq("public_token", token)
        .maybeSingle();
      if (order) {
        const { data: settings } = await supabase
          .from("business_settings")
          .select("business_name, logo_url, cover_url")
          .eq("user_id", order.user_id)
          .maybeSingle();
        if (settings?.business_name) businessName = settings.business_name;
        logoUrl = settings?.logo_url || settings?.cover_url || VELARA_LOGO;
        orderNumber = order.order_number || "";
      }
    }

    if (!botRequest) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: target, "Cache-Control": "no-store" },
      });
    }

    const title = `Pedido de compra · ${businessName}`;
    const description = orderNumber
      ? `${businessName} fechou o pedido ${orderNumber} com você. Toque para ver a relação de itens e confirmar.`
      : `${businessName} fechou um pedido com você. Toque para ver a relação de itens e confirmar.`;

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex, nofollow" />
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${escapeHtml(businessName)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(logoUrl)}" />
<meta property="og:image:secure_url" content="${escapeHtml(logoUrl)}" />
<meta property="og:image:width" content="400" />
<meta property="og:image:height" content="400" />
<meta property="og:url" content="${escapeHtml(target)}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(logoUrl)}" />
<link rel="canonical" href="${escapeHtml(target)}" />
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(target)}">Ver pedido</a></p>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    console.error("og-pedido error", err);
    return new Response("error", { status: 500, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
  }
});
