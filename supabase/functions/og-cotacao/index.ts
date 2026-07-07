// og-cotacao — preview rico (Open Graph/WhatsApp) do link de orçamento do fornecedor.
// Mesmo padrão do og-cardapio: se for robô (WhatsApp, Facebook, etc.) devolve HTML
// com as meta tags + logo do CLIENTE; se for pessoa, redireciona (302) para o app.
// Chamado via rewrite do Vercel: pdv.velaraia.app/l/cotacao/:token → esta função.
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
    // token pode vir por ?token= ou no fim do path (/og-cotacao/:token)
    const token =
      url.searchParams.get("token")?.trim() ||
      url.pathname.split("/").filter(Boolean).pop() ||
      "";
    const botRequest = isBot(req.headers.get("user-agent"));
    const target = `${APP_ORIGIN}/cotacao/${token}`;

    let businessName = "Solicitação de Orçamento";
    let requestNumber = "";
    let logoUrl = VELARA_LOGO;

    if (token) {
      const { data: link } = await supabase
        .from("pdv_quotation_supplier_links")
        .select("user_id, quotation_request_id")
        .eq("token", token)
        .maybeSingle();
      if (link) {
        const [{ data: settings }, { data: quotation }] = await Promise.all([
          supabase.from("business_settings").select("business_name, logo_url, cover_url").eq("user_id", link.user_id).maybeSingle(),
          supabase.from("pdv_quotation_requests").select("request_number").eq("id", link.quotation_request_id).maybeSingle(),
        ]);
        if (settings?.business_name) businessName = settings.business_name;
        logoUrl = settings?.logo_url || settings?.cover_url || VELARA_LOGO;
        requestNumber = quotation?.request_number || "";
      }
    }

    // Pessoas: redireciona direto para o formulário no app.
    if (!botRequest) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: target, "Cache-Control": "no-store" },
      });
    }

    const title = `Orçamento · ${businessName}`;
    const description = requestNumber
      ? `${businessName} solicitou seu orçamento (${requestNumber}). Toque para informar preços, prazo e pagamento.`
      : `${businessName} solicitou seu orçamento. Toque para informar preços, prazo e pagamento.`;

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
<p><a href="${escapeHtml(target)}">Preencher orçamento</a></p>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    console.error("og-cotacao error", err);
    return new Response("error", { status: 500, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
  }
});
