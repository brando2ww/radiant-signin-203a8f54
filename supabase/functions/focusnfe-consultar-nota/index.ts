// focusnfe-consultar-nota — polling de status
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  authedOwner,
  basicAuth,
  corsHeaders,
  focusBaseUrl,
  getServiceClient,
  getTenantToken,
  json,
  translateSefazError,
} from "../_shared/focusnfe-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await authedOwner(req);
    if (auth instanceof Response) return auth;
    const { ownerId } = auth;
    const { ref, tipo } = await req.json();
    if (!ref || !tipo) return json({ error: "ref e tipo são obrigatórios" }, 400);

    const tk = await getTenantToken(ownerId);
    if ("error" in tk) return json({ error: tk.error }, 400);
    const { token, ambiente } = tk;

    const resp = await fetch(`${focusBaseUrl(ambiente)}/v2/${tipo}/${ref}`, {
      headers: { Authorization: basicAuth(token) },
    });
    const data = await resp.json().catch(() => ({}));

    const status = data.status === "autorizado"
      ? "autorizada"
      : data.status === "cancelado"
      ? "cancelada"
      : data.status === "denegado"
      ? "denegada"
      : data.status === "processando_autorizacao"
      ? "processando"
      : "rejeitada";

    const service = getServiceClient();
    await service.from("notas_fiscais").update({
      status,
      numero: data.numero ? String(data.numero) : undefined,
      chave_acesso: data.chave_nfe,
      protocolo: data.protocolo,
      caminho_xml: data.caminho_xml_nota_fiscal
        ? `https://api.focusnfe.com.br${data.caminho_xml_nota_fiscal}`
        : undefined,
      caminho_danfe: data.caminho_danfe || data.caminho_danfce
        ? `https://api.focusnfe.com.br${data.caminho_danfe || data.caminho_danfce}`
        : undefined,
      mensagem_sefaz: translateSefazError(data.mensagem_sefaz),
      resposta_api: data,
    }).eq("user_id", ownerId).eq("referencia_focusnfe", ref);

    return json({ status, data });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
