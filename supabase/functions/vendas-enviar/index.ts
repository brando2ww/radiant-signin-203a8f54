// vendas-enviar · manda a proposta ou a cobrança ao cliente pelo WhatsApp ou e-mail da loja (Força de vendas).
//
// Autenticada. Corpo { kind: "proposta" | "cobranca", id, channel: "whatsapp" | "email", dry_run? }.
//   · proposta: o gestor (dono, gerente, financeiro) ou o representante da proposta. Leva o nome da loja, o número, o
//     total e o link público /proposta/<token>. Proposta em rascunho passa a "enviada" (o link público só abre
//     proposta enviada) e sent_at é preenchido na primeira vez.
//   · cobranca: só o gestor. Leva valor, vencimento e o link de pagamento do Asaas (e o PIX copia e cola, se houver).
//
// WhatsApp: _shared/whatsapp (o número da própria loja, se conectado por QR; senão o número oficial da Velara).
// ATENÇÃO: pelo número oficial vai texto livre, que a Meta só entrega a quem falou com a Velara nas últimas 24h;
// fora disso o erro volta com a explicação. E-mail: _shared/smtp-mailer.
//
// `dry_run: true` confere tudo (permissão, cadastro, destino) e devolve a mensagem montada SEM enviar e sem gravar.
//
// Respostas: 401 sem login; o resto é 200 com { ok, message?, error? }. Em falha, `message` repete o `error` (a tela
// mostra qualquer um dos dois).
import { createClient } from "npm:@supabase/supabase-js@2";
import { isChannelError, resolveTenantChannel, sendText } from "../_shared/whatsapp/index.ts";
import { sendMail } from "../_shared/smtp-mailer.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const falha = (error: string, extra: Record<string, unknown> = {}) => json({ ok: false, error, message: error, ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_ORIGIN = (Deno.env.get("PUBLIC_APP_ORIGIN") || "https://pdv.velaraia.app").replace(/\/+$/, "");

// ── Formatação ─────────────────────────────────────────────────────────────

const reais = (v: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0).replace(/ /g, " ");

/** No e-mail o "R$" não pode quebrar a linha longe do número. */
const reaisHtml = (v: unknown) => esc(reais(v)).replace("R$ ", () => "R$&nbsp;");

const dataBR = (d: unknown): string => {
  const m = String(d ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

const dataSP = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const corValida = (c: unknown) => (/^#[0-9a-f]{6}$/i.test(String(c ?? "")) ? String(c) : "#1f2937");
const urlValida = (u: unknown) => (/^https:\/\/\S+$/i.test(String(u ?? "")) ? String(u) : null);
const emailValido = (e: unknown) => {
  const s = String(e ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
};

/** Como chamar o cliente na saudação: o contato, se houver; senão o nome fantasia ou o nome. */
const saudacao = (c: any) => String(c?.contact_name || c?.trade_name || c?.name || "").trim();

interface Marca {
  nome: string;
  cor: string;
  logo: string | null;
}

/** E-mail simples, com a marca da loja, que funciona nos clientes de e-mail comuns (tabela + estilo inline). */
function emailHtml(marca: Marca, titulo: string, paragrafos: string[], botao: { texto: string; url: string } | null, rodape: string[]) {
  const logo = marca.logo
    ? `<img src="${esc(marca.logo)}" alt="${esc(marca.nome)}" style="max-height:56px;max-width:200px;display:block;margin:0 auto 12px" />`
    : "";
  const corpo = paragrafos.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${p}</p>`).join("");
  const cta = botao
    ? `<p style="margin:22px 0;text-align:center"><a href="${esc(botao.url)}" style="background:${marca.cor};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block">${esc(botao.texto)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;color:#6b7280;word-break:break-all">Se o botão não abrir, copie o endereço: ${esc(botao.url)}</p>`
    : "";
  const fim = rodape.map((r) => `<p style="margin:0 0 4px;font-size:13px;color:#6b7280">${r}</p>`).join("");
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="border-top:4px solid ${marca.cor};padding:24px 24px 8px;text-align:center">${logo}<div style="font-size:18px;font-weight:700;color:#111827">${esc(marca.nome)}</div></td></tr>
<tr><td style="padding:16px 24px 8px"><h1 style="margin:0 0 16px;font-size:20px;color:#111827">${esc(titulo)}</h1>${corpo}${cta}</td></tr>
<tr><td style="padding:8px 24px 24px;border-top:1px solid #e5e7eb">${fim}</td></tr>
</table></td></tr></table></body></html>`;
}

// ── Função ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) return json({ ok: false, error: "Não autorizado." }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ ok: false, error: "Sua sessão expirou. Entre de novo para continuar." }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return falha("Pedido inválido.");
  }
  const kind = String(body?.kind ?? "");
  const id = String(body?.id ?? "");
  const channel = String(body?.channel ?? "");
  const dryRun = body?.dry_run === true;
  if (kind !== "proposta" && kind !== "cobranca") return falha("Tipo de envio inválido.");
  if (!UUID.test(id)) return falha(kind === "proposta" ? "Proposta inválida." : "Conta a receber inválida.");
  if (channel !== "whatsapp" && channel !== "email") return falha("Escolha WhatsApp ou e-mail.");

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: ownerData } = await service.rpc("pdv_resolve_owner", { _user_id: user.id });
    const owner = (ownerData as string) || user.id;
    const { data: gestor } = await userClient.rpc("vendas_gestor", { _owner: owner });

    const [{ data: bs }, { data: ps }] = await Promise.all([
      service.from("business_settings").select("business_name, logo_url, primary_color").eq("user_id", owner).maybeSingle(),
      service.from("pdv_settings").select("business_name").eq("user_id", owner).maybeSingle(),
    ]);
    const marca: Marca = {
      nome: String(bs?.business_name || ps?.business_name || "").trim() || "A loja",
      cor: corValida(bs?.primary_color),
      logo: urlValida(bs?.logo_url),
    };

    const montado =
      kind === "proposta"
        ? await montarProposta(service, userClient, owner, gestor === true, id, channel, marca)
        : await montarCobranca(service, owner, gestor === true, id, channel, marca);
    if ("erro" in montado) return falha(montado.erro, montado.code ? { code: montado.code } : {});

    const preview = {
      kind,
      channel,
      to: montado.destino,
      ...(channel === "email" ? { subject: montado.assunto, html: montado.html } : {}),
      text: montado.texto,
    };
    if (dryRun) return json({ ok: true, dry_run: true, message: montado.texto, preview });

    if (channel === "whatsapp") {
      const canal = await resolveTenantChannel(service, user.id);
      if (isChannelError(canal)) return falha(canal.error.errorMessage ?? "WhatsApp indisponível.");
      const r = await sendText(service, canal, montado.destino, montado.texto, {
        purpose: kind === "proposta" ? "proposal" : "charge",
        entityType: kind === "proposta" ? "vendas_proposta" : "pdv_financial_transaction",
        entityId: id,
      });
      if (!r.ok) return falha(r.errorMessage || "O WhatsApp não aceitou a mensagem.", { code: r.errorCode });
    } else {
      try {
        await sendMail({ to: montado.destino, subject: montado.assunto, html: montado.html });
      } catch (e) {
        console.error("[vendas-enviar] e-mail:", String(e));
        return falha("Não foi possível enviar o e-mail agora. Tente de novo em instantes.");
      }
    }

    if (montado.depois) await montado.depois();
    const onde = channel === "whatsapp" ? "WhatsApp" : "e-mail";
    return json({
      ok: true,
      message: `${kind === "proposta" ? "Proposta enviada" : "Cobrança enviada"} por ${onde} para ${montado.destino}.`,
    });
  } catch (e) {
    console.error("[vendas-enviar]", kind, String((e as any)?.message ?? e));
    return json({ ok: false, error: "Erro interno ao enviar. Tente de novo.", message: "Erro interno ao enviar. Tente de novo." }, 500);
  }
});

type Montado =
  | { erro: string; code?: string }
  | { destino: string; texto: string; assunto: string; html: string; depois?: () => Promise<void> };

function destinoDoCliente(c: any, channel: string): { destino?: string; erro?: string } {
  if (channel === "whatsapp") {
    const numero = String(c?.whatsapp || c?.phone || "").trim();
    if (numero.replace(/\D/g, "").length < 10) return { erro: "O cliente não tem WhatsApp cadastrado. Preencha no cadastro do cliente." };
    return { destino: numero };
  }
  const email = emailValido(c?.email);
  if (!email) return { erro: "O cliente não tem e-mail cadastrado. Preencha no cadastro do cliente." };
  return { destino: email };
}

async function montarProposta(
  service: any,
  userClient: any,
  owner: string,
  gestor: boolean,
  id: string,
  channel: string,
  marca: Marca,
): Promise<Montado> {
  const { data: p } = await service
    .from("vendas_propostas")
    .select("id, user_id, number, status, total, valid_until, public_token, sent_at, representative_id, customer_id, payment_terms")
    .eq("id", id)
    .maybeSingle();
  if (!p || p.user_id !== owner) return { erro: "Proposta não encontrada." };

  if (!gestor) {
    // O representante só envia as dele (vendas_da_carteira confere módulo, equipe, papel e dono da proposta).
    const { data: dele } = await userClient.rpc("vendas_da_carteira", { _owner: owner, _rep: p.representative_id });
    if (dele !== true) return { erro: "Você não tem permissão para enviar esta proposta.", code: "forbidden" };
  }
  if (p.status === "cancelled") return { erro: "Esta proposta foi cancelada e não pode ser enviada." };

  const { count } = await service
    .from("vendas_proposta_itens")
    .select("id", { count: "exact", head: true })
    .eq("proposta_id", p.id);
  if (!count) return { erro: "A proposta não tem itens. Inclua os produtos antes de enviar." };

  const [{ data: c }, { data: rep }] = await Promise.all([
    service.from("pdv_customers").select("name, trade_name, contact_name, email, phone, whatsapp").eq("id", p.customer_id).eq("user_id", owner).maybeSingle(),
    p.representative_id
      ? service.from("vendas_representantes").select("name, phone, email").eq("id", p.representative_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!c) return { erro: "Cliente da proposta não encontrado." };
  const dest = destinoDoCliente(c, channel);
  if (dest.erro) return { erro: dest.erro };

  const link = `${APP_ORIGIN}/proposta/${p.public_token}`;
  const nome = saudacao(c);
  const validade = p.valid_until ? dataBR(p.valid_until) : "";
  const assinatura = rep?.name ? `${rep.name} · ${marca.nome}` : marca.nome;

  const texto = [
    `Olá${nome ? `, ${nome}` : ""}! ${marca.nome} enviou a proposta ${p.number}, no total de ${reais(p.total)}.`,
    `Veja os itens e as condições, e aprove por aqui: ${link}`,
    validade ? `Proposta válida até ${validade}.` : "",
    assinatura,
  ]
    .filter(Boolean)
    .join("\n\n");

  const html = emailHtml(
    marca,
    `Proposta ${p.number}`,
    [
      `Olá${nome ? `, ${esc(nome)}` : ""}!`,
      `${esc(marca.nome)} enviou a proposta <strong>${esc(p.number)}</strong>, no total de <strong>${reaisHtml(p.total)}</strong>.`,
      `Pelo link você vê os itens e as condições e pode aprovar a proposta.${validade ? ` Ela vale até ${esc(validade)}.` : ""}`,
    ],
    { texto: "Ver proposta", url: link },
    [esc(assinatura), ...(rep?.phone ? [esc(rep.phone)] : []), ...(rep?.email ? [esc(rep.email)] : [])],
  );

  return {
    destino: dest.destino!,
    texto,
    assunto: `Proposta ${p.number} · ${marca.nome}`,
    html,
    depois: async () => {
      // O link público só mostra proposta que saiu do rascunho; sent_at guarda o PRIMEIRO envio.
      const patch: Record<string, unknown> = {};
      if (p.status === "draft") patch.status = "sent";
      if (!p.sent_at) patch.sent_at = new Date().toISOString();
      if (Object.keys(patch).length) {
        const { error } = await service.from("vendas_propostas").update(patch).eq("id", p.id).eq("user_id", owner);
        if (error) console.error("[vendas-enviar] marcar enviada:", error.message);
      }
    },
  };
}

async function montarCobranca(
  service: any,
  owner: string,
  gestor: boolean,
  id: string,
  channel: string,
  marca: Marca,
): Promise<Montado> {
  if (!gestor) return { erro: "Só o dono, o gerente ou o financeiro podem enviar cobranças.", code: "forbidden" };

  const { data: tx } = await service
    .from("pdv_financial_transactions")
    .select("id, transaction_type, amount, due_date, status, description, customer_id, charge_url, bank_slip_url, pix_payload, charged_at, asaas_status")
    .eq("id", id)
    .eq("user_id", owner)
    .maybeSingle();
  if (!tx || tx.transaction_type !== "receivable") return { erro: "Conta a receber não encontrada." };
  if (tx.status === "paid") return { erro: "Esta conta já foi paga." };
  if (tx.status === "cancelled") return { erro: "Esta conta foi cancelada." };
  if (!tx.charge_url || tx.asaas_status === "DELETED") return { erro: "Gere a cobrança no Asaas antes de enviar." };
  if (!tx.customer_id) return { erro: "Esta conta não tem cliente vinculado." };

  const { data: c } = await service
    .from("pdv_customers")
    .select("name, trade_name, contact_name, email, phone, whatsapp")
    .eq("id", tx.customer_id)
    .eq("user_id", owner)
    .maybeSingle();
  if (!c) return { erro: "Cliente da conta não encontrado." };
  const dest = destinoDoCliente(c, channel);
  if (dest.erro) return { erro: dest.erro };

  // Parcela já vencida foi cobrada no Asaas com vencimento no dia da cobrança: a mensagem mostra essa data.
  const venc = String(tx.due_date ?? "");
  const cobradoEm = tx.charged_at ? dataSP(tx.charged_at) : "";
  const vencimento = dataBR(cobradoEm && cobradoEm > venc ? cobradoEm : venc);
  const nome = saudacao(c);
  const referente = String(tx.description ?? "").trim();
  const pix = String(tx.pix_payload ?? "").trim();

  const texto = [
    `Olá${nome ? `, ${nome}` : ""}! ${marca.nome} enviou uma cobrança de ${reais(tx.amount)}${vencimento ? ` com vencimento em ${vencimento}` : ""}.`,
    referente ? `Referente a: ${referente}.` : "",
    `Para pagar: ${tx.charge_url}`,
    pix ? `PIX copia e cola:\n${pix}` : "",
    marca.nome,
  ]
    .filter(Boolean)
    .join("\n\n");

  const html = emailHtml(
    marca,
    "Cobrança",
    [
      `Olá${nome ? `, ${esc(nome)}` : ""}!`,
      `${esc(marca.nome)} enviou uma cobrança de <strong>${reaisHtml(tx.amount)}</strong>${vencimento ? `, com vencimento em <strong>${esc(vencimento)}</strong>` : ""}.`,
      ...(referente ? [`Referente a: ${esc(referente)}.`] : []),
      ...(tx.bank_slip_url ? [`Boleto: <a href="${esc(tx.bank_slip_url)}">${esc(tx.bank_slip_url)}</a>`] : []),
      ...(pix
        ? [`PIX copia e cola:<br><span style="font-family:monospace;font-size:12px;word-break:break-all">${esc(pix)}</span>`]
        : []),
    ],
    { texto: "Pagar agora", url: String(tx.charge_url) },
    [esc(marca.nome)],
  );

  return {
    destino: dest.destino!,
    texto,
    assunto: `Cobrança ${marca.nome}${vencimento ? ` · vencimento ${vencimento}` : ""}`,
    html,
  };
}
