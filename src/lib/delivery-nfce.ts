import { supabase } from "@/integrations/supabase/client";
import { dispatchDanfePrintJob } from "@/lib/danfe-print";
import { notasFiscais } from "@/lib/fiscal-db";

/**
 * Emite a NFC-e de um pedido de delivery concluído e pago.
 *
 * O gancho anterior mandava só nome/quantidade/preço, sem os dados fiscais do
 * produto — o que fazia todo item sair com NCM "00000000" e ser rejeitado — e
 * ignorava taxa de entrega e desconto, então o total da nota não batia com o
 * do pedido. Aqui os itens são enriquecidos a partir de `pdv_products` e os
 * valores acessórios vão nos campos certos (frete e desconto).
 */
export async function emitNFCeForDeliveryOrder(order: {
  id: string;
  user_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  payment_method?: string | null;
  delivery_fee?: number | null;
  discount?: number | null;
  total?: number | null;
  order_type?: string | null;
}): Promise<{ emitted: boolean; reason?: string }> {
  const { data: settings } = await supabase
    .from("delivery_settings" as any)
    .select("nfce_auto_emit")
    .eq("user_id", order.user_id)
    .maybeSingle();

  if (!(settings as any)?.nfce_auto_emit) {
    return { emitted: false, reason: "auto-emissão desligada" };
  }

  // Não emitir duas vezes para o mesmo pedido.
  const { data: existente } = await notasFiscais()
    .select("id")
    .eq("origem_tipo", "delivery_order")
    .eq("origem_id", order.id)
    .in("status", ["autorizada", "processando"])
    .limit(1);
  if (existente && existente.length > 0) {
    return { emitted: false, reason: "pedido já tem nota" };
  }

  const { data: items } = await supabase
    .from("delivery_order_items")
    .select("product_id, product_name, quantity, unit_price")
    .eq("order_id", order.id);

  if (!items || items.length === 0) {
    return { emitted: false, reason: "pedido sem itens" };
  }

  // Dados fiscais dos produtos (as colunas são `origin` e `tax_unit`).
  const productIds = Array.from(
    new Set(items.map((i: any) => i.product_id).filter(Boolean)),
  ) as string[];
  const productMap: Record<string, any> = {};
  if (productIds.length) {
    const { data: prods } = await supabase
      .from("pdv_products")
      .select(
        "id, ncm, cfop, cest, origin, ean, tax_unit, cst_icms, csosn, icms_rate, pis_cst, pis_rate, cofins_cst, cofins_rate",
      )
      .in("id", productIds);
    (prods || []).forEach((p: any) => { productMap[p.id] = p; });
  }

  // CPF do cadastro do cliente, quando houver — é o "CPF na nota" do delivery.
  let cpf: string | undefined;
  if (order.customer_id) {
    const { data: customer } = await supabase
      .from("delivery_customers" as any)
      .select("cpf")
      .eq("id", order.customer_id)
      .maybeSingle();
    const raw = String((customer as any)?.cpf ?? "").replace(/\D/g, "");
    if (raw.length === 11) cpf = raw;
  }

  const num = (v: any) => (v == null || v === "" ? null : Number(v));
  const deliveryFee = Number(order.delivery_fee ?? 0);
  const discount = Number(order.discount ?? 0);

  const { data, error } = await supabase.functions.invoke("focusnfe-emitir-nfce", {
    body: {
      items: items.map((i: any) => {
        const p = productMap[i.product_id] || {};
        return {
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          ncm: p.ncm,
          cfop: p.cfop,
          cest: p.cest,
          origem: p.origin,
          ean: p.ean,
          unidade: p.tax_unit,
          csosn: p.csosn,
          cst_icms: p.cst_icms,
          icms_rate: num(p.icms_rate),
          pis_cst: p.pis_cst,
          pis_rate: num(p.pis_rate),
          cofins_cst: p.cofins_cst,
          cofins_rate: num(p.cofins_rate),
        };
      }),
      valor_desconto: discount,
      // Retirada no local não tem frete, mesmo que o pedido traga o campo.
      valor_frete: order.order_type === "pickup" ? 0 : deliveryFee,
      pagamentos: [{
        forma_pagamento: order.payment_method || "dinheiro",
        valor: Number(order.total ?? 0),
      }],
      customer: {
        cpf,
        name: order.customer_name || undefined,
      },
      // Entrega a domicílio = presença 4; retirada é presencial.
      presencial: order.order_type === "pickup",
      origem_tipo: "delivery_order",
      origem_id: order.id,
    },
  });

  if (error) throw error;

  if ((data as any)?.success && (data as any)?.emission_id) {
    // O cupom do delivery também sai na impressora do caixa.
    dispatchDanfePrintJob((data as any).emission_id).catch((e) =>
      console.warn("Falha ao enfileirar impressão do DANFE (delivery):", e)
    );
    return { emitted: true };
  }

  return {
    emitted: false,
    reason: (data as any)?.motivo || (data as any)?.error || "rejeitada",
  };
}
