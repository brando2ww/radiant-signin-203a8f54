// vendas-asaas · cobrança pelo Asaas do PRÓPRIO estabelecimento (Força de vendas).
//
// Autenticada: exige o login de quem está na tela e que ele seja gestor (dono, gerente ou financeiro) do
// estabelecimento, com o módulo de vendas liberado (vendas_gestor, conferido com o login dele, não com a chave de
// serviço). A chave do Asaas é gravada e lida só aqui, pelo cofre do banco, e nunca volta na resposta.
//
// Ações (corpo { action, ... }):
//   connect    { api_key, environment }  valida a chave, guarda no cofre e cadastra o webhook de pagamentos
//   disconnect                           remove o webhook, apaga a chave do cofre e marca desconectado
//   status                               dados da conta conectada (sem a chave)
//   charge     { transaction_ids, billing_type }  gera a cobrança de cada conta a receber em aberto
//   cancel     { transaction_id }        cancela a cobrança no Asaas (a conta continua em aberto no PDV)
//   sync       { transaction_ids? }      consulta o Asaas e aplica a mesma regra do webhook (baixa, vencida, estorno)
//
// Respostas: 401 sem login válido; todo o resto é 200 com { ok, ... } e, quando dá errado, { ok: false, error } com a
// mensagem pronta para a tela. Erro por linha (charge/sync) vem em results[i].error, com ok geral true.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  AMBIENTE_ROTULO,
  ambienteDaChave,
  Asaas,
  type AsaasEnv,
  type ClientePdv,
  clienteParaAsaas,
  EVENTOS_WEBHOOK,
  hojeSP,
  mapearPagamento,
  nomeDoCliente,
  soDigitos,
  TIPOS_COBRANCA,
  type TipoCobranca,
  type TxAsaas,
  vencimentoParaAsaas,
} from "../_shared/asaas.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const falha = (error: string, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_POR_VEZ = 50;

const PUBLIC_URL = (Deno.env.get("SUPABASE_PUBLIC_URL") || "https://velara-pdv.db.venzorgroup.com.br").replace(/\/+$/, "");
const webhookUrl = (token: string) => `${PUBLIC_URL}/functions/v1/vendas-asaas-webhook?token=${encodeURIComponent(token)}`;

const CAMPOS_TX =
  "id, user_id, transaction_type, amount, due_date, status, description, customer_id, asaas_payment_id, asaas_status, " +
  "charge_url, bank_slip_url, pix_payload, net_amount, fee_amount, gross_amount";
const CAMPOS_CLIENTE =
  "id, name, person_type, cpf, cnpj, company_name, trade_name, contact_name, email, phone, whatsapp, cep, street, " +
  "address_number, complement, district, state_registration, asaas_customer_id";

/** Roda `fn` sobre a lista com no máximo `n` chamadas ao mesmo tempo, mantendo a ordem do resultado. */
async function emParalelo<T, R>(itens: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(itens.length);
  let i = 0;
  const trabalhador = async () => {
    while (i < itens.length) {
      const k = i++;
      out[k] = await fn(itens[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  return out;
}

const listaDeIds = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null;
  const ids = [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))];
  return ids.every((x) => UUID.test(x)) ? ids : null;
};

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
  const action = String(body?.action ?? "");

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: ownerData } = await service.rpc("pdv_resolve_owner", { _user_id: user.id });
    const owner = (ownerData as string) || user.id;

    // Conferido com o login de quem chamou (auth.uid() dentro da função), nunca com a chave de serviço.
    const { data: gestor } = await userClient.rpc("vendas_gestor", { _owner: owner });
    if (gestor !== true) {
      return falha("Só o dono, o gerente ou o financeiro podem mexer na cobrança pelo Asaas.", { code: "forbidden" });
    }

    switch (action) {
      case "connect":
        return await conectar(service, owner, user.email ?? null, body);
      case "disconnect":
        return await desconectar(service, owner);
      case "status":
        return await situacao(service, owner);
      case "charge":
        return await cobrar(service, owner, body);
      case "cancel":
        return await cancelar(service, owner, body);
      case "sync":
        return await sincronizar(service, owner, body);
      default:
        return falha("Ação inválida.");
    }
  } catch (e) {
    console.error("[vendas-asaas]", action, String(e));
    return json({ ok: false, error: "Erro interno ao falar com o Asaas. Tente de novo." }, 500);
  }
});

// ── Conexão ────────────────────────────────────────────────────────────────

async function conectar(service: any, owner: string, emailUsuario: string | null, body: any) {
  const chave = String(body?.api_key ?? "").trim();
  const ambiente = String(body?.environment ?? "") as AsaasEnv;
  if (!chave) return falha("Informe a chave de API do Asaas.");
  if (ambiente !== "production" && ambiente !== "sandbox") return falha("Escolha o ambiente: produção ou sandbox.");
  if (/\s/.test(chave) || chave.length < 20) {
    return falha("Chave de API do Asaas inválida. Copie a chave inteira, começando pelo $.");
  }

  const outro: AsaasEnv = ambiente === "production" ? "sandbox" : "production";
  const ambienteErrado = (doCerto: AsaasEnv) =>
    falha(
      `Esta chave é do ambiente ${AMBIENTE_ROTULO[doCerto]}, mas você escolheu ${AMBIENTE_ROTULO[ambiente]}. ` +
        "Troque o ambiente ou use a chave do outro ambiente.",
      { code: "wrong_environment" },
    );

  const pelaChave = ambienteDaChave(chave);
  if (pelaChave && pelaChave !== ambiente) return ambienteErrado(pelaChave);

  const api = new Asaas(chave, ambiente);
  let conta = await api.conta();
  if (!conta.ok && conta.codigo === "invalid_access_token") {
    // Chave do formato antigo não diz o ambiente: se ela funciona do outro lado, o erro é de ambiente, não de chave.
    if (!pelaChave) {
      const tentativa = await new Asaas(chave, outro).conta();
      if (tentativa.ok) return ambienteErrado(outro);
    }
    return falha("Chave de API do Asaas inválida. Confira se copiou a chave inteira, começando pelo $.", {
      code: "invalid_key",
    });
  }
  if (!conta.ok && (conta.status === 403 || conta.status === 404)) {
    // Algumas contas não expõem os dados comerciais: o saldo basta para provar que a chave vale.
    const saldo = await api.saldo();
    if (!saldo.ok) return falha(saldo.erro ?? "O Asaas recusou a chave.");
    conta = { ok: true, status: 200, data: null };
  }
  if (!conta.ok) return falha(conta.erro ?? "O Asaas recusou a chave.");

  const info = conta.data ?? {};
  const carteiras = await api.carteiras();
  const account = {
    name: String(info.companyName || info.tradingName || info.name || "").trim() || null,
    document: soDigitos(info.cpfCnpj) || null,
    wallet_id: carteiras.ok ? (carteiras.data?.data?.[0]?.id ?? null) : null,
  };

  // Conexão anterior (talvez de outra conta): o webhook dela sai com a chave DELA, antes de a chave ser trocada.
  const { data: antes } = await service
    .from("vendas_asaas")
    .select("environment, webhook_id, status")
    .eq("user_id", owner)
    .maybeSingle();
  if (antes?.webhook_id && antes.status === "connected") {
    const { data: chaveAntiga } = await service.rpc("vendas_asaas_chave", { _owner: owner });
    if (chaveAntiga) await new Asaas(String(chaveAntiga), antes.environment as AsaasEnv).apagarWebhook(antes.webhook_id);
  }

  const { error: erroGravar } = await service.rpc("vendas_asaas_gravar", {
    _owner: owner,
    _key: chave,
    _environment: ambiente,
    _account: account,
  });
  if (erroGravar) {
    console.error("[vendas-asaas] gravar:", erroGravar.message);
    return falha("Não foi possível guardar a chave. Tente de novo.");
  }

  const { data: linha } = await service.from("vendas_asaas").select("webhook_token").eq("user_id", owner).maybeSingle();
  if (!linha?.webhook_token) return falha("Não foi possível concluir a conexão. Tente de novo.");
  const token = String(linha.webhook_token);
  const url = webhookUrl(token);

  // Reconectar a mesma conta não pode deixar dois webhooks iguais (cada pagamento chegaria duas vezes).
  const existentes = await api.webhooks();
  if (existentes.ok && Array.isArray(existentes.data?.data)) {
    for (const w of existentes.data.data) {
      if (typeof w?.url === "string" && w.url.includes(`token=${token}`) && w.id) await api.apagarWebhook(w.id);
    }
  }

  const criado = await api.criarWebhook({
    name: "Velara · Força de vendas",
    url,
    email: String(info.email || emailUsuario || "").trim() || undefined,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: token,
    sendType: "SEQUENTIALLY",
    events: EVENTOS_WEBHOOK,
  });

  const webhookId = criado.ok ? (criado.data?.id ?? null) : null;
  const aviso = webhookId
    ? null
    : `A conta foi conectada, mas o Asaas não aceitou o aviso automático de pagamento (${criado.erro ?? "sem detalhe"}). ` +
      "Até resolver, use o botão de atualizar as cobranças para dar baixa.";
  await service
    .from("vendas_asaas")
    .update({ webhook_id: webhookId, last_error: aviso, updated_at: new Date().toISOString() })
    .eq("user_id", owner);

  return json({
    ok: true,
    account: { name: account.name, document: account.document },
    environment: ambiente,
    webhook: !!webhookId,
    ...(aviso ? { warning: aviso } : {}),
  });
}

async function desconectar(service: any, owner: string) {
  const { data: linha } = await service
    .from("vendas_asaas")
    .select("environment, webhook_id, status")
    .eq("user_id", owner)
    .maybeSingle();
  if (!linha) return json({ ok: true });

  let aviso: string | null = null;
  if (linha.webhook_id) {
    const { data: chave } = await service.rpc("vendas_asaas_chave", { _owner: owner });
    if (chave) {
      const r = await new Asaas(String(chave), linha.environment as AsaasEnv).apagarWebhook(linha.webhook_id);
      if (!r.ok && r.status !== 404) {
        aviso = "O aviso de pagamento não pôde ser removido no Asaas. Se quiser, apague o webhook \"Velara\" no painel do Asaas.";
      }
    }
  }

  const { error } = await service.rpc("vendas_asaas_desconectar", { _owner: owner, _motivo: null });
  if (error) {
    console.error("[vendas-asaas] desconectar:", error.message);
    return falha("Não foi possível desconectar. Tente de novo.");
  }
  return json({ ok: true, ...(aviso ? { warning: aviso } : {}) });
}

async function situacao(service: any, owner: string) {
  const { data: l } = await service
    .from("vendas_asaas")
    .select("environment, key_hint, webhook_id, account_name, account_document, wallet_id, status, last_error, connected_at")
    .eq("user_id", owner)
    .maybeSingle();
  if (!l) return json({ ok: true, connected: false, status: "disconnected" });
  return json({
    ok: true,
    connected: l.status === "connected",
    status: l.status,
    environment: l.environment,
    account: { name: l.account_name, document: l.account_document, wallet_id: l.wallet_id },
    key_hint: l.key_hint,
    webhook: !!l.webhook_id,
    last_error: l.last_error,
    connected_at: l.connected_at,
  });
}

/** Cliente do Asaas pronto para usar: a chave do cofre e o ambiente gravado. */
async function apiDoDono(service: any, owner: string): Promise<Asaas | null> {
  const { data: linha } = await service.from("vendas_asaas").select("environment, status").eq("user_id", owner).maybeSingle();
  if (!linha || linha.status !== "connected") return null;
  const { data: chave } = await service.rpc("vendas_asaas_chave", { _owner: owner });
  return chave ? new Asaas(String(chave), linha.environment as AsaasEnv) : null;
}

const SEM_CONEXAO = "Conecte a conta do Asaas em Configurações antes de gerar ou consultar cobranças.";

// ── Gerar cobrança ─────────────────────────────────────────────────────────

type Resultado = {
  transaction_id: string;
  ok: boolean;
  charge_url?: string | null;
  bank_slip_url?: string | null;
  pix_payload?: string | null;
  asaas_payment_id?: string;
  asaas_status?: string | null;
  already_charged?: boolean;
  error?: string;
};

async function cobrar(service: any, owner: string, body: any) {
  const ids = listaDeIds(body?.transaction_ids);
  if (!ids) return falha("Lista de contas inválida.");
  if (ids.length === 0) return falha("Escolha ao menos uma conta a receber.");
  if (ids.length > MAX_POR_VEZ) return falha(`Gere no máximo ${MAX_POR_VEZ} cobranças por vez.`);
  const tipo = String(body?.billing_type ?? "") as TipoCobranca;
  if (!TIPOS_COBRANCA.includes(tipo)) return falha("Forma de cobrança inválida.");

  const api = await apiDoDono(service, owner);
  if (!api) return falha(SEM_CONEXAO, { code: "not_connected" });

  const { data: txs, error } = await service.from("pdv_financial_transactions").select(CAMPOS_TX).in("id", ids).eq("user_id", owner);
  if (error) throw error;
  const porId = new Map<string, any>((txs ?? []).map((t: any) => [t.id, t]));

  const clienteIds = [...new Set((txs ?? []).map((t: any) => t.customer_id).filter(Boolean))];
  const { data: clientes } = clienteIds.length
    ? await service.from("pdv_customers").select(CAMPOS_CLIENTE).in("id", clienteIds).eq("user_id", owner)
    : { data: [] };
  const clientePorId = new Map<string, ClientePdv>((clientes ?? []).map((c: any) => [c.id, c]));

  // Um cliente com várias parcelas é criado no Asaas uma vez só, mesmo com as parcelas correndo em paralelo.
  const garantidos = new Map<string, Promise<{ id?: string; erro?: string }>>();
  const garantirCliente = (c: ClientePdv, refazer = false) => {
    const k = `${c.id}:${refazer ? "novo" : "atual"}`;
    if (!garantidos.has(k)) garantidos.set(k, prepararCliente(service, api, owner, c, refazer));
    return garantidos.get(k)!;
  };

  const hoje = hojeSP();
  const results = await emParalelo(ids, 4, async (id): Promise<Resultado> => {
    const tx = porId.get(id);
    if (!tx) return { transaction_id: id, ok: false, error: "Conta a receber não encontrada." };
    if (tx.transaction_type !== "receivable") return { transaction_id: id, ok: false, error: "Só contas a receber podem ser cobradas." };
    if (tx.status === "paid") return { transaction_id: id, ok: false, error: "Esta conta já foi paga." };
    if (tx.status === "cancelled") return { transaction_id: id, ok: false, error: "Esta conta foi cancelada." };
    if (tx.asaas_payment_id && tx.asaas_status !== "DELETED") {
      return {
        transaction_id: id,
        ok: true,
        already_charged: true,
        charge_url: tx.charge_url,
        bank_slip_url: tx.bank_slip_url,
        pix_payload: tx.pix_payload,
        asaas_payment_id: tx.asaas_payment_id,
        asaas_status: tx.asaas_status,
      };
    }
    const valor = Math.round(Number(tx.amount) * 100) / 100;
    if (!(valor > 0)) return { transaction_id: id, ok: false, error: "Valor da conta inválido para cobrança." };
    const c = tx.customer_id ? clientePorId.get(tx.customer_id) : undefined;
    if (!c) return { transaction_id: id, ok: false, error: "Esta conta não tem cliente vinculado. O Asaas exige um cliente com CPF ou CNPJ." };

    let cli = await garantirCliente(c);
    if (cli.erro) return { transaction_id: id, ok: false, error: cli.erro };

    const corpo = {
      customer: cli.id,
      billingType: tipo,
      value: valor,
      dueDate: vencimentoParaAsaas(tx.due_date, hoje),
      description: String(tx.description || "Cobrança").slice(0, 500),
      externalReference: tx.id,
    };
    let r = await api.criarCobranca(corpo);
    // Cliente gravado de outra conta do Asaas (a loja trocou de conta): cria de novo nesta e tenta mais uma vez.
    if (!r.ok && c.asaas_customer_id && cli.id === c.asaas_customer_id && (r.status === 404 || /customer/i.test(r.codigo ?? ""))) {
      cli = await garantirCliente(c, true);
      if (cli.erro) return { transaction_id: id, ok: false, error: cli.erro };
      r = await api.criarCobranca({ ...corpo, customer: cli.id });
    }
    if (!r.ok) return { transaction_id: id, ok: false, error: r.erro ?? "O Asaas recusou a cobrança." };

    const p = r.data ?? {};
    let pix: string | null = null;
    if (tipo === "PIX" || tipo === "UNDEFINED") {
      const q = await api.pixQrCode(p.id);
      if (q.ok && typeof q.data?.payload === "string") pix = q.data.payload;
    }

    const patch = {
      asaas_payment_id: p.id,
      asaas_status: String(p.status ?? "PENDING"),
      charge_url: p.invoiceUrl ?? null,
      bank_slip_url: p.bankSlipUrl ?? null,
      pix_payload: pix,
      charged_at: new Date().toISOString(),
    };
    // Dois cliques ao mesmo tempo não podem deixar duas cobranças: só grava quem ainda encontra a conta como leu.
    let upd = service.from("pdv_financial_transactions").update(patch).eq("id", tx.id).eq("user_id", owner);
    upd = tx.asaas_payment_id ? upd.eq("asaas_payment_id", tx.asaas_payment_id) : upd.is("asaas_payment_id", null);
    const { data: gravadas, error: erroGravar } = await upd.select("id");
    if (erroGravar || !gravadas?.length) {
      await api.apagarCobranca(p.id);
      if (erroGravar) console.error("[vendas-asaas] gravar cobrança:", erroGravar.message);
      return {
        transaction_id: id,
        ok: false,
        error: erroGravar
          ? "A cobrança não pôde ser gravada e foi desfeita no Asaas. Tente de novo."
          : "Outra cobrança foi gerada para esta conta ao mesmo tempo. Atualize a tela.",
      };
    }
    return {
      transaction_id: id,
      ok: true,
      charge_url: patch.charge_url,
      bank_slip_url: patch.bank_slip_url,
      pix_payload: patch.pix_payload,
      asaas_payment_id: patch.asaas_payment_id,
      asaas_status: patch.asaas_status,
    };
  });

  return json({ ok: true, results });
}

/** Garante o cliente no Asaas: reaproveita o id gravado, ou quem já tem o mesmo documento na conta, ou cria. */
async function prepararCliente(
  service: any,
  api: Asaas,
  owner: string,
  c: ClientePdv,
  refazer: boolean,
): Promise<{ id?: string; erro?: string }> {
  if (c.asaas_customer_id && !refazer) return { id: c.asaas_customer_id };
  const corpo = clienteParaAsaas(c);
  if (!corpo) {
    return { erro: `${nomeDoCliente(c)} não tem CPF ou CNPJ no cadastro. O Asaas exige o documento para emitir a cobrança.` };
  }
  let id: string | undefined;
  const busca = await api.clientesPorDocumento(String(corpo.cpfCnpj));
  if (busca.ok && Array.isArray(busca.data?.data)) {
    id = busca.data.data.find((x: any) => x?.id && !x.deleted && x.id !== c.asaas_customer_id)?.id;
  }
  if (!id) {
    const r = await api.criarCliente(corpo);
    if (!r.ok || !r.data?.id) return { erro: `Cliente ${nomeDoCliente(c)}: ${r.erro ?? "o Asaas recusou o cadastro."}` };
    id = String(r.data.id);
  }
  await service.from("pdv_customers").update({ asaas_customer_id: id }).eq("id", c.id).eq("user_id", owner);
  return { id };
}

// ── Cancelar ───────────────────────────────────────────────────────────────

async function cancelar(service: any, owner: string, body: any) {
  const id = String(body?.transaction_id ?? "");
  if (!UUID.test(id)) return falha("Conta a receber inválida.");
  const { data: tx } = await service.from("pdv_financial_transactions").select(CAMPOS_TX).eq("id", id).eq("user_id", owner).maybeSingle();
  if (!tx) return falha("Conta a receber não encontrada.");
  if (!tx.asaas_payment_id || tx.asaas_status === "DELETED") return falha("Esta conta não tem cobrança ativa no Asaas.");
  if (tx.status === "paid") return falha("Esta conta já foi paga: a cobrança não pode mais ser cancelada.");

  const api = await apiDoDono(service, owner);
  if (!api) return falha(SEM_CONEXAO, { code: "not_connected" });

  const r = await api.apagarCobranca(tx.asaas_payment_id);
  // 404: já não existe no Asaas (apagada lá no painel). O resultado para a loja é o mesmo.
  if (!r.ok && r.status !== 404) return falha(r.erro ?? "O Asaas não cancelou a cobrança.");

  const { error } = await service
    .from("pdv_financial_transactions")
    .update({ asaas_status: "DELETED", charge_url: null, bank_slip_url: null, pix_payload: null })
    .eq("id", tx.id)
    .eq("user_id", owner);
  if (error) throw error;
  return json({ ok: true, asaas_status: "DELETED" });
}

// ── Sincronizar (mesma regra do webhook) ───────────────────────────────────

async function sincronizar(service: any, owner: string, body: any) {
  const pedidos = body?.transaction_ids;
  let ids: string[] | null = null;
  if (pedidos !== undefined && pedidos !== null) {
    ids = listaDeIds(pedidos);
    if (!ids) return falha("Lista de contas inválida.");
    if (ids.length > 100) return falha("Atualize no máximo 100 contas por vez.");
  }

  const api = await apiDoDono(service, owner);
  if (!api) return falha(SEM_CONEXAO, { code: "not_connected" });

  let q = service.from("pdv_financial_transactions").select(CAMPOS_TX).eq("user_id", owner).eq("transaction_type", "receivable");
  if (ids && ids.length) {
    q = q.in("id", ids);
  } else {
    // Sem lista: as cobranças ainda em aberto (é o que pode ter mudado no Asaas).
    q = q.not("asaas_payment_id", "is", null).in("status", ["pending", "overdue"]).order("due_date", { ascending: true }).limit(100);
  }
  const { data: txs, error } = await q;
  if (error) throw error;

  const lista: any[] = ids && ids.length ? ids.map((id) => (txs ?? []).find((t: any) => t.id === id) ?? { id, _ausente: true }) : txs ?? [];
  const hoje = hojeSP();
  let updated = 0;

  const results = await emParalelo(lista, 4, async (tx: any) => {
    if (tx._ausente) return { transaction_id: tx.id, ok: false, error: "Conta a receber não encontrada." };
    if (!tx.asaas_payment_id) return { transaction_id: tx.id, ok: false, error: "Esta conta ainda não tem cobrança no Asaas." };
    const r = await api.cobranca(tx.asaas_payment_id);
    if (!r.ok) {
      return {
        transaction_id: tx.id,
        ok: false,
        error: r.status === 404 ? "Cobrança não encontrada no Asaas (foi removida ou é de outra conta)." : (r.erro ?? "Falha ao consultar o Asaas."),
      };
    }
    const patch = mapearPagamento(tx as TxAsaas, r.data, null, hoje);
    const mudou = Object.keys(patch).length > 0;
    if (mudou) {
      const { error: e } = await service.from("pdv_financial_transactions").update(patch).eq("id", tx.id).eq("user_id", owner);
      if (e) return { transaction_id: tx.id, ok: false, error: "Não foi possível gravar a situação. Tente de novo." };
      updated++;
    }
    return {
      transaction_id: tx.id,
      ok: true,
      changed: mudou,
      status: (patch.status as string) ?? tx.status,
      asaas_status: (patch.asaas_status as string) ?? tx.asaas_status,
      charge_url: "charge_url" in patch ? patch.charge_url : tx.charge_url,
      bank_slip_url: "bank_slip_url" in patch ? patch.bank_slip_url : tx.bank_slip_url,
    };
  });

  return json({ ok: true, updated, results });
}
