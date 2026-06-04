// focusnfe-emitir-nfe — emissão ASSÍNCRONA de NF-e modelo 55
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
  cest: z.string().optional().nullable(),
  unidade: z.string().optional().nullable(),
  ean: z.string().optional().nullable(),
  origem: z.number().int().optional().nullable(),
});

const DestinatarioSchema = z.object({
  cnpj: z.string().optional().nullable(),
  cpf: z.string().optional().nullable(),
  nome: z.string().min(2),
  email: z.string().email().optional().nullable(),
  inscricao_estadual: z.string().optional().nullable(),
  indicador_inscricao_estadual: z.number().int().min(1).max(9).default(9),
  logradouro: z.string(),
  numero: z.string(),
  complemento: z.string().optional().nullable(),
  bairro: z.string(),
  municipio: z.string(),
  uf: z.string().length(2),
  cep: z.string(),
  codigo_municipio: z.string().optional().nullable(),
});

const BodySchema = z.object({
  items: z.array(ItemSchema).min(1),
  destinatario: DestinatarioSchema,
  natureza_operacao: z.string().default("Venda"),
  forma_pagamento: z.string().default("01"),
  valor_desconto: z.number().nonnegative().default(0),
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

    const ref = buildRef(ownerId, "nfe");
    const valorTotal = body.items.reduce(
      (s, i) => s + i.quantity * i.unit_price,
      0,
    ) - body.valor_desconto;

    const destCnpj = body.destinatario.cnpj?.replace(/\D/g, "") || undefined;
    const destCpf = body.destinatario.cpf?.replace(/\D/g, "") || undefined;

    const payload: any = {
      natureza_operacao: body.natureza_operacao,
      data_emissao: new Date().toISOString(),
      data_entrada_saida: new Date().toISOString(),
      tipo_documento: 1,
      finalidade_emissao: 1,
      consumidor_final: destCnpj ? 0 : 1,
      presenca_comprador: 9,
      modalidade_frete: 9,
      local_destino: body.destinatario.uf === (config.uf || "") ? 1 : 2,
      serie: String(config.serie_nfe || 1),
      cnpj_emitente: (config.cnpj || "").replace(/\D/g, ""),
      cnpj_destinatario: destCnpj,
      cpf_destinatario: destCpf,
      nome_destinatario: body.destinatario.nome,
      email_destinatario: body.destinatario.email || undefined,
      inscricao_estadual_destinatario: body.destinatario.inscricao_estadual || undefined,
      indicador_inscricao_estadual_destinatario: body.destinatario.indicador_inscricao_estadual,
      logradouro_destinatario: body.destinatario.logradouro,
      numero_destinatario: body.destinatario.numero,
      complemento_destinatario: body.destinatario.complemento || undefined,
      bairro_destinatario: body.destinatario.bairro,
      municipio_destinatario: body.destinatario.municipio,
      uf_destinatario: body.destinatario.uf,
      cep_destinatario: body.destinatario.cep.replace(/\D/g, ""),
      pais_destinatario: "Brasil",
      codigo_pais_destinatario: "1058",
      items: body.items.map((it, idx) => ({
        numero_item: idx + 1,
        codigo_produto: `P${idx + 1}`,
        descricao: it.product_name,
        codigo_ncm: it.ncm || "00000000",
        cfop: it.cfop || (body.destinatario.uf === (config.uf || "") ? "5102" : "6102"),
        codigo_cest: it.cest || undefined,
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
        { forma_pagamento: body.forma_pagamento, valor_pagamento: valorTotal },
      ],
    };

    const service = getServiceClient();
    const inserted = await service.from("notas_fiscais").insert({
      user_id: ownerId,
      tipo: "nfe",
      ambiente,
      referencia_focusnfe: ref,
      status: "processando",
      valor_total: valorTotal,
      destinatario_nome: body.destinatario.nome,
      destinatario_documento: destCnpj || destCpf,
      destinatario_email: body.destinatario.email,
      payload_enviado: payload,
      origem_tipo: body.origem_tipo,
      origem_id: body.origem_id,
      emitida_em: new Date().toISOString(),
    }).select().single();

    const resp = await fetch(`${focusBaseUrl(ambiente)}/v2/nfe?ref=${ref}`, {
      method: "POST",
      headers: { Authorization: basicAuth(token), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));

    const status = data.status === "autorizado"
      ? "autorizada"
      : data.status === "processando_autorizacao"
      ? "processando"
      : data.status === "denegado"
      ? "denegada"
      : (resp.ok ? "processando" : "rejeitada");

    const motivo = translateSefazError(
      data.mensagem_sefaz || data.erros?.[0]?.mensagem || data.mensagem,
    );

    await service.from("notas_fiscais").update({
      status,
      numero: data.numero ? String(data.numero) : null,
      serie: data.serie ? String(data.serie) : null,
      chave_acesso: data.chave_nfe,
      protocolo: data.protocolo,
      caminho_xml: data.caminho_xml_nota_fiscal
        ? `https://api.focusnfe.com.br${data.caminho_xml_nota_fiscal}`
        : null,
      caminho_danfe: data.caminho_danfe
        ? `https://api.focusnfe.com.br${data.caminho_danfe}`
        : null,
      mensagem_sefaz: motivo,
      resposta_api: data,
    }).eq("id", inserted.data?.id);

    return json({
      success: status !== "rejeitada" && status !== "denegada",
      status,
      ref,
      emission_id: inserted.data?.id,
      motivo,
    });
  } catch (e) {
    console.error("emitir-nfe error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
