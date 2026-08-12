import { supabase } from "@/integrations/supabase/client";
import { notasFiscais } from "@/lib/fiscal-db";

/**
 * Enfileira a impressão do DANFE NFC-e na impressora do caixa.
 *
 * Segue o mesmo caminho dos pedidos de cozinha (`pdv_print_jobs` → print-bridge),
 * em vez de mandar o PDF da Focus para o `window.print()`: a impressora térmica
 * do caixa é de rede/nomeada e nem sempre é a impressora padrão do navegador —
 * e no delivery muitas vezes não há navegador aberto no caixa.
 *
 * O DANFE é montado em ESC/POS pelo próprio bridge (kind `danfe`), que precisa
 * imprimir o QR Code — obrigatório no cupom e impossível de gerar a partir do
 * layout de comanda.
 */
export async function dispatchDanfePrintJob(
  notaId: string,
  options?: { reimpressao?: boolean },
): Promise<{ jobs: number; reason?: string }> {
  const { data: nota, error } = await notasFiscais()
    .select(
      "id, user_id, numero, serie, chave_acesso, protocolo, qrcode, url_consulta, valor_total, status, destinatario_nome, destinatario_documento, emitida_em, payload_enviado",
    )
    .eq("id", notaId)
    .maybeSingle();

  if (error) throw error;
  if (!nota) return { jobs: 0, reason: "nota não encontrada" };
  if (nota.status !== "autorizada") {
    return { jobs: 0, reason: "nota não autorizada" };
  }

  // Dedup: uma nota imprime uma vez. Várias abas do PDV recebem o mesmo evento
  // e tentariam imprimir em paralelo. Reimpressão manual pula a checagem.
  if (!options?.reimpressao) {
    const { data: existing } = await supabase
      .from("pdv_print_jobs")
      .select("id")
      .eq("source_kind", "danfe")
      .eq("source_item_id", notaId)
      .limit(1);
    if (existing && existing.length > 0) return { jobs: 0, reason: "já impresso" };
  }

  // A impressora do cupom é a do centro de produção "caixa".
  const { data: centro } = await supabase
    .from("pdv_production_centers")
    .select("id, name, printer_ip, printer_port")
    .eq("user_id", nota.user_id)
    .eq("slug", "caixa")
    .eq("is_active", true)
    .maybeSingle();

  if (!centro?.printer_ip) {
    return { jobs: 0, reason: "caixa sem impressora configurada" };
  }

  const payloadEnviado = (nota.payload_enviado ?? {}) as any;
  const itens = Array.isArray(payloadEnviado.items) ? payloadEnviado.items : [];
  const formas = Array.isArray(payloadEnviado.formas_pagamento)
    ? payloadEnviado.formas_pagamento
    : [];

  const { error: insertError } = await supabase.from("pdv_print_jobs").insert({
    tenant_user_id: nota.user_id,
    source_kind: "danfe",
    // Reimpressão não pode colidir com o job original no índice de dedup.
    source_item_id: options?.reimpressao ? null : notaId,
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
      reimpressao: !!options?.reimpressao,
      destinatario_nome: nota.destinatario_nome,
      destinatario_documento: nota.destinatario_documento,
      valor_produtos: payloadEnviado.valor_produtos ?? null,
      valor_desconto: payloadEnviado.valor_desconto ?? null,
      valor_frete: payloadEnviado.valor_frete ?? null,
      valor_outras_despesas: payloadEnviado.valor_outras_despesas ?? null,
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

  if (insertError) throw insertError;
  return { jobs: 1 };
}
