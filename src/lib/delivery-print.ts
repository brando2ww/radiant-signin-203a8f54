import { supabase } from "@/integrations/supabase/client";

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
  const { data: rows, error } = await (supabase as any)
    .from("vw_print_bridge_delivery_items")
    .select("*")
    .eq("order_id", orderId);

  if (error) {
    console.error("Erro ao buscar itens p/ impressão delivery:", error);
    return { jobs: 0 };
  }
  let items = (rows ?? []) as any[];
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
  return { jobs: jobs.length };
}
