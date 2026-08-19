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
    // Consulta Focus NFe MDe — paginação incremental por versão (NSU).
    // Puxa todo o histórico disponível no SEFAZ, mas só grava notas dos
    // últimos 31 dias (no máximo 1 mês para trás).
    const cnpjClean = cnpj.replace(/\D/g, "");
    const cutoffMs = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const MAX_PAGES = 20;
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

        // Campos vêm do resumo MDe do Focus (documento_emitente/valor_total);
        // numero e serie são extraídos da chave (não vêm no resumo).
        const digits = chave.replace(/\D/g, "");
        const numeroFromChave = digits.length === 44 ? String(parseInt(digits.slice(25, 34), 10)) : "";
        const serieFromChave = digits.length === 44 ? String(parseInt(digits.slice(22, 25), 10)) : "";
        const cnpjEmit = String(note.documento_emitente || note.cnpj_emitente || "").replace(/\D/g, "");
        const valorTotal = Number(note.valor_total ?? note.valor ?? 0);
        const nomeEmit = note.nome_emitente || note.razao_social_emitente || "";
        // `situacao` é o estado da NOTA (autorizada, cancelada) e não do
        // manifesto. Usá-lo como fallback gravava "autorizada" em mde_status,
        // o que quebrava os filtros da tela e escondia quais notas ainda
        // precisavam de ciência.
        const situacaoMde = note.situacao_manifesto || "pendente";

        // Deduplicar por chave de acesso
        const { error: upsertError, data: existing } = await service
          .from("pdv_invoices")
          .select("id, source")
          .eq("user_id", ownerId)
          .eq("invoice_key", chave)
          .maybeSingle();
        if (upsertError) continue;

        if (!existing) {
          const { error: insertError } = await service.from("pdv_invoices").insert({
            user_id: ownerId,
            invoice_key: chave,
            invoice_number: String(note.numero || numeroFromChave || ""),
            series: String(note.serie || serieFromChave || "1"),
            emission_date: emissaoRaw,
            supplier_cnpj: cnpjEmit,
            supplier_name: nomeEmit,
            total_products: valorTotal,
            total_tax: 0,
            total_invoice: valorTotal,
            operation_type: "entrada",
            invoice_type: "compra",
            status: "pending",
            source: "mde",
            mde_status: situacaoMde,
            mde_raw_payload: note,
            mde_queried_at: new Date().toISOString(),
          });
          if (!insertError) newCount++;
        } else {
          await service
            .from("pdv_invoices")
            .update({
              invoice_number: String(note.numero || numeroFromChave || ""),
              series: String(note.serie || serieFromChave || "1"),
              emission_date: emissaoRaw,
              supplier_cnpj: cnpjEmit,
              supplier_name: nomeEmit,
              total_products: valorTotal,
              total_invoice: valorTotal,
              mde_status: situacaoMde,
              mde_raw_payload: note,
              mde_queried_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        }
      }

      if (maxVer === version) { break; }
      version = maxVer;
      await sleep(1200);
    }
    versionAfter = version;

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
