// focusnfe-nfe-xml — baixa o XML completo de uma NF-e RECEBIDA (MDe) na Focus.
// Se a nota ainda é só resumo (nfe_completa=false), dispara a Ciência da Operação
// no SEFAZ (evento inócuo que libera o download); o XML completo chega na próxima
// distribuição (varredura horária). Autenticado (JWT do lojista).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  authedOwner, basicAuth, corsHeaders, focusBaseUrl, getServiceClient, getTenantToken, json,
} from "../_shared/focusnfe-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authedOwner(req);
  if (auth instanceof Response) return auth;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const chave: string = (body?.chave || "").replace(/\D/g, "");
  if (chave.length !== 44) return json({ error: "chave inválida" }, 400);

  const tk = await getTenantToken(auth.ownerId);
  if ("error" in tk) return json({ error: tk.error }, 400);
  const base = focusBaseUrl(tk.ambiente);
  const authz = basicAuth(tk.token);
  const service = getServiceClient();

  // 1) tenta baixar o XML
  const r = await fetch(`${base}/v2/nfes_recebidas/${chave}.xml`, { headers: { Authorization: authz } });
  const xml = await r.text();
  const isFull = r.ok && /<nfeProc|<infNFe|<det\b/.test(xml);

  if (isFull) {
    return json({ complete: true, xml });
  }

  // 2) resumo → dispara Ciência da Operação (libera o documento completo)
  let cienciaOk = false;
  try {
    const m = await fetch(`${base}/v2/nfes_recebidas/${chave}/manifesto`, {
      method: "POST",
      headers: { Authorization: authz, "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "ciencia" }),
    });
    cienciaOk = m.ok;
  } catch { /* ignora */ }

  await service
    .from("pdv_invoices")
    .update({ mde_status: "ciencia", mde_queried_at: new Date().toISOString() })
    .eq("user_id", auth.ownerId)
    .eq("invoice_key", chave);

  return json({
    complete: false,
    ciencia: cienciaOk,
    message: cienciaOk
      ? "Ciência da Operação enviada ao SEFAZ. Os produtos ficam disponíveis na próxima sincronização (até ~1h). Tente novamente depois."
      : "Ainda não foi possível liberar o documento completo. Tente novamente mais tarde.",
  });
});
