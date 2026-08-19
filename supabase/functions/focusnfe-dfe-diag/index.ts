// focusnfe-dfe-diag — diagnostica (e opcionalmente corrige) a habilitação DF-e
// da empresa na Focus.
//
// Existe porque a importação de NF-e travava num laço: dar entrada mandava
// emitir ciência, a ciência não liberava o XML, e não havia como ver de fora se
// o problema era o SEFAZ demorando ou a conta sem habilitação para notas
// recebidas. Esta função pergunta isso direto à Focus.
//
// Sem usuário logado (mesmo padrão da varredura): protegida por header secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  basicAuth, corsHeaders, focusBaseUrl, getServiceClient, getTenantToken, json,
} from "../_shared/focusnfe-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("FISCAL_DIAG_SECRET");
  if (!secret || req.headers.get("x-diag-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* corpo opcional */ }
  const habilitar = body?.enable === true;
  // Chave opcional: testa o download do XML de uma nota específica, que é o
  // que de fato trava a entrada de compra.
  const chaveTeste: string = String(body?.chave || "").replace(/\D/g, "");

  const service = getServiceClient();
  const { data: tenants } = await service
    .from("tenant_fiscal_config")
    .select("user_id, cnpj, focusnfe_ambiente, focusnfe_empresa_id, last_mde_version")
    .not("cnpj", "is", null);

  const resultado: any[] = [];

  for (const t of tenants ?? []) {
    const linha: any = {
      user_id: t.user_id,
      cnpj: t.cnpj,
      ambiente: t.focusnfe_ambiente,
      empresa_id: t.focusnfe_empresa_id,
    };

    const tk = await getTenantToken(t.user_id);
    if ("error" in tk) {
      linha.erro = tk.error;
      resultado.push(linha);
      continue;
    }

    const authz = basicAuth(tk.token);
    // O cadastro de empresa vive sempre em produção na Focus, mesmo quando a
    // emissão está em homologação.
    const baseEmpresa = focusBaseUrl("producao");
    const baseUso = focusBaseUrl(tk.ambiente);

    // 1) Como a Focus enxerga a empresa hoje
    if (t.focusnfe_empresa_id) {
      const r = await fetch(`${baseEmpresa}/v2/empresas/${t.focusnfe_empresa_id}`, {
        headers: { Authorization: authz },
      });
      const txt = await r.text();
      linha.empresa_status = r.status;
      try {
        const e = JSON.parse(txt);
        linha.habilitacoes = {
          manifestacao: e.habilita_manifestacao,
          nfe: e.habilita_nfe,
          nfce: e.habilita_nfce,
          nfse: e.habilita_nfse,
        };
        linha.empresa_nome = e.nome_fantasia || e.nome;
      } catch {
        linha.empresa_resposta = txt.slice(0, 300);
      }
    }

    // 2) Ligar a manifestação, se pedido e se estiver desligada
    if (habilitar && t.focusnfe_empresa_id && linha.habilitacoes?.manifestacao !== true) {
      const r = await fetch(`${baseEmpresa}/v2/empresas/${t.focusnfe_empresa_id}`, {
        method: "PUT",
        headers: { Authorization: authz, "Content-Type": "application/json" },
        body: JSON.stringify({ habilita_manifestacao: true }),
      });
      linha.habilitar_status = r.status;
      linha.habilitar_resposta = (await r.text()).slice(0, 300);
    }

    // 3) O erro real da consulta de notas recebidas
    const cnpj = String(t.cnpj).replace(/\D/g, "");
    const versao = t.last_mde_version ?? 0;
    const r2 = await fetch(`${baseUso}/v2/nfes_recebidas?cnpj=${cnpj}&versao=${versao}`, {
      headers: { Authorization: authz },
    });
    linha.recebidas_status = r2.status;
    linha.recebidas_resposta = (await r2.text()).slice(0, 400);

    // 4) O XML de uma nota concreta: é aqui que a entrada de compra para.
    // Sem chave informada, pega a mais recente do próprio tenant.
    let chaveAlvo = chaveTeste;
    if (chaveAlvo.length !== 44) {
      const { data: recente } = await service
        .from("pdv_invoices")
        .select("invoice_key, supplier_name, invoice_number")
        .eq("user_id", t.user_id)
        .eq("source", "mde")
        .order("emission_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recente?.invoice_key) {
        chaveAlvo = String(recente.invoice_key).replace(/\D/g, "");
        linha.nota_testada = `${recente.invoice_number} · ${recente.supplier_name}`;
      }
    }

    if (chaveAlvo.length === 44) {
      const rx = await fetch(`${baseUso}/v2/nfes_recebidas/${chaveAlvo}.xml`, {
        headers: { Authorization: authz },
      });
      const xt = await rx.text();
      linha.xml_status = rx.status;
      linha.xml_completo = rx.ok && /<nfeProc|<infNFe|<det\b/.test(xt);
      linha.xml_tamanho = xt.length;
      linha.xml_amostra = xt.slice(0, 300);

      // Situação do manifesto desta nota, direto da Focus
      const rm = await fetch(`${baseUso}/v2/nfes_recebidas/${chaveAlvo}`, {
        headers: { Authorization: authz },
      });
      linha.nota_status = rm.status;
      linha.nota_resposta = (await rm.text()).slice(0, 1200);
    }

    resultado.push(linha);
  }

  return json({ tenants: resultado });
});
