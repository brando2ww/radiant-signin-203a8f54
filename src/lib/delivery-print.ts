import { supabase } from "@/integrations/supabase/client";

/**
 * Busca itens de um pedido de delivery diretamente das tabelas base,
 * sem depender da view vw_print_bridge_delivery_items.
 * Retorna dados no mesmo shape que a view produzia.
 */
async function fetchOrderItems(orderId: string): Promise<any[]> {
  const { data: order } = await (supabase as any)
    .from("delivery_orders")
    .select("order_number,ticket_number,customer_name,customer_phone,order_type,delivery_address_text,user_id")
    .eq("id", orderId)
    .single();
  if (!order) return [];

  const { data: items } = await (supabase as any)
    .from("delivery_order_items")
    .select("id,production_center_id,product_name,quantity,notes")
    .eq("order_id", orderId);
  if (!items || items.length === 0) return [];

  // Batch: centros de produção
  const centerIds = [...new Set((items as any[]).map((i) => i.production_center_id).filter(Boolean))] as string[];
  const centersMap = new Map<string, any>();
  if (centerIds.length > 0) {
    const { data: centers } = await (supabase as any)
      .from("pdv_production_centers")
      .select("id,name,printer_ip,printer_port")
      .in("id", centerIds);
    (centers ?? []).forEach((c: any) => centersMap.set(c.id, c));
  }

  // Batch: opções de itens
  const itemIds = (items as any[]).map((i) => i.id);
  const optionsMap = new Map<string, any[]>();
  const { data: options } = await (supabase as any)
    .from("delivery_order_item_options")
    .select("order_item_id,item_name,option_name,quantity")
    .in("order_item_id", itemIds);
  (options ?? []).forEach((o: any) => {
    const arr = optionsMap.get(o.order_item_id) || [];
    arr.push(o);
    optionsMap.set(o.order_item_id, arr);
  });

  return (items as any[]).map((item) => {
    const center = item.production_center_id ? centersMap.get(item.production_center_id) : null;
    const opts = (optionsMap.get(item.id) ?? []).map((o: any) => ({
      name: o.item_name,
      option_name: o.option_name,
      quantity: o.quantity,
    }));
    return {
      id: item.id,
      order_id: orderId,
      production_center_id: item.production_center_id ?? null,
      product_name: item.product_name,
      quantity: item.quantity,
      notes: item.notes,
      center_name: center?.name ?? null,
      printer_ip: center?.printer_ip ?? null,
      printer_port: center?.printer_port ?? null,
      order_number: order.order_number,
      ticket_number: order.ticket_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      order_type: order.order_type,
      delivery_address_text: order.delivery_address_text,
      tenant_user_id: order.user_id,
      options: opts,
    };
  });
}

/**
 * Enfileira jobs de impressão para um pedido de delivery, agrupando
 * itens por centro de produção (cozinha, bar, etc.) — mesma fila e
 * formato usados pelo salão (`pdv_print_jobs`).
 *
 * Pode ser chamado múltiplas vezes (cada chamada gera novos jobs),
 * o que viabiliza o fluxo de reimpressão.
 */
export async function dispatchDeliveryPrintJobs(
  orderId: string,
  centerIdFilter?: string | null,
  options?: { auto?: boolean },
): Promise<{ jobs: number }> {
  const rows = await fetchOrderItems(orderId);
  if (rows.length === 0) return { jobs: 0 };

  let items = rows;
  if (centerIdFilter !== undefined) {
    items = items.filter((r) => r.production_center_id === centerIdFilter);
  }
  if (items.length === 0) return { jobs: 0 };

  // Dedup automático: várias abas/sessões do PDV podem receber o mesmo
  // evento realtime de INSERT e tentar imprimir o mesmo pedido em paralelo.
  // Antes de enfileirar, verificamos se já existe algum job em
  // `pdv_print_jobs` para os itens deste pedido — se sim, abortamos.
  // Reimpressão manual passa `auto: false` (ou nada) e ignora a checagem.
  if (options?.auto) {
    const itemIds = items.map((r: any) => r.id).filter(Boolean);
    if (itemIds.length > 0) {
      const { data: existing } = await supabase
        .from("pdv_print_jobs")
        .select("id")
        .eq("source_kind", "delivery")
        .in("source_item_id", itemIds)
        .limit(1);
      if (existing && existing.length > 0) {
        return { jobs: 0 };
      }
    }
  }

  // Agrupa por (centro + impressora)
  const groups = new Map<string, any[]>();
  items.forEach((r) => {
    const key = `${r.production_center_id ?? "nocenter"}::${r.printer_ip ?? "noip"}::${r.printer_port ?? 9100}`;
    const arr = groups.get(key) || [];
    arr.push(r);
    groups.set(key, arr);
  });

  const jobs = Array.from(groups.values()).map((groupItems) => {
    const first = groupItems[0];
    const hasPrinter = !!first.printer_ip;
    const shortNumber = first.ticket_number != null
      ? String(first.ticket_number).padStart(3, "0")
      : String(first.order_number ?? "").replace(/^#+/, "");
    return {
      tenant_user_id: first.tenant_user_id,
      source_kind: "delivery" as const,
      source_item_id: first.id,
      center_id: first.production_center_id,
      center_name: first.center_name,
      printer_ip: first.printer_ip,
      printer_port: first.printer_port || 9100,
      payload: {
        kind: "delivery",
        mesa_numero: "DELIVERY",
        comanda_nome: first.customer_name || "Cliente",
        comanda_number: shortNumber,
        ticket_number: first.ticket_number ?? null,
        order_number: shortNumber,
        customer_name: first.customer_name,
        customer_phone: first.customer_phone,
        order_type: first.order_type,
        delivery_address: first.delivery_address_text,
        items: groupItems.map((r: any) => ({
          product_name: r.product_name,
          quantity: r.quantity,
          notes: r.notes,
          modifiers: Array.isArray(r.options)
            ? r.options.map((o: any) => ({
                name: o?.quantity && Number(o.quantity) > 1
                  ? `${o.quantity}x ${o.name}`
                  : o?.name,
              })).filter((m: any) => m.name)
            : [],
        })),
      },
      status: hasPrinter ? "pending" : "failed",
      error_message: hasPrinter ? null : "sem impressora configurada",
    };
  });

  // Para reimpressões manuais, zera source_item_id para escapar do índice
  // único parcial (pdv_print_jobs_delivery_item_center_uniq) que garante
  // um único job automático por (item, centro). Sem isso, a 2ª reimpressão
  // colidiria com a 1ª.
  if (!options?.auto) {
    jobs.forEach((j: any) => {
      j.source_item_id = null;
    });
  }

  const { error: insertError } = await supabase
    .from("pdv_print_jobs")
    .insert(jobs as any);
  if (insertError) {
    // 23505 = unique_violation. Significa que outro cliente Realtime
    // (outra aba/operador) já enfileirou este job — dedup atômico do banco
    // venceu a corrida. Tratamos como sucesso silencioso.
    if ((insertError as any).code === "23505") {
      return { jobs: 0 };
    }
    console.error("Erro ao enfileirar prints de delivery:", insertError);
    return { jobs: 0 };
  }

  // Enfileira comanda caixa para centros com print_complete=true (fire-and-forget)
  dispatchCaixaJobs(orderId, options).catch((e) =>
    console.error("Erro ao enfileirar comanda_caixa:", e)
  );

  return { jobs: jobs.length };
}

async function dispatchCaixaJobs(orderId: string, options?: { auto?: boolean }) {
  if (!options?.auto) return;

  const { data: orderRow } = await (supabase as any)
    .from("delivery_orders")
    .select("id,user_id,order_number,ticket_number,customer_name,customer_phone,order_type,delivery_address_text,subtotal,delivery_fee,discount_amount,total,payment_method,payment_status,change_amount,notes")
    .eq("id", orderId)
    .single();
  if (!orderRow) return;

  const { data: centers } = await (supabase as any)
    .from("pdv_production_centers")
    .select("id,name,printer_ip,printer_port")
    .eq("user_id", orderRow.user_id)
    .eq("is_active", true)
    .eq("print_complete", true);
  if (!centers || centers.length === 0) return;

  // Dedup: abortar se já existe job comanda_caixa p/ este pedido
  const { data: existing } = await supabase
    .from("pdv_print_jobs")
    .select("id")
    .eq("source_kind", "comanda_caixa")
    .eq("source_item_id", orderId)
    .limit(1);
  if (existing && existing.length > 0) return;

  const allRows = await fetchOrderItems(orderId);
  const itemsPayload = allRows.map((r: any) => ({
    product_name: r.product_name,
    quantity: r.quantity,
    notes: r.notes,
    modifiers: (r.options ?? []).map((o: any) => ({
      name: o?.quantity && Number(o.quantity) > 1 ? `${o.quantity}x ${o.name}` : o?.name,
    })).filter((m: any) => m.name),
  }));

  const caixaJobs = (centers as any[]).map((center) => ({
    tenant_user_id: orderRow.user_id,
    source_kind: "comanda_caixa",
    source_item_id: orderId,
    center_id: center.id,
    center_name: center.name,
    printer_ip: center.printer_ip,
    printer_port: center.printer_port || 9100,
    status: center.printer_ip ? "pending" : "failed",
    error_message: center.printer_ip ? null : "sem impressora configurada",
    payload: {
      kind: "comanda_caixa",
      order_number: orderRow.order_number,
      ticket_number: orderRow.ticket_number,
      customer_name: orderRow.customer_name,
      customer_phone: orderRow.customer_phone,
      order_type: orderRow.order_type,
      delivery_address: orderRow.delivery_address_text,
      subtotal: orderRow.subtotal,
      delivery_fee: orderRow.delivery_fee,
      discount_amount: orderRow.discount_amount,
      total: orderRow.total,
      payment_method: orderRow.payment_method,
      payment_status: orderRow.payment_status,
      change_amount: orderRow.change_amount,
      notes: orderRow.notes,
      items: itemsPayload,
    },
  }));

  const { error } = await supabase.from("pdv_print_jobs").insert(caixaJobs as any);
  if (error && (error as any).code !== "23505") {
    console.error("Erro ao enfileirar comanda_caixa:", error);
  }
}
