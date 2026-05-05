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
        // Cabeçalho: "DELIVERY" entra no lugar do número da mesa
        mesa_numero: "DELIVERY",
        comanda_nome: first.customer_name || "Cliente",
        comanda_number: first.order_number,
        order_number: first.order_number,
        customer_name: first.customer_name,
        customer_phone: first.customer_phone,
        order_type: first.order_type,
        delivery_address: first.delivery_address_text,
        items: groupItems.map((r: any) => ({
          product_name: r.product_name,
          quantity: r.quantity,
          notes: r.notes,
        })),
      },
      status: hasPrinter ? "pending" : "failed",
      error_message: hasPrinter ? null : "sem impressora configurada",
    };
  });

  const { error: insertError } = await supabase
    .from("pdv_print_jobs")
    .insert(jobs as any);
  if (insertError) {
    console.error("Erro ao enfileirar prints de delivery:", insertError);
    return { jobs: 0 };
  }
  return { jobs: jobs.length };
}
