// focusnfe-mde-sweep — varredura server-side (cron) que puxa NF-es recebidas (MDe)
// de TODOS os tenants com integração Focus ativa. Não exige usuário logado:
// protegida por header secret (MDE_SWEEP_SECRET) e roda com service role.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  basicAuth,
  corsHeaders,
  focusBaseUrl,
  getServiceClient,
  getTenantToken,
  json,
} from "../_shared/focusnfe-utils.ts";

// Consulta MDe para um único tenant (mesma lógica de focusnfe-mde-consultar).
async function consultMdeForTenant(service: any, ownerId: string) {
  const tokenResult = await getTenantToken(ownerId);
  if ("error" in tokenResult) return { skipped: true, reason: tokenResult.error };
  const { token, ambiente, config } = tokenResult;

  const cnpj = config?.cnpj as string | null;
  if (!cnpj) return { skipped: true, reason: "sem CNPJ" };

  const lastVersion = (config?.last_mde_version as string) || "0";
  const baseUrl = focusBaseUrl(ambiente);
  let versionAfter = lastVersion;
  let foundCount = 0;
  let newCount = 0;
  let errorMessage: string | null = null;

  try {
    const cnpjClean = cnpj.replace(/\D/g, "");
    // Limite: só considerar notas dos últimos 31 dias (no máximo 1 mês para trás).
    const cutoffMs = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // Pagina o NSU/versão até esgotar (SEFAZ distribui incremental, não por data).
    const MAX_PAGES = 20; // ~ até 20 lotes; evita loop/consumo indevido
    let version = lastVersion;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${baseUrl}/v2/nfes_recebidas?cnpj=${cnpjClean}&versao=${version}`;
      const focusRes = await fetch(url, { headers: { Authorization: basicAuth(token) } });
      if (!focusRes.ok) {
        const body = await focusRes.text();
        throw new Error(`Focus MDe retornou ${focusRes.status}: ${body}`);
      }
      const maxVer = focusRes.headers.get("X-Max-Version") || version;
      const notes: any[] = await focusRes.json();
      const batch = Array.isArray(notes) ? notes : [];
      if (batch.length === 0) { version = maxVer; break; }
      foundCount += batch.length;

      for (const note of batch) {
        const chave: string = note.chave_nfe || note.chave || "";
        if (!chave) continue;
        // Filtro de período: descarta notas mais antigas que 1 mês.
        const emissaoRaw: string = note.data_emissao || new Date().toISOString();
        const emissMs = Date.parse(emissaoRaw);
        if (!Number.isNaN(emissMs) && emissMs < cutoffMs) continue;

        const { data: existing, error: selErr } = await service
          .from("pdv_invoices")
          .select("id, source")
          .eq("user_id", ownerId)
          .eq("invoice_key", chave)
          .maybeSingle();
        if (selErr) continue;
        if (!existing) {
          const { error: insErr } = await service.from("pdv_invoices").insert({
            user_id: ownerId,
            invoice_key: chave,
            invoice_number: String(note.numero || ""),
            series: String(note.serie || "1"),
            emission_date: emissaoRaw,
            supplier_cnpj: (note.cnpj_emitente || "").replace(/\D/g, ""),
            supplier_name: note.nome_emitente || note.razao_social_emitente || "",
            total_products: Number(note.valor || 0),
            total_tax: 0,
            total_invoice: Number(note.valor || 0),
            operation_type: "entrada",
            invoice_type: "compra",
            status: "pending",
            source: "mde",
            mde_status: note.situacao_manifesto || "pendente",
            mde_raw_payload: note,
            mde_queried_at: new Date().toISOString(),
          });
          if (!insErr) newCount++;
        } else {
          await service
            .from("pdv_invoices")
            .update({
              mde_status: note.situacao_manifesto || "pendente",
              mde_raw_payload: note,
              mde_queried_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        }
      }

      if (maxVer === version) { break; } // não avançou → fim
      version = maxVer;
      await sleep(1200); // respeita rate limit do DF-e SEFAZ entre páginas
    }
    versionAfter = version;

    await service
      .from("tenant_fiscal_config")
      .update({ last_mde_version: versionAfter, last_mde_query_at: new Date().toISOString() })
      .eq("user_id", ownerId);
  } catch (err) {
    errorMessage = (err as Error).message;
  }

  await service.from("nfe_mde_query_logs").insert({
    user_id: ownerId,
    cnpj: cnpj.replace(/\D/g, ""),
    status: errorMessage ? "error" : "success",
    version_before: lastVersion,
    version_after: versionAfter,
    found_count: foundCount,
    new_count: newCount,
    error_message: errorMessage,
  });

  return { skipped: false, found: foundCount, new: newCount, error: errorMessage };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: header secret (chamado pelo pg_cron, sem usuário logado)
  const secret = Deno.env.get("MDE_SWEEP_SECRET");
  const provided = req.headers.get("x-sweep-secret");
  if (!secret || provided !== secret) return json({ error: "Unauthorized" }, 401);

  const service = getServiceClient();

  // Tenants com integração Focus ativa (tem token) + CNPJ.
  // MDe é sobre notas RECEBIDAS (compras); independe de o tenant emitir NF-e.
  const { data: tenants, error } = await service
    .from("tenant_fiscal_config")
    .select("user_id")
    .not("cnpj", "is", null)
    .or("focusnfe_token_producao_cifrado.not.is.null,focusnfe_token_homologacao_cifrado.not.is.null");
  if (error) return json({ error: error.message }, 500);

  const results: Record<string, unknown> = {};
  let totalNew = 0;
  for (const t of (tenants ?? [])) {
    const r = await consultMdeForTenant(service, t.user_id as string);
    results[t.user_id as string] = r;
    if (!r.skipped && !r.error) totalNew += (r.new as number) || 0;
  }

  return json({ tenants: (tenants ?? []).length, total_new: totalNew, results });
});
