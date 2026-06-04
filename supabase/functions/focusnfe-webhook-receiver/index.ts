// focusnfe-webhook-receiver — público (JWT off), valida header de autorização
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getServiceClient, json, translateSefazError } from "../_shared/focusnfe-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("FOCUSNFE_WEBHOOK_SECRET");
  const provided = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!secret || !provided || provided !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    // FocusNFE envia: { ref, status, cnpj, ... } — formato pode variar por evento
    const ref = body.ref || body.referencia;
    if (!ref) return json({ ok: true });

    const status = body.status === "autorizado"
      ? "autorizada"
      : body.status === "cancelado"
      ? "cancelada"
      : body.status === "denegado"
      ? "denegada"
      : body.status === "processando_autorizacao"
      ? "processando"
      : body.status === "erro_autorizacao"
      ? "rejeitada"
      : null;

    if (!status) return json({ ok: true });

    const service = getServiceClient();
    await service.from("notas_fiscais").update({
      status,
      numero: body.numero ? String(body.numero) : undefined,
      chave_acesso: body.chave_nfe || body.chave_acesso || undefined,
      protocolo: body.protocolo || undefined,
      caminho_xml: body.caminho_xml_nota_fiscal
        ? `https://api.focusnfe.com.br${body.caminho_xml_nota_fiscal}`
        : undefined,
      caminho_danfe: body.caminho_danfe || body.caminho_danfce
        ? `https://api.focusnfe.com.br${body.caminho_danfe || body.caminho_danfce}`
        : undefined,
      mensagem_sefaz: translateSefazError(body.mensagem_sefaz),
      resposta_api: body,
    }).eq("referencia_focusnfe", ref);

    return json({ ok: true });
  } catch (e) {
    console.error("webhook error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
