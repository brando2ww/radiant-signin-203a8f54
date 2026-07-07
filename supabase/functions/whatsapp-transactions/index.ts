// whatsapp-transactions — recebe o webhook MESSAGES_UPSERT da Evolution API
// e registra as respostas dos fornecedores (cotação) em
// pdv_quotation_inbound_messages. Público (sem JWT), protegido por token na URL.
//
// Só grava mensagens que vêm de um número de FORNECEDOR conhecido (evita poluir
// com mensagens de clientes/grupos). A resposta é ligada, por heurística, à
// cotação ABERTA mais recente em que aquele fornecedor foi convidado.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Só os últimos dígitos importam (ignora DDI 55 e o 9 extra do celular)
function phoneSuffix(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  return d.slice(-8); // 8 dígitos finais bastam para casar com segurança
}

function extractText(msg: any): string {
  const m = msg?.message ?? {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.documentMessage?.caption ||
    ""
  );
}

// Idade da mensagem (ms). Usado para IGNORAR sincronização de histórico do
// Baileys, que reenvia conversas antigas como MESSAGES_UPSERT ao (re)conectar.
const FRESH_WINDOW_MS = 15 * 60 * 1000; // 15 min
function messageAgeMs(m: any): number | null {
  let ts: any = m?.messageTimestamp;
  if (ts && typeof ts === "object") ts = ts.low ?? ts.toNumber?.() ?? null;
  const n = Number(ts);
  if (!n || Number.isNaN(n)) return null;
  const ms = n > 1e12 ? n : n * 1000; // aceita segundos ou milissegundos
  return Date.now() - ms;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Proteção: token na query (?token=), comparado ao secret.
  const secret = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN");
  const url = new URL(req.url);
  if (!secret || url.searchParams.get("token") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return ok(); // nada a fazer, mas responde 200 pro Evolution não re-tentar
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const instance: string | undefined = payload?.instance;
    // data pode vir como objeto único ou array
    const msgs: any[] = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];
    if (!instance || msgs.length === 0) return ok();

    // instância -> tenant (dono)
    const { data: conn } = await service
      .from("whatsapp_connections")
      .select("user_id")
      .eq("instance_name", instance)
      .maybeSingle();
    const ownerId = conn?.user_id as string | undefined;
    if (!ownerId) return ok(); // instância não mapeada a nenhuma loja

    // fornecedores do tenant (para casar telefone)
    const { data: suppliers } = await service
      .from("pdv_suppliers")
      .select("id, phone, whatsapp")
      .eq("user_id", ownerId);
    const suppliersList = suppliers ?? [];

    let stored = 0;
    for (const m of msgs) {
      if (m?.key?.fromMe) continue; // ignora mensagens que a própria loja enviou
      const remoteJid: string = m?.key?.remoteJid || "";
      if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("broadcast")) continue; // grupos/status
      const body = extractText(m).trim();
      if (!body) continue;

      // Ignora histórico antigo (sync do Baileys ao reconectar): só mensagens recentes.
      const age = messageAgeMs(m);
      if (age !== null && age > FRESH_WINDOW_MS) continue;

      const fromPhone = remoteJid.split("@")[0];
      const suffix = phoneSuffix(fromPhone);
      if (!suffix) continue;

      // casa com fornecedor conhecido (phone ou whatsapp)
      const supplier = suppliersList.find((s: any) => {
        const a = phoneSuffix(s.phone || "");
        const b = phoneSuffix(s.whatsapp || "");
        return (a && a === suffix) || (b && b === suffix);
      });
      if (!supplier) continue; // não é fornecedor -> ignora (mantém a caixa limpa)

      // heurística: cotação ABERTA mais recente em que esse fornecedor foi convidado
      const { data: openReq } = await service
        .from("pdv_quotation_requests")
        .select("id, created_at, pdv_quotation_items!inner(pdv_quotation_item_suppliers!inner(supplier_id))")
        .eq("user_id", ownerId)
        .in("status", ["pending", "in_progress"])
        .eq("pdv_quotation_items.pdv_quotation_item_suppliers.supplier_id", supplier.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const quotationRequestId = (openReq && openReq[0]?.id) || null;

      // UMA linha pendente por fornecedor: se já existe, acumula o texto das
      // bolhas nela (não cria uma linha nova por mensagem). Assim a caixa de
      // entrada mostra apenas 1 resposta por fornecedor.
      const { data: existing } = await service
        .from("pdv_quotation_inbound_messages")
        .select("id, body, quotation_request_id")
        .eq("user_id", ownerId)
        .eq("supplier_id", supplier.id)
        .eq("status", "pending")
        .order("received_at", { ascending: false })
        .limit(1);
      const current = existing?.[0] as { id: string; body: string | null; quotation_request_id: string | null } | undefined;

      if (current) {
        // não repete a mesma bolha já contida no texto acumulado
        const already = (current.body || "").includes(body);
        const newBody = already ? (current.body || "") : `${current.body || ""}\n${body}`.trim();
        const { error: updErr } = await service
          .from("pdv_quotation_inbound_messages")
          .update({
            body: newBody,
            received_at: new Date().toISOString(),
            from_phone: fromPhone,
            instance_name: instance,
            quotation_request_id: current.quotation_request_id ?? quotationRequestId,
          })
          .eq("id", current.id);
        if (!updErr) stored++;
      } else {
        const { error: insErr } = await service.from("pdv_quotation_inbound_messages").insert({
          user_id: ownerId,
          instance_name: instance,
          from_phone: fromPhone,
          supplier_id: supplier.id,
          quotation_request_id: quotationRequestId,
          body,
          status: "pending",
        });
        if (!insErr) stored++;
      }
    }

    return ok({ ok: true, stored });
  } catch (e) {
    // nunca devolve erro pro webhook (evita re-tentativas em massa)
    console.error("whatsapp-transactions error:", (e as Error).message);
    return ok({ ok: false });
  }
});
