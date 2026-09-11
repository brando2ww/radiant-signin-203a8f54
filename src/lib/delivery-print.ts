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
    .select("id,production_center_id,product_name,quantity,notes,unit_price,subtotal")
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
      unit_price: item.unit_price,
      subtotal: item.subtotal,
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
  // Usamos o orderId (não item IDs) como chave de dedup — isso é inequívoco
  // independente da ordem de retorno do SELECT ou de quantos centros existem.
  // Reimpressão manual passa `auto: false` (ou nada) e ignora a checagem.
  if (options?.auto) {
    const { data: existing } = await supabase
      .from("pdv_print_jobs")
      .select("id")
      .eq("source_kind", "delivery")
      .eq("source_item_id", orderId)
      .limit(1);
    if (existing && existing.length > 0) {
      return { jobs: 0 };
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
      // Usa orderId como chave de dedup — sempre o mesmo independente
      // de quantos dispositivos processam o evento ou da ordem dos itens.
      // O índice único (source_item_id, center_id) garante 1 job por centro.
      source_item_id: orderId,
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

  // Enfileira comanda caixa para centros com print_complete=true (fire-and-forget).
  //
  // Antes isto exigia `options.auto`, ou seja, só saía na impressão automática —
  // que depende de uma aba do painel viva escutando o Realtime. Na prática nunca
  // saiu: 845 pedidos de delivery no histórico e zero comanda de caixa gerada,
  // mesmo com o recurso ligado. Agora vale também na impressão manual do pedido
  // inteiro. Reimprimir só uma bancada (centerIdFilter definido) segue sem gerar
  // caixa, e o dedup por (source_kind, source_item_id) impede segunda via.
  if (centerIdFilter === undefined) {
    dispatchCaixaJobs(orderId, options?.auto === true).catch((e) =>
      console.error("Erro ao enfileirar comanda_caixa:", e)
    );
  }

  return { jobs: jobs.length };
}

/**
 * @param auto  `true` = disparo automático (Realtime), onde o dedup por pedido
 *   é essencial porque várias abas recebem o mesmo evento. `false` = o operador
 *   clicou em imprimir, e aí a comanda do caixa tem de sair SEMPRE — igual à de
 *   produção, que já escapava do dedup zerando `source_item_id`. Sem essa
 *   simetria, reimprimir um pedido soltava só o cupom da cozinha e o do caixa
 *   ficava para trás (relatado no La Vecchia em 31/07/2026).
 */
async function dispatchCaixaJobs(orderId: string, auto: boolean) {

  // As colunas sao `discount` e `change_for`. Pedir `discount_amount`/
  // `change_amount` fazia o PostgREST devolver 400, `orderRow` vinha vazio e a
  // funcao desistia calada — era por isso que a comanda de caixa nunca saiu,
  // em nenhum cliente, em centenas de pedidos.
  const { data: orderRow, error: orderError } = await (supabase as any)
    .from("delivery_orders")
    .select("id,user_id,order_number,ticket_number,customer_name,customer_phone,order_type,delivery_address_text,delivery_address_id,subtotal,delivery_fee,discount,discount_sponsor_ifood,discount_sponsor_merchant,total,payment_method,payment_status,change_for,notes,external_code,external_collection_code")
    .eq("id", orderId)
    .single();
  if (orderError) {
    console.error("comanda_caixa: falha ao carregar o pedido:", orderError);
    return;
  }
  if (!orderRow) return;

  const { data: centers } = await (supabase as any)
    .from("pdv_production_centers")
    .select("id,name,printer_ip,printer_port")
    .eq("user_id", orderRow.user_id)
    .eq("is_active", true)
    .eq("print_complete", true);
  if (!centers || centers.length === 0) return;

  // Dedup só no caminho automático (ver docstring). Na reimpressão manual
  // pulamos a checagem e zeramos `source_item_id` mais abaixo, para escapar do
  // índice único parcial pdv_print_jobs_comanda_caixa_order_center_uniq.
  if (auto) {
    const { data: existing } = await supabase
      .from("pdv_print_jobs")
      .select("id")
      .eq("source_kind", "comanda_caixa")
      .eq("source_item_id", orderId)
      .limit(1);
    if (existing && existing.length > 0) return;
  }

  // Complemento e referencia nao cabem no `delivery_address_text`, que e uma
  // linha unica. Sao justamente o que o entregador precisa para achar a casa,
  // entao vao separados no cupom.
  let complemento: string | null = null;
  let referencia: string | null = null;
  if (orderRow.delivery_address_id) {
    const { data: addr } = await (supabase as any)
      .from("delivery_addresses")
      .select("complement,reference")
      .eq("id", orderRow.delivery_address_id)
      .maybeSingle();
    complemento = addr?.complement?.trim() || null;
    referencia = addr?.reference?.trim() || null;
  }

  const allRows = await fetchOrderItems(orderId);
  const itemsPayload = allRows.map((r: any) => ({
    product_name: r.product_name,
    quantity: r.quantity,
    notes: r.notes,
    unit_price: r.unit_price,
    subtotal: r.subtotal,
    modifiers: (r.options ?? []).map((o: any) => ({
      name: o?.quantity && Number(o.quantity) > 1 ? `${o.quantity}x ${o.name}` : o?.name,
    })).filter((m: any) => m.name),
  }));

  const caixaJobs = (centers as any[]).map((center) => ({
    tenant_user_id: orderRow.user_id,
    source_kind: "comanda_caixa",
    source_item_id: auto ? orderId : null,
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
      delivery_complement: complemento,
      delivery_reference: referencia,
      subtotal: orderRow.subtotal,
      delivery_fee: orderRow.delivery_fee,
      // A bridge le `discount_amount`/`change_amount` no payload; no banco as
      // colunas tem outro nome. A traducao acontece aqui.
      discount_amount: orderRow.discount,
      // Split de quem banca o desconto (só existe em pedido de marketplace):
      // a bridge usa isso pra separar "Desconto" (loja) de "Desconto da
      // Plataforma" (iFood), em vez de mostrar só o total somado.
      discount_sponsor_ifood: orderRow.discount_sponsor_ifood,
      discount_sponsor_merchant: orderRow.discount_sponsor_merchant,
      total: orderRow.total,
      payment_method: orderRow.payment_method,
      payment_status: orderRow.payment_status,
      change_amount: orderRow.change_for,
      notes: orderRow.notes,
      // Presença de external_code é o que liga a bridge no layout de
      // marketplace (estilo Bitbar) em vez do cupom genérico de balcão.
      external_code: orderRow.external_code,
      external_collection_code: orderRow.external_collection_code,
      items: itemsPayload,
    },
  }));

  const { error } = await supabase.from("pdv_print_jobs").insert(caixaJobs as any);
  if (error && (error as any).code !== "23505") {
    console.error("Erro ao enfileirar comanda_caixa:", error);
  }
}
