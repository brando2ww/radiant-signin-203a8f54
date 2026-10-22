// delivery-nfce — NFC-e automática do delivery (próprio e iFood), pelo servidor.
//
// A nota do delivery saía só pelo navegador, quando alguém concluía o pedido
// na tela, e só no caminho do pedido próprio. O pedido do iFood é concluído
// pelo evento da plataforma, no servidor, e nunca passava por ali.
//
// Ações:
//   sweep            (chave de serviço, cron a cada minuto) reserva até 5
//                    pedidos (delivery_nfce_reservar) e emite
//   emitir {orderId} (caixa, com o login da loja) emite na hora, quando o
//                    pagamento do delivery é registrado no caixa
//   simular {orderId} monta a nota de um pedido real e devolve o que iria
//                    para a Focus, sem enviar e sem gravar nada
//
// A emissão em si continua em focusnfe-emitir-nfce (chamada interna com
// x-owner-id), para a regra fiscal ficar num lugar só.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authedOwner } from "../_shared/focusnfe-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(SUPABASE_URL, SERVICE_KEY);

/** IFOOD.COM AGÊNCIA DE RESTAURANTES ONLINE S.A. · o intermediador da venda. */
const IFOOD_CNPJ = "14380200000121";
/** Teto por varredura: cada nota leva alguns segundos na Focus. */
const LOTE = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const COLUNAS_FISCAIS =
  "id, name, ncm, cfop, cest, origin, ean, tax_unit, cst_icms, csosn, icms_rate, pis_cst, pis_rate, cofins_cst, cofins_rate";

type Montagem =
  | { ownerId: string; body: Record<string, unknown>; resumo: string }
  | { erro: string };

/**
 * Monta o corpo da emissão a partir do pedido.
 *
 * Regras de valor (pedido do iFood):
 * - item pelo `subtotal` da linha, que já inclui os adicionais. O preço base
 *   sozinho deixava de fora o que o cliente pagou nos complementos;
 * - frete só quando quem entrega é a loja (no iFood, `MERCHANT`);
 * - desconto só a parte que a LOJA banca. O que o iFood banca ele repassa ao
 *   restaurante, então não reduz a venda da loja;
 * - a taxa de serviço do iFood (`additionalFees`) é do iFood e fica fora.
 */
async function montar(orderId: string): Promise<Montagem> {
  const { data: pedido } = await service
    .from("delivery_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!pedido) return { erro: "pedido não encontrado" };

  const ownerId = pedido.user_id as string;
  const ifood = pedido.source === "ifood";

  const { data: linhas } = await service
    .from("delivery_order_items")
    .select("product_id, product_name, quantity, unit_price, subtotal")
    .eq("order_id", orderId);

  // Adicional sem preço (acompanhamento incluído) não é item de venda.
  const itens = (linhas ?? [])
    .map((l: any) => ({
      ...l,
      valor: Number(l.subtotal ?? Number(l.unit_price ?? 0) * Number(l.quantity ?? 0)),
      quantidade: Number(l.quantity) || 1,
    }))
    .filter((l) => l.valor > 0);
  if (itens.length === 0) return { erro: "pedido sem itens com valor" };

  // O item do pedido aponta para o cadastro do DELIVERY; os dados fiscais
  // (NCM, CFOP, CSOSN) estão no produto do PDV de origem. Busca só o que o
  // pedido usa: carregar o cardápio inteiro esbarra no teto de 1000 linhas.
  const idsDelivery = [...new Set(itens.map((l) => l.product_id).filter(Boolean))] as string[];
  const { data: prodsDelivery } = idsDelivery.length
    ? await service.from("delivery_products").select("id, name, source_pdv_product_id").in("id", idsDelivery)
    : { data: [] as any[] };
  const deliveryPorId = new Map<string, any>((prodsDelivery ?? []).map((p: any) => [p.id, p]));

  // Item do iFood sem vínculo com o cardápio ainda tem uma chance pelo nome:
  // primeiro no cadastro do delivery, depois direto no do PDV.
  const origemPdv = new Map<string, string | null>();
  for (const l of itens) {
    let pdvId: string | null = deliveryPorId.get(l.product_id)?.source_pdv_product_id ?? null;
    if (!pdvId) {
      const { data: porNome } = await service
        .from("delivery_products")
        .select("source_pdv_product_id")
        .eq("user_id", ownerId)
        .ilike("name", String(l.product_name ?? "").trim())
        .not("source_pdv_product_id", "is", null)
        .limit(1);
      pdvId = porNome?.[0]?.source_pdv_product_id ?? null;
    }
    origemPdv.set(l.product_name + "|" + l.product_id, pdvId);
  }

  const idsPdv = [...new Set([...origemPdv.values()].filter(Boolean))] as string[];
  const { data: prodsPdv } = idsPdv.length
    ? await service.from("pdv_products").select(COLUNAS_FISCAIS).in("id", idsPdv)
    : { data: [] as any[] };
  const pdvPorId = new Map<string, any>((prodsPdv ?? []).map((p: any) => [p.id, p]));

  const fiscalDe = async (l: any): Promise<any> => {
    const id = origemPdv.get(l.product_name + "|" + l.product_id);
    if (id && pdvPorId.get(id)) return pdvPorId.get(id);
    const { data: porNome } = await service
      .from("pdv_products")
      .select(COLUNAS_FISCAIS)
      .eq("user_id", ownerId)
      .ilike("name", String(l.product_name ?? "").trim())
      .not("ncm", "is", null)
      .limit(1);
    return porNome?.[0] ?? {};
  };

  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const items = await Promise.all(itens.map(async (l) => {
    const p = await fiscalDe(l);
    return {
      product_id: p.id ?? null,
      product_name: l.product_name,
      quantity: l.quantidade,
      // Até 4 casas: subtotal com adicional nem sempre divide redondo.
      unit_price: Math.round((l.valor / l.quantidade) * 10000) / 10000,
      ncm: p.ncm ?? null,
      cfop: p.cfop ?? null,
      cest: p.cest ?? null,
      origem: p.origin ?? null,
      ean: p.ean ?? null,
      unidade: p.tax_unit ?? null,
      csosn: p.csosn ?? null,
      cst_icms: p.cst_icms ?? null,
      icms_rate: num(p.icms_rate),
      pis_cst: p.pis_cst ?? null,
      pis_rate: num(p.pis_rate),
      cofins_cst: p.cofins_cst ?? null,
      cofins_rate: num(p.cofins_rate),
    };
  }));

  const retirada = pedido.order_type === "pickup";
  const entregaDoIfood = ifood && String(pedido.external_delivered_by ?? "").toUpperCase() === "IFOOD";
  const frete = retirada || entregaDoIfood ? 0 : Number(pedido.delivery_fee ?? 0);
  const desconto = ifood
    ? Number(pedido.discount_sponsor_merchant ?? 0)
    : Number(pedido.discount ?? 0);

  // CPF na nota: o iFood manda quando o cliente pede; no próprio, vem do cadastro.
  let cpf = String(pedido.customer_document ?? "").replace(/\D/g, "");
  if (cpf.length !== 11 && pedido.customer_id) {
    const { data: cliente } = await service
      .from("delivery_customers")
      .select("cpf")
      .eq("id", pedido.customer_id)
      .maybeSingle();
    cpf = String((cliente as any)?.cpf ?? "").replace(/\D/g, "");
  }

  let intermediador: { cnpj: string; identificador: string } | null = null;
  if (ifood) {
    const { data: cfg } = await service
      .from("pdv_settings")
      .select("ifood_merchant_id, ifood_merchant_name")
      .eq("user_id", ownerId)
      .maybeSingle();
    intermediador = {
      cnpj: IFOOD_CNPJ,
      identificador: String((cfg as any)?.ifood_merchant_id || (cfg as any)?.ifood_merchant_name || "iFood"),
    };
  }

  const metodo = String(pedido.payment_method ?? "").toLowerCase();
  const online = String(pedido.external_payment_type ?? "").toUpperCase() === "ONLINE";
  const numeroPedido = pedido.external_code || pedido.order_number;

  return {
    ownerId,
    resumo: `${ifood ? "iFood" : "Delivery"} #${numeroPedido}`,
    body: {
      items,
      valor_desconto: desconto,
      valor_frete: frete,
      // O valor é acertado para o total da nota na montagem; a forma é o que importa.
      pagamentos: [{
        forma_pagamento: metodo || "dinheiro",
        valor: Number(pedido.total ?? 0),
        descricao: ifood && online ? "Pagamento online iFood" : null,
      }],
      customer: {
        cpf: cpf.length === 11 ? cpf : null,
        name: pedido.customer_name || null,
      },
      presencial: retirada,
      intermediador: retirada ? null : intermediador,
      informacoes_adicionais: `Pedido ${ifood ? "iFood " : ""}${numeroPedido}`,
      origem_tipo: "delivery_order",
      origem_id: orderId,
    },
  };
}

/** Chama a emissão com a chave de serviço, em nome da loja. */
async function emitir(ownerId: string, body: Record<string, unknown>) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/focusnfe-emitir-nfce`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "x-owner-id": ownerId,
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  return { httpStatus: resp.status, data: data as Record<string, any> };
}

/**
 * O cupom do delivery sai na impressora do caixa, como fazia a emissão pela
 * tela. Mesmo job que o PDV enfileira (`pdv_print_jobs`, kind `danfe`).
 */
async function imprimirDanfe(notaId: string) {
  const { data: nota } = await service
    .from("notas_fiscais")
    .select("id, user_id, numero, serie, chave_acesso, protocolo, qrcode, url_consulta, valor_total, status, destinatario_nome, destinatario_documento, emitida_em, payload_enviado")
    .eq("id", notaId)
    .maybeSingle();
  if (!nota || nota.status !== "autorizada") return;

  const { data: jaTem } = await service
    .from("pdv_print_jobs").select("id")
    .eq("source_kind", "danfe").eq("source_item_id", notaId).limit(1);
  if (jaTem?.length) return;

  const { data: centro } = await service
    .from("pdv_production_centers")
    .select("id, name, printer_ip, printer_port")
    .eq("user_id", nota.user_id).eq("slug", "caixa").eq("is_active", true)
    .maybeSingle();
  if (!centro?.printer_ip) return;

  const enviado = (nota.payload_enviado ?? {}) as any;
  const itens = Array.isArray(enviado.items) ? enviado.items : [];
  const formas = Array.isArray(enviado.formas_pagamento) ? enviado.formas_pagamento : [];

  await service.from("pdv_print_jobs").insert({
    tenant_user_id: nota.user_id,
    source_kind: "danfe",
    source_item_id: notaId,
    center_id: centro.id,
    center_name: centro.name,
    printer_ip: centro.printer_ip,
    printer_port: centro.printer_port || 9100,
    payload: {
      kind: "danfe",
      nota_id: nota.id,
      numero: nota.numero,
      serie: nota.serie,
      chave_acesso: nota.chave_acesso,
      protocolo: nota.protocolo,
      qrcode: nota.qrcode,
      url_consulta: nota.url_consulta,
      emitida_em: nota.emitida_em,
      reimpressao: false,
      destinatario_nome: nota.destinatario_nome,
      destinatario_documento: nota.destinatario_documento,
      valor_produtos: enviado.valor_produtos ?? null,
      valor_desconto: enviado.valor_desconto ?? null,
      valor_frete: enviado.valor_frete ?? null,
      valor_outras_despesas: enviado.valor_outras_despesas ?? null,
      valor_total: nota.valor_total,
      items: itens.map((i: any) => ({
        descricao: i.descricao,
        quantidade: i.quantidade_comercial,
        unidade: i.unidade_comercial,
        valor_unitario: i.valor_unitario_comercial,
        valor_bruto: i.valor_bruto,
        valor_desconto: i.valor_desconto ?? 0,
      })),
      formas_pagamento: formas.map((f: any) => ({
        forma_pagamento: f.forma_pagamento,
        valor: f.valor_pagamento,
      })),
    },
    status: "pending",
  });
}

async function processar(orderId: string) {
  const montagem = await montar(orderId);
  if ("erro" in montagem) {
    await service.from("delivery_nfce_tentativas")
      .update({ erro: montagem.erro }).eq("order_id", orderId);
    return { orderId, ok: false, erro: montagem.erro };
  }

  const { data } = await emitir(montagem.ownerId, montagem.body);
  const notaId = data.emission_id ?? null;

  // Sem nota gravada = a emissão parou antes da SEFAZ (produto sem NCM,
  // NFC-e desligada...). Fica registrado para o aviso de pendências e para a
  // nova tentativa de hora em hora.
  if (!notaId) {
    const motivo = Array.isArray(data.missing) && data.missing.length
      ? `${montagem.resumo}: ${data.missing.join("; ")}`
      : `${montagem.resumo}: ${data.error ?? data.motivo ?? "não emitida"}`;
    await service.from("delivery_nfce_tentativas")
      .update({ erro: motivo.slice(0, 500) }).eq("order_id", orderId);
    return { orderId, ok: false, erro: motivo };
  }

  await service.from("delivery_nfce_tentativas")
    .update({ nota_id: notaId, erro: null }).eq("order_id", orderId);

  if (data.success) {
    await imprimirDanfe(notaId).catch((e) => console.warn("[delivery-nfce] danfe:", (e as Error).message));
  }
  return { orderId, ok: !!data.success, status: data.status, motivo: data.motivo ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let corpo: Record<string, any> = {};
  try {
    corpo = await req.json();
  } catch {
    /* sweep sem corpo */
  }
  const acao = corpo.action ?? "sweep";
  const servico = req.headers.get("Authorization") === `Bearer ${SERVICE_KEY}`;

  try {
    // Caixa: o operador registrou o pagamento de um pedido do delivery.
    if (acao === "emitir") {
      if (!corpo.orderId) return json({ error: "orderId obrigatório" }, 400);
      let dono: string | null = null;
      if (!servico) {
        const auth = await authedOwner(req);
        if (auth instanceof Response) return auth;
        dono = auth.ownerId;
      }
      const montagem = await montar(String(corpo.orderId));
      if ("erro" in montagem) return json({ success: false, error: montagem.erro });
      if (dono && montagem.ownerId !== dono) return json({ error: "Pedido de outra loja." }, 403);

      const { data } = await emitir(montagem.ownerId, montagem.body);
      if (data.emission_id) {
        await service.from("delivery_nfce_tentativas").upsert({
          order_id: String(corpo.orderId),
          user_id: montagem.ownerId,
          tentativa_em: new Date().toISOString(),
          nota_id: data.emission_id,
          erro: null,
        });
        if (data.success) {
          await imprimirDanfe(data.emission_id).catch((e) =>
            console.warn("[delivery-nfce] danfe:", (e as Error).message)
          );
        }
      }
      return json(data);
    }

    if (!servico) return json({ error: "Unauthorized" }, 401);

    if (acao === "simular") {
      if (!corpo.orderId) return json({ error: "orderId obrigatório" }, 400);
      const montagem = await montar(String(corpo.orderId));
      if ("erro" in montagem) return json({ erro: montagem.erro });
      const { httpStatus, data } = await emitir(montagem.ownerId, {
        ...montagem.body,
        simular: true,
      });
      return json({ resumo: montagem.resumo, httpStatus, ...data });
    }

    if (acao === "sweep") {
      const { data: reservados, error } = await service.rpc("delivery_nfce_reservar", { p_limite: LOTE });
      if (error) throw error;
      const resultados = [];
      for (const r of (reservados ?? []) as { order_id: string }[]) {
        try {
          resultados.push(await processar(r.order_id));
        } catch (e) {
          // Sem erro gravado a reserva volta para a fila em 15 min.
          console.error("[delivery-nfce]", r.order_id, (e as Error).message);
          resultados.push({ orderId: r.order_id, ok: false, erro: (e as Error).message });
        }
      }
      return json({ processados: resultados.length, resultados });
    }

    return json({ error: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("[delivery-nfce] erro:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
