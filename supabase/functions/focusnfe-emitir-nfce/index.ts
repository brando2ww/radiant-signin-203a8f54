// focusnfe-emitir-nfce — emissão SÍNCRONA de NFC-e (cupom fiscal)
//
// A montagem do payload vive em _shared/nfce-payload.ts (testável); aqui fica
// só a orquestração: autenticar, resolver a config fiscal do tenant, validar,
// gravar, chamar a Focus e registrar o retorno.
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
import {
  buildNFCePayload,
  mapFormaPagamento,
  type PagamentoInput,
  validarItens,
} from "../_shared/nfce-payload.ts";

const ItemSchema = z.object({
  product_id: z.string().optional().nullable(),
  product_name: z.string(),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  ncm: z.string().optional().nullable(),
  cfop: z.string().optional().nullable(),
  cest: z.string().optional().nullable(),
  unidade: z.string().optional().nullable(),
  ean: z.string().optional().nullable(),
  origem: z.union([z.string(), z.number()]).optional().nullable(),
  csosn: z.string().optional().nullable(),
  cst_icms: z.string().optional().nullable(),
  icms_rate: z.number().optional().nullable(),
  pis_cst: z.string().optional().nullable(),
  pis_rate: z.number().optional().nullable(),
  cofins_cst: z.string().optional().nullable(),
  cofins_rate: z.number().optional().nullable(),
});

const PagamentoSchema = z.object({
  forma_pagamento: z.string(),
  valor: z.number().nonnegative(),
  bandeira: z.string().optional().nullable(),
  parcelas: z.number().int().optional().nullable(),
});

const BodySchema = z.object({
  /** Reemissão: id de uma nota anterior. Os itens são reconstruídos a partir dela. */
  reemitir_de: z.string().uuid().optional(),
  items: z.array(ItemSchema).min(1).optional(),
  valor_desconto: z.number().nonnegative().default(0),
  valor_frete: z.number().nonnegative().default(0),
  valor_servico: z.number().nonnegative().default(0),
  /** Formato novo: lista de pagamentos (suporta pagamento misto). */
  pagamentos: z.array(PagamentoSchema).optional(),
  /** Formato antigo, mantido para não quebrar chamadas em voo. */
  forma_pagamento: z.string().optional(),
  valor_pago: z.number().nonnegative().optional(),
  parcelas: z.number().int().optional().nullable(),
  customer: z
    .object({
      cpf: z.string().optional().nullable(),
      name: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  presencial: z.boolean().optional(),
  origem_tipo: z.string().optional(),
  origem_id: z.string().optional(),
  informacoes_adicionais: z.string().optional().nullable(),
});

type BodyInput = z.infer<typeof BodySchema>;

/**
 * Reconstrói o corpo da emissão a partir de uma nota anterior.
 *
 * Os itens vêm do payload que foi enviado da primeira vez, mas os dados
 * fiscais (NCM, CFOP, CST) são relidos do cadastro atual do produto — a
 * rejeição típica é "produto sem NCM", e o operador corrige o cadastro antes
 * de reemitir. Reenviar o payload idêntico só repetiria a rejeição.
 */
async function rebuildFromNota(
  notaId: string,
  ownerId: string,
): Promise<{ body: Partial<BodyInput> } | { error: string }> {
  const service = getServiceClient();
  const { data: nota } = await service
    .from("notas_fiscais")
    .select("*")
    .eq("id", notaId)
    .eq("user_id", ownerId)
    .maybeSingle();

  if (!nota) return { error: "Nota original não encontrada." };
  if (nota.status === "autorizada") {
    return { error: "Esta nota já está autorizada — cancele antes de reemitir." };
  }

  const payload = (nota.payload_enviado ?? {}) as Record<string, any>;
  const itensAntigos: any[] = Array.isArray(payload.items) ? payload.items : [];
  if (itensAntigos.length === 0) {
    return { error: "A nota original não tem itens para reaproveitar." };
  }

  // Relê o cadastro dos produtos que ainda existem.
  const ids = itensAntigos
    .map((i) => String(i.codigo_produto ?? ""))
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id));

  const frescos: Record<string, any> = {};
  if (ids.length > 0) {
    const { data: prods } = await service
      .from("pdv_products")
      .select(
        "id, ncm, cfop, cest, origin, ean, tax_unit, cst_icms, csosn, icms_rate, pis_cst, pis_rate, cofins_cst, cofins_rate",
      )
      .in("id", ids);
    (prods ?? []).forEach((p: any) => { frescos[p.id] = p; });
  }

  const items = itensAntigos.map((i) => {
    const p = frescos[String(i.codigo_produto ?? "")] ?? {};
    return {
      product_id: /^[0-9a-f-]{36}$/i.test(String(i.codigo_produto ?? ""))
        ? String(i.codigo_produto)
        : null,
      product_name: i.descricao ?? "Item",
      quantity: Number(i.quantidade_comercial ?? 0),
      unit_price: Number(i.valor_unitario_comercial ?? 0),
      ncm: p.ncm ?? i.codigo_ncm ?? null,
      cfop: p.cfop ?? i.cfop ?? null,
      cest: p.cest ?? i.cest ?? null,
      unidade: p.tax_unit ?? i.unidade_comercial ?? null,
      ean: p.ean ?? i.codigo_ean ?? null,
      origem: p.origin ?? i.origem ?? null,
      csosn: p.csosn ?? null,
      cst_icms: p.cst_icms ?? null,
      icms_rate: p.icms_rate != null ? Number(p.icms_rate) : null,
      pis_cst: p.pis_cst ?? null,
      pis_rate: p.pis_rate != null ? Number(p.pis_rate) : null,
      cofins_cst: p.cofins_cst ?? null,
      cofins_rate: p.cofins_rate != null ? Number(p.cofins_rate) : null,
    };
  });

  const formas: any[] = Array.isArray(payload.formas_pagamento) ? payload.formas_pagamento : [];

  return {
    body: {
      items,
      valor_desconto: Number(payload.valor_desconto ?? 0),
      valor_frete: Number(payload.valor_frete ?? 0),
      valor_servico: Number(payload.valor_outras_despesas ?? 0),
      pagamentos: formas.map((f) => ({
        forma_pagamento: String(f.forma_pagamento ?? "01"),
        valor: Number(f.valor_pagamento ?? 0),
        parcelas: f.numero_parcelas ?? null,
      })),
      customer: {
        cpf: nota.destinatario_documento,
        name: nota.destinatario_nome,
        email: nota.destinatario_email,
      },
      presencial: payload.presenca_comprador !== 4,
      origem_tipo: nota.origem_tipo ?? undefined,
      origem_id: nota.origem_id ?? undefined,
    },
  };
}

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
    let body = parsed.data;

    if (body.reemitir_de) {
      const rebuilt = await rebuildFromNota(body.reemitir_de, ownerId);
      if ("error" in rebuilt) return json({ error: rebuilt.error }, 400);
      body = { ...body, ...rebuilt.body };
    }

    if (!body.items?.length) {
      return json({ error: "Nenhum item informado para emissão." }, 400);
    }
    const items = body.items;

    const tk = await getTenantToken(ownerId);
    if ("error" in tk) return json({ error: tk.error }, 400);
    const { token, ambiente, config } = tk;

    if (!config.habilita_nfce) {
      return json({ error: "Emissão de NFC-e não está habilitada para este estabelecimento." }, 400);
    }

    const service = getServiceClient();

    // Defaults tributários do estabelecimento — usados quando o produto não
    // tem o dado preenchido no cadastro.
    const COLUNAS_FISCAIS =
      "nfe_cst_csosn, nfe_cfop_padrao, nfe_aliquota_icms, nfe_aliquota_pis, nfe_aliquota_cofins";

    // `nfe_incluir_taxa_servico` é coluna nova. Se o banco ainda não recebeu a
    // migration, pedir por ela derruba o SELECT inteiro e a nota sairia com os
    // impostos no default do código em vez dos do estabelecimento — errado e
    // silencioso. Melhor cair para o conjunto antigo de colunas.
    let { data: settings } = await service
      .from("pdv_settings")
      .select(`${COLUNAS_FISCAIS}, nfe_incluir_taxa_servico`)
      .eq("user_id", ownerId)
      .maybeSingle();

    if (!settings) {
      const fallback = await service
        .from("pdv_settings")
        .select(COLUNAS_FISCAIS)
        .eq("user_id", ownerId)
        .maybeSingle();
      settings = fallback.data;
    }

    const defaults = {
      regime_tributario: config.regime_tributario ?? 1,
      cst_csosn: settings?.nfe_cst_csosn ?? null,
      cfop: settings?.nfe_cfop_padrao ?? null,
      icms_rate: Number(settings?.nfe_aliquota_icms ?? 0),
      pis_rate: Number(settings?.nfe_aliquota_pis ?? 0),
      cofins_rate: Number(settings?.nfe_aliquota_cofins ?? 0),
    };

    // Pré-validação: barra aqui o que a SEFAZ recusaria, sem gastar numeração.
    const issues = validarItens(items, defaults);
    if (issues.length > 0) {
      return json({
        success: false,
        status: "nao_emitida",
        error: "Há produtos sem dados fiscais completos.",
        missing: issues.map((i) => `${i.product_name}: ${i.motivo}`),
      });
    }

    // A taxa de serviço (gorjeta) só entra na nota se a contabilidade do
    // cliente tiver optado por isso.
    // Ausente no fallback (banco sem a migration) => desligado, que é o default.
    const incluiServico = !!(settings as Record<string, unknown> | null)
      ?.nfe_incluir_taxa_servico;
    const outrasDespesas = incluiServico ? body.valor_servico : 0;

    // Pagamentos: formato novo, ou conversão do formato antigo.
    const pagamentos: PagamentoInput[] = body.pagamentos?.length
      ? body.pagamentos.map((p) => ({
        forma_pagamento: /^\d{2}$/.test(p.forma_pagamento)
          ? p.forma_pagamento
          : mapFormaPagamento(p.forma_pagamento),
        valor: p.valor,
        bandeira: p.bandeira ?? null,
        parcelas: p.parcelas ?? null,
      }))
      : [{
        forma_pagamento: /^\d{2}$/.test(body.forma_pagamento ?? "")
          ? body.forma_pagamento!
          : mapFormaPagamento(body.forma_pagamento),
        valor: body.valor_pago ?? 0,
        parcelas: body.parcelas ?? null,
      }];

    const { payload, totais } = buildNFCePayload({
      items,
      valor_desconto: body.valor_desconto,
      valor_frete: body.valor_frete,
      valor_outras_despesas: outrasDespesas,
      pagamentos,
      customer: {
        cpf: body.customer?.cpf ?? null,
        nome: body.customer?.name ?? null,
        email: body.customer?.email ?? null,
      },
      cnpj_emitente: config.cnpj || "",
      serie: config.serie_nfce || 1,
      defaults,
      presencial: body.presencial ?? true,
      informacoes_adicionais: body.informacoes_adicionais ?? null,
    });

    const ref = buildRef(ownerId, "nfce");

    const inserted = await service.from("notas_fiscais").insert({
      user_id: ownerId,
      tipo: "nfce",
      ambiente,
      referencia_focusnfe: ref,
      status: "processando",
      valor_total: totais.valor_total,
      destinatario_nome: body.customer?.name ?? null,
      destinatario_documento: body.customer?.cpf ?? null,
      destinatario_email: body.customer?.email ?? null,
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

    const motivo = translateSefazError(
      data.mensagem_sefaz || data.erros?.[0]?.mensagem || data.mensagem,
    );

    // A Focus devolve o QR Code em `qrcode_url`. Os outros nomes ficam como
    // rede de segurança. Sem esse campo o DANFE sai sem QR — e o DANFE da
    // NFC-e é obrigado por lei a trazê-lo.
    const qrcode = data.qrcode_url ?? data.qrcode ?? data.qr_code ?? null;
    const urlConsulta = data.url_consulta_nf ?? data.url_consulta_nfce ?? null;

    const updateBase = {
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
    };

    // Nesse ponto a nota JÁ pode estar autorizada na SEFAZ. Se o UPDATE falhar,
    // fica um documento fiscal válido sem registro local — o pior resultado
    // possível. As colunas `qrcode`/`url_consulta` são novas, então se o banco
    // ainda não tiver recebido a migration, regravamos sem elas em vez de
    // perder a nota inteira. (`resposta_api` guarda o QR Code de qualquer jeito.)
    const { error: updErr } = await service
      .from("notas_fiscais")
      .update({ ...updateBase, qrcode, url_consulta: urlConsulta })
      .eq("id", inserted.data?.id);

    if (updErr) {
      console.error("update com qrcode falhou, regravando sem:", updErr.message);
      const { error: retryErr } = await service
        .from("notas_fiscais")
        .update(updateBase)
        .eq("id", inserted.data?.id);
      if (retryErr) {
        console.error("FALHA CRITICA ao gravar nota", ref, retryErr.message, data);
      }
    }

    return json({
      success: status === "autorizada",
      status,
      ref,
      emission_id: inserted.data?.id,
      chave_acesso: data.chave_nfe,
      numero: data.numero,
      serie: data.serie,
      qrcode,
      url_consulta: urlConsulta,
      valor_total: totais.valor_total,
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
