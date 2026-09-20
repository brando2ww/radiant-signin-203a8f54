// Envia o e-mail de recuperação de senha pelo SMTP do próprio Velara.
//
// Por que não usar `supabase.auth.resetPasswordForEmail` direto do navegador:
// o projeto não tem SMTP próprio configurado no Auth, então vale o servidor
// compartilhado do Supabase, limitado a 2 mensagens por hora no projeto
// INTEIRO. Aqui a gente gera o link com a API de administração e manda pelo
// mesmo SMTP que já envia o relatório de checklist.
//
// Responde 200 sempre, mesmo quando o e-mail não existe: quem pede a senha não
// pode descobrir quais e-mails estão cadastrados.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMail } from "../_shared/smtp-mailer.ts";
import { corpoDoEmailDeSenha } from "../_shared/password-reset-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Destinos aceitos para o link. Evita virar redirecionador aberto por e-mail. */
const ORIGENS_PERMITIDAS = [
  "https://pdv.velaraia.app",
  "http://localhost:8080",
];
const CAMINHO_PADRAO = "/redefinir-senha";
const LIMITE_POR_HORA = 3;

function destinoSeguro(bruto: unknown, origemDoPedido: string | null): string {
  const candidatos = [typeof bruto === "string" ? bruto : "", origemDoPedido || ""];
  for (const c of candidatos) {
    if (!c) continue;
    try {
      const u = new URL(c);
      if (ORIGENS_PERMITIDAS.includes(u.origin)) {
        return `${u.origin}${u.pathname && u.pathname !== "/" ? u.pathname : CAMINHO_PADRAO}`;
      }
    } catch { /* ignora valor inválido */ }
  }
  return `${ORIGENS_PERMITIDAS[0]}${CAMINHO_PADRAO}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ok = () =>
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) return ok();

    const destino = destinoSeguro(body?.redirectTo, req.headers.get("origin"));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Freio: 3 pedidos por hora para o mesmo e-mail. Silencioso de propósito.
    const umaHoraAtras = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await supabase
      .from("password_reset_requests")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("requested_at", umaHoraAtras);
    if ((count ?? 0) >= LIMITE_POR_HORA) return ok();

    const { data: pedido } = await supabase
      .from("password_reset_requests")
      .insert({ email })
      .select("id")
      .maybeSingle();

    const registra = async (enviado: boolean, erro?: string) => {
      if (!pedido?.id) return;
      await supabase
        .from("password_reset_requests")
        .update({ sent: enviado, error_message: erro ? String(erro).slice(0, 500) : null })
        .eq("id", pedido.id);
    };

    const { data: link, error: erroLink } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: destino },
    });

    // E-mail não cadastrado cai aqui. Segue respondendo 200.
    if (erroLink || !link?.properties?.action_link) {
      await registra(false, erroLink?.message ?? "link não gerado");
      return ok();
    }

    const nome =
      (link.user?.user_metadata?.full_name as string | undefined) ??
      (link.user?.user_metadata?.name as string | undefined) ??
      null;

    try {
      await sendMail({
        to: email,
        subject: "Redefinir sua senha",
        html: corpoDoEmailDeSenha(link.properties.action_link, nome),
      });
      await registra(true);
    } catch (erroSmtp) {
      console.error("Falha ao enviar recuperação:", erroSmtp);
      await registra(false, erroSmtp instanceof Error ? erroSmtp.message : String(erroSmtp));
    }

    return ok();
  } catch (err) {
    console.error("send-password-reset:", err);
    return ok();
  }
});
