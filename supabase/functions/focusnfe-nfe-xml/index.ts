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
  let cienciaErro = "";
  try {
    const m = await fetch(`${base}/v2/nfes_recebidas/${chave}/manifesto`, {
      method: "POST",
      headers: { Authorization: authz, "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "ciencia" }),
    });
    cienciaOk = m.ok;
    if (!m.ok) cienciaErro = (await m.text()).slice(0, 300);
  } catch (e) {
    cienciaErro = String(e);
  }

  // 3) A ciência sozinha não traz o documento: ele chega numa NOVA distribuição
  //    do SEFAZ. Sem forçar essa distribuição aqui, o operador ficava preso —
  //    clicava em "dar entrada", era mandado dar ciência, e voltava ao mesmo
  //    lugar na tentativa seguinte, indefinidamente.
  let xmlFinal = "";
  if (cienciaOk) {
    const cnpj = String(tk.config?.cnpj || "").replace(/\D/g, "");
    const versao = tk.config?.last_mde_version ?? 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let tentativa = 0; tentativa < 3 && !xmlFinal; tentativa++) {
      await sleep(1500);
      if (cnpj) {
        // Força a distribuição; o documento completo entra num NSU novo.
        try {
          await fetch(`${base}/v2/nfes_recebidas?cnpj=${cnpj}&versao=${versao}`, {
            headers: { Authorization: authz },
          });
        } catch { /* a tentativa seguinte cobre */ }
      }
      const r2 = await fetch(`${base}/v2/nfes_recebidas/${chave}.xml`, {
        headers: { Authorization: authz },
      });
      const x2 = await r2.text();
      if (r2.ok && /<nfeProc|<infNFe|<det\b/.test(x2)) xmlFinal = x2;
    }
  }

  await service
    .from("pdv_invoices")
    .update({
      // O status do manifesto é o que estamos mexendo aqui; a situação da nota
      // (autorizada/cancelada) vive em `status` e não pode ser sobrescrita.
      mde_status: cienciaOk ? "ciencia" : "pendente",
      mde_queried_at: new Date().toISOString(),
    })
    .eq("user_id", auth.ownerId)
    .eq("invoice_key", chave);

  if (xmlFinal) {
    return json({ complete: true, xml: xmlFinal, ciencia: true });
  }

  return json({
    complete: false,
    ciencia: cienciaOk,
    message: cienciaOk
      ? "Ciência da Operação enviada ao SEFAZ, mas o documento completo ainda não foi liberado. O SEFAZ costuma levar alguns minutos — clique em \"Consultar agora\" e tente de novo."
      : `Não foi possível emitir a Ciência da Operação${cienciaErro ? ` (${cienciaErro})` : ""}. Confira a habilitação DF-e da conta na Focus.`,
  });
});
