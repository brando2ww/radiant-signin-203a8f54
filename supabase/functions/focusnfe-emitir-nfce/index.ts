// focusnfe-emitir-nfce — emissão SÍNCRONA de NFC-e
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@3";
import {
  authedOwner,
  basicAuth,
  buildRef,
  corsHeaders,
  focusBaseUrl,
  getServiceClient,
  getTenantToken,
  json,
  translateSefazError,
} from "../_shared/focusnfe-utils.ts";

const ItemSchema = z.object({
  product_name: z.string(),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  ncm: z.string().optional().nullable(),
  cfop: z.string().optional().nullable(),
  unidade: z.string().optional().nullable(),
  ean: z.string().optional().nullable(),
  origem: z.number().int().optional().nullable(),
});

const BodySchema = z.object({
  items: z.array(ItemSchema).min(1),
  valor_desconto: z.number().nonnegative().default(0),
  forma_pagamento: z.string().default("01"),
  valor_pago: z.number().nonnegative().optional(),
  customer: z
    .object({
      cpf: z.string().optional(),
      email: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  origem_tipo: z.string().optional(),
  origem_id: z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await authedOwner(req);
    if (auth instanceof Response) return auth;
    const { ownerId } = auth;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: "Payload inválido", detail: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    const tk = await getTenantToken(ownerId);
    if ("error" in tk) return json({ error: tk.error }, 400);
    const { token, ambiente, config } = tk;

    const ref = buildRef(ownerId, "nfce");
    const valorTotal = body.items.reduce(
      (s, i) => s + i.quantity * i.unit_price,
      0,
    ) - body.valor_desconto;

    const payload = {
      natureza_operacao: "Venda ao consumidor",
      data_emissao: new Date().toISOString(),
      serie: String(config.serie_nfce || 1),
      tipo_documento: 1,
      local_destino: 1,
      consumidor_final: 1,
      presenca_comprador: 1,
      modalidade_frete: 9,
      cnpj_emitente: (config.cnpj || "").replace(/\D/g, ""),
      cpf_destinatario: body.customer?.cpf?.replace(/\D/g, "") || undefined,
      nome_destinatario: body.customer?.name || undefined,
      email_destinatario: body.customer?.email || undefined,
      items: body.items.map((it, idx) => ({
        numero_item: idx + 1,
        codigo_produto: `P${idx + 1}`,
        descricao: it.product_name,
        codigo_ncm: it.ncm || "00000000",
        cfop: it.cfop || "5102",
        unidade_comercial: it.unidade || "UN",
        quantidade_comercial: it.quantity,
        valor_unitario_comercial: it.unit_price,
        valor_unitario_tributavel: it.unit_price,
        unidade_tributavel: it.unidade || "UN",
        quantidade_tributavel: it.quantity,
        codigo_ean: it.ean || "SEM GTIN",
        codigo_ean_tributavel: it.ean || "SEM GTIN",
        origem: it.origem ?? 0,
        icms_situacao_tributaria: "102",
        pis_situacao_tributaria: "07",
        cofins_situacao_tributaria: "07",
      })),
      formas_pagamento: [
        {
          forma_pagamento: body.forma_pagamento,
          valor_pagamento: body.valor_pago ?? valorTotal,
        },
      ],
    };

    const service = getServiceClient();
    const inserted = await service.from("notas_fiscais").insert({
      user_id: ownerId,
      tipo: "nfce",
      ambiente,
      referencia_focusnfe: ref,
      status: "processando",
      valor_total: valorTotal,
      destinatario_nome: body.customer?.name,
      destinatario_documento: body.customer?.cpf,
      destinatario_email: body.customer?.email,
      payload_enviado: payload,
      origem_tipo: body.origem_tipo,
      origem_id: body.origem_id,
      emitida_em: new Date().toISOString(),
    }).select().single();

    const resp = await fetch(`${focusBaseUrl(ambiente)}/v2/nfce?ref=${ref}`, {
      method: "POST",
      headers: { Authorization: basicAuth(token), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));

    const status = data.status === "autorizado"
      ? "autorizada"
      : data.status === "cancelado"
      ? "cancelada"
      : data.status === "denegado"
      ? "denegada"
      : (resp.ok ? "processando" : "rejeitada");

    const motivo = translateSefazError(data.mensagem_sefaz || data.erros?.[0]?.mensagem || data.mensagem);

    await service.from("notas_fiscais").update({
      status,
      numero: data.numero ? String(data.numero) : null,
      serie: data.serie ? String(data.serie) : null,
      chave_acesso: data.chave_nfe,
      protocolo: data.protocolo,
      caminho_xml: data.caminho_xml_nota_fiscal
        ? `https://api.focusnfe.com.br${data.caminho_xml_nota_fiscal}`
        : null,
      caminho_danfe: data.caminho_danfce
        ? `https://api.focusnfe.com.br${data.caminho_danfce}`
        : null,
      mensagem_sefaz: motivo,
      resposta_api: data,
    }).eq("id", inserted.data?.id);

    return json({
      success: status === "autorizada",
      status,
      ref,
      emission_id: inserted.data?.id,
      chave_acesso: data.chave_nfe,
      numero: data.numero,
      danfe_url: data.caminho_danfce
        ? `https://api.focusnfe.com.br${data.caminho_danfce}`
        : null,
      motivo,
    });
  } catch (e) {
    console.error("emitir-nfce error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
