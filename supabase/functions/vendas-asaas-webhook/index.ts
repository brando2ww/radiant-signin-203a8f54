// vendas-asaas-webhook · avisos de pagamento do Asaas de cada estabelecimento (Força de vendas).
//
// Pública (o Asaas não manda login). A trava é dupla e as duas metades têm de bater:
//   · `?token=` na URL, que é o vendas_asaas.webhook_token do estabelecimento (é por ele que se acha o dono);
//   · o header `asaas-access-token`, que o Asaas manda com o authToken cadastrado junto (o mesmo token).
// Sem as duas, 401 e nada é lido.
//
// O pagamento é casado com a conta a receber pelo asaas_payment_id (ou, se faltar, pelo externalReference = id da
// conta), sempre dentro do estabelecimento dono do token. A regra do que muda é a mesma da sincronização manual
// (mapearPagamento em _shared/asaas.ts). Evento repetido não grava nada de novo; a comissão nasce sozinha no banco
// quando a conta vira paga (gatilho vendas_comissao).
//
// Resposta: 200 sempre que o aviso foi entendido (inclusive quando não é de nenhuma conta nossa, para o Asaas não
// insistir); 500 só quando o banco falhou, para o Asaas tentar de novo.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hojeSP, mapearPagamento, type PagamentoAsaas, type TxAsaas } from "../_shared/asaas.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CAMPOS_TX =
  "id, status, amount, transaction_type, asaas_payment_id, asaas_status, charge_url, bank_slip_url, pix_payload, " +
  "net_amount, fee_amount, gross_amount";

/** Comparação em tempo constante (não vaza, pelo tempo de resposta, quantos caracteres do token acertaram). */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = new URL(req.url).searchParams.get("token") ?? "";
  const cabecalho = req.headers.get("asaas-access-token") ?? "";
  if (token.length < 32 || !iguais(token, cabecalho)) return json({ error: "unauthorized" }, 401);

  const service: any = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: conta, error: erroConta } = await service
    .from("vendas_asaas")
    .select("user_id")
    .eq("webhook_token", token)
    .maybeSingle();
  if (erroConta) {
    console.error("[vendas-asaas-webhook] conta:", erroConta.message);
    return json({ error: "temporary_failure" }, 500);
  }
  if (!conta) return json({ error: "unauthorized" }, 401);
  const owner = conta.user_id as string;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const evento = String(body?.event ?? "");
  const p = body?.payment as PagamentoAsaas | undefined;
  if (!evento.startsWith("PAYMENT_") || !p || typeof p.id !== "string" || !p.id) {
    return json({ ok: true, ignored: "evento sem cobrança" });
  }

  try {
    let { data: tx } = await service
      .from("pdv_financial_transactions")
      .select(CAMPOS_TX)
      .eq("user_id", owner)
      .eq("asaas_payment_id", p.id)
      .maybeSingle();

    // Cobrança que não chegou a ser gravada (ou de uma cobrança anterior da mesma conta): o externalReference é o id
    // da conta a receber.
    if (!tx && typeof p.externalReference === "string" && UUID.test(p.externalReference)) {
      const r = await service
        .from("pdv_financial_transactions")
        .select(CAMPOS_TX)
        .eq("user_id", owner)
        .eq("id", p.externalReference)
        .eq("transaction_type", "receivable")
        .maybeSingle();
      tx = r.data;
    }
    if (!tx) return json({ ok: true, ignored: "cobrança fora do Velara" });

    const patch = mapearPagamento(tx as TxAsaas, p, evento, hojeSP());
    const campos = Object.keys(patch);
    if (campos.length > 0) {
      const { error } = await service
        .from("pdv_financial_transactions")
        .update(patch)
        .eq("id", tx.id)
        .eq("user_id", owner);
      if (error) throw error;
    }
    console.log(`[vendas-asaas-webhook] ${evento} ${p.id} → ${campos.length ? campos.join(",") : "sem mudança"}`);
    return json({ ok: true, changed: campos });
  } catch (e) {
    console.error("[vendas-asaas-webhook]", evento, p.id, String((e as any)?.message ?? e));
    return json({ error: "temporary_failure" }, 500);
  }
});
