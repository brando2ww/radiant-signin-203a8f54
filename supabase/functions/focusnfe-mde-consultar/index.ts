// focusnfe-mde-consultar — consulta NF-es recebidas via MDe (Manifestação do Destinatário)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  authedOwner,
  basicAuth,
  corsHeaders,
  focusBaseUrl,
  getServiceClient,
  getTenantToken,
  json,
} from "../_shared/focusnfe-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authedOwner(req);
  if (auth instanceof Response) return auth;
  const { ownerId } = auth;

  const service = getServiceClient();

  // Buscar configuração fiscal do tenant (CNPJ + versão MDe + ambiente + token)
  const tokenResult = await getTenantToken(ownerId);
  if ("error" in tokenResult) return json({ error: tokenResult.error }, 400);
  const { token, ambiente, config } = tokenResult;

  const cnpj = config?.cnpj as string | null;
  if (!cnpj) return json({ error: "CNPJ não configurado na configuração fiscal." }, 400);

  const lastVersion = (config?.last_mde_version as string) || "0";
  const baseUrl = focusBaseUrl(ambiente);

  let versionAfter = lastVersion;
  let foundCount = 0;
  let newCount = 0;
  let errorMessage: string | null = null;

  try {
    // Consultar Focus NFe MDe — paginação incremental por versão
    const cnpjClean = cnpj.replace(/\D/g, "");
    const url = `${baseUrl}/v2/nfes_recebidas?cnpj=${cnpjClean}&versao=${lastVersion}`;

    const focusRes = await fetch(url, {
      headers: { Authorization: basicAuth(token) },
    });

    if (!focusRes.ok) {
      const body = await focusRes.text();
      throw new Error(`Focus MDe retornou ${focusRes.status}: ${body}`);
    }

    const newVersion = focusRes.headers.get("X-Max-Version") || lastVersion;
    versionAfter = newVersion;

    const notes: any[] = await focusRes.json();
    foundCount = Array.isArray(notes) ? notes.length : 0;

    if (foundCount > 0) {
      for (const note of notes) {
        const chave: string = note.chave_nfe || note.chave || "";
        if (!chave) continue;

        // Deduplicar por chave de acesso — upsert ignora se já existir
        const { error: upsertError, data: existing } = await service
          .from("pdv_invoices")
          .select("id, source")
          .eq("user_id", ownerId)
          .eq("invoice_key", chave)
          .maybeSingle();

        if (upsertError) continue;

        const emissaoRaw: string = note.data_emissao || new Date().toISOString();

        if (!existing) {
          // Nova nota — inserir
          const { error: insertError } = await service.from("pdv_invoices").insert({
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

          if (!insertError) newCount++;
        } else {
          // Nota existente — atualizar apenas mde_status e payload se mudou
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
    }

    // Atualizar versão MDe e timestamp de última consulta
    await service
      .from("tenant_fiscal_config")
      .update({
        last_mde_version: versionAfter,
        last_mde_query_at: new Date().toISOString(),
      })
      .eq("user_id", ownerId);

  } catch (err: unknown) {
    errorMessage = (err as Error).message;
  }

  // Registrar log da consulta
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

  if (errorMessage) return json({ error: errorMessage }, 502);

  return json({ found: foundCount, new: newCount, version: versionAfter });
});
