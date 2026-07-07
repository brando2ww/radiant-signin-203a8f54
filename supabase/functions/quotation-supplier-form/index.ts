// quotation-supplier-form — formulário público de orçamento do fornecedor.
// Rota pública /cotacao/:token no app chama esta função (sem login). O acesso é
// gateado pelo `token` do vínculo pdv_quotation_supplier_links; tudo é lido/gravado
// com service-role (sem RLS anônima). Duas ações: "load" e "submit".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const OPEN_STATUSES = ["pending", "in_progress"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const action: string = payload?.action;
  const token: string = payload?.token;
  if (!action || !token) return json({ error: "missing_params" }, 400);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Resolve o vínculo pelo token
    const { data: link } = await service
      .from("pdv_quotation_supplier_links")
      .select("id, user_id, quotation_request_id, supplier_id, status")
      .eq("token", token)
      .maybeSingle();

    if (!link) return json({ status: "invalid" }); // token inexistente

    // Cotação
    const { data: quotation } = await service
      .from("pdv_quotation_requests")
      .select("id, request_number, deadline, status")
      .eq("id", link.quotation_request_id)
      .maybeSingle();

    if (!quotation) return json({ status: "invalid" });

    const isOpen = OPEN_STATUSES.includes(quotation.status ?? "");

    // ---------- LOAD ----------
    if (action === "load") {
      const [{ data: supplier }, { data: settings }] = await Promise.all([
        service.from("pdv_suppliers").select("name").eq("id", link.supplier_id).maybeSingle(),
        service
          .from("business_settings")
          .select("business_name, logo_url, primary_color")
          .eq("user_id", link.user_id)
          .maybeSingle(),
      ]);

      // Itens dessa cotação que ESTE fornecedor foi convidado a cotar.
      const { data: itemLinks } = await service
        .from("pdv_quotation_item_suppliers")
        .select("quotation_item_id, pdv_quotation_items!inner(id, quantity_needed, unit, quotation_request_id, ingredient:pdv_ingredients(name))")
        .eq("supplier_id", link.supplier_id);

      const items = (itemLinks ?? [])
        .map((r: any) => r.pdv_quotation_items)
        .filter((it: any) => it && it.quotation_request_id === link.quotation_request_id);

      const itemIds = items.map((it: any) => it.id);

      // Respostas já enviadas por este fornecedor (para pré-preencher edição).
      let responsesByItem: Record<string, any> = {};
      if (itemIds.length > 0) {
        const { data: resps } = await service
          .from("pdv_quotation_responses")
          .select("quotation_item_id, unit_price, brand, delivery_days, minimum_order, payment_terms, expiration_date, notes")
          .eq("supplier_id", link.supplier_id)
          .in("quotation_item_id", itemIds);
        for (const r of resps ?? []) responsesByItem[r.quotation_item_id] = r;
      }

      return json({
        status: isOpen ? "open" : "closed",
        business: { name: settings?.business_name ?? null, logo_url: settings?.logo_url ?? null, color: settings?.primary_color ?? null },
        supplier: { name: supplier?.name ?? null },
        quotation: { request_number: quotation.request_number, deadline: quotation.deadline },
        alreadySubmitted: link.status === "submitted",
        items: items.map((it: any) => ({
          id: it.id,
          ingredient_name: it.ingredient?.name ?? "Item",
          quantity: it.quantity_needed,
          unit: it.unit,
          response: responsesByItem[it.id] ?? null,
        })),
      });
    }

    // ---------- SUBMIT ----------
    if (action === "submit") {
      if (!isOpen) return json({ status: "closed" });
      const responses: any[] = Array.isArray(payload?.responses) ? payload.responses : [];
      if (responses.length === 0) return json({ error: "no_responses" }, 400);

      // Conjunto de itens válidos (convidados) desse fornecedor nesta cotação.
      const { data: itemLinks } = await service
        .from("pdv_quotation_item_suppliers")
        .select("quotation_item_id, pdv_quotation_items!inner(id, quantity_needed, quotation_request_id)")
        .eq("supplier_id", link.supplier_id);
      const validItems = new Map<string, number>();
      for (const r of itemLinks ?? []) {
        const it: any = r.pdv_quotation_items;
        if (it && it.quotation_request_id === link.quotation_request_id) {
          validItems.set(it.id, Number(it.quantity_needed) || 0);
        }
      }

      let saved = 0;
      for (const resp of responses) {
        const itemId = resp?.quotation_item_id;
        if (!itemId || !validItems.has(itemId)) continue; // anti-adulteração
        const unitPrice = resp?.unit_price === "" || resp?.unit_price == null ? null : Number(resp.unit_price);
        if (unitPrice == null || Number.isNaN(unitPrice)) continue; // preço é obrigatório

        const qty = validItems.get(itemId) ?? 0;

        // Substitui a resposta anterior deste (item, fornecedor) — idempotente p/ edição.
        await service
          .from("pdv_quotation_responses")
          .delete()
          .eq("quotation_item_id", itemId)
          .eq("supplier_id", link.supplier_id);

        const { error: insErr } = await service.from("pdv_quotation_responses").insert({
          quotation_item_id: itemId,
          supplier_id: link.supplier_id,
          unit_price: unitPrice,
          total_price: unitPrice * qty,
          brand: resp?.brand || null,
          delivery_days: resp?.delivery_days ? parseInt(resp.delivery_days) : null,
          minimum_order: resp?.minimum_order ? Number(resp.minimum_order) : null,
          payment_terms: resp?.payment_terms || null,
          expiration_date: resp?.expiration_date || null,
          notes: resp?.notes || null,
          source: "link",
        });
        if (!insErr) saved++;
      }

      await service
        .from("pdv_quotation_supplier_links")
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", link.id);

      return json({ status: "ok", saved });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("quotation-supplier-form error:", (e as Error).message);
    return json({ error: "server_error" }, 500);
  }
});
