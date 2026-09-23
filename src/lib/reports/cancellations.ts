// Fonte única dos cancelamentos de salão/balcão.
//
// O cancelamento mora na COMANDA (`pdv_comandas.status = 'cancelada'`), não no
// pedido: quem cancela é o `cancelComandaMutation`, que carimba `cancelled_at`,
// `cancelled_by_user_id`, o motivo e a categoria, e deixa o `pdv_orders` como
// estava (segue `fechada`). Até meados de maio de 2026 o cancelamento também
// aparecia no pedido · aquele período só sai se a gente ler as duas fontes.
//
// Ler só `pdv_orders.status = 'cancelada'`, que era o que os relatórios faziam,
// devolve ZERO para qualquer período recente: no banco inteiro são 0 pedidos
// cancelados nos últimos 120 dias contra 18 comandas canceladas.

import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/reports/fetch-all";
import { fetchItemsByOrderIds } from "@/lib/reports-data-source";

export const SEM_MOTIVO = "Sem motivo";

export interface CancelledSale {
  /** id da comanda (ou do pedido, no legado) */
  id: string;
  origin: "comanda" | "pedido";
  orderId: string | null;
  /** número da comanda, ou do pedido no legado */
  label: string;
  customerName: string;
  /** data efetiva do cancelamento (cai para a abertura quando não foi carimbada) */
  cancelledAt: string | null;
  openedAt: string | null;
  reason: string;
  category: string | null;
  /** quem cancelou */
  userId: string | null;
  value: number;
  itemCount: number;
}

export interface CancelledItem {
  saleId: string;
  label: string;
  cancelledAt: string | null;
  reason: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  subtotal: number;
}

export interface CancelledData {
  sales: CancelledSale[];
  items: CancelledItem[];
}

/**
 * Janela do período aceitando linha sem `cancelled_at`: a coluna só passou a
 * ser preenchida depois, e 2 em cada 3 cancelamentos antigos estão sem ela.
 * Sem esse "ou" elas somem do relatório.
 */
function janela(campo: string, alternativo: string, startISO: string, endISO: string): string {
  return [
    `and(${campo}.gte.${startISO},${campo}.lte.${endISO})`,
    `and(${campo}.is.null,${alternativo}.gte.${startISO},${alternativo}.lte.${endISO})`,
  ].join(",");
}

async function fetchComandaItems(comandaIds: string[]) {
  if (!comandaIds.length) return [] as any[];
  const todos: any[] = [];
  for (let i = 0; i < comandaIds.length; i += 200) {
    const lote = comandaIds.slice(i, i + 200);
    const data = await fetchAll((de, ate) => supabase
      .from("pdv_comanda_items")
      .select("comanda_id, product_id, product_name, quantity, subtotal")
      .in("comanda_id", lote)
      .order("id")
      .range(de, ate));
    todos.push(...data);
  }
  return todos;
}

export async function fetchCancelledSales(
  ownerId: string,
  startISO: string,
  endISO: string,
): Promise<CancelledData> {
  const [comandas, legadoTodo] = await Promise.all([
    fetchAll((de, ate) => supabase
      .from("pdv_comandas")
      .select(
        "id, order_id, comanda_number, customer_name, created_at, cancelled_at, cancellation_reason, cancellation_category, cancelled_by_user_id, closed_by_user_id",
      )
      .eq("user_id", ownerId)
      .eq("status", "cancelada")
      .or(janela("cancelled_at", "created_at", startISO, endISO))
      .order("id")
      .range(de, ate)),
    fetchAll((de, ate) => supabase
      .from("pdv_orders")
      .select(
        "id, order_number, customer_name, opened_at, cancelled_at, cancellation_reason, closed_by_user_id, opened_by",
      )
      .eq("user_id", ownerId)
      .eq("status", "cancelada")
      .or(janela("cancelled_at", "opened_at", startISO, endISO))
      .order("id")
      .range(de, ate)),
  ]);
  // Um pedido antigo cancelado cuja comanda também está cancelada é o MESMO
  // cancelamento nas duas tabelas. Vale a comanda, que tem motivo e autor.
  const jaContados = new Set(comandas.map((c: any) => c.order_id).filter(Boolean));
  const legado = legadoTodo.filter((o: any) => !jaContados.has(o.id));

  const [itensComanda, itensPedido] = await Promise.all([
    fetchComandaItems(comandas.map((c: any) => c.id)),
    legado.length ? fetchItemsByOrderIds(legado.map((o: any) => o.id)) : Promise.resolve([]),
  ]);

  // Nome do cliente do legado: o pedido costuma vir sem, a comanda tem.
  const nomePorPedido = new Map<string, string>();
  if (legado.length) {
    const comandasDoLegado = await fetchAll((de, ate) => supabase
      .from("pdv_comandas")
      .select("order_id, customer_name")
      .in("order_id", legado.map((o: any) => o.id))
      .order("id")
      .range(de, ate));
    (comandasDoLegado || []).forEach((c: any) => {
      const n = (c.customer_name || "").trim();
      if (!n) return;
      const atual = nomePorPedido.get(c.order_id);
      // prefere nome de gente a "Mesa 12"
      if (!atual || (/^mesa\b/i.test(atual) && !/^mesa\b/i.test(n))) nomePorPedido.set(c.order_id, n);
    });
  }

  const sales: CancelledSale[] = [];
  const items: CancelledItem[] = [];

  const empurraItens = (venda: CancelledSale, linhas: any[]) => {
    linhas.forEach((it) => {
      const quantity = Number(it.quantity || 0);
      const subtotal = Number(it.subtotal || 0);
      venda.value += subtotal;
      venda.itemCount += quantity;
      items.push({
        saleId: venda.id,
        label: venda.label,
        cancelledAt: venda.cancelledAt,
        reason: venda.reason,
        product_id: it.product_id ?? null,
        product_name: it.product_name || "—",
        quantity,
        subtotal,
      });
    });
  };

  const porComanda = new Map<string, any[]>();
  itensComanda.forEach((it: any) => {
    if (!porComanda.has(it.comanda_id)) porComanda.set(it.comanda_id, []);
    porComanda.get(it.comanda_id)!.push(it);
  });

  comandas.forEach((c: any) => {
    const venda: CancelledSale = {
      id: c.id,
      origin: "comanda",
      orderId: c.order_id ?? null,
      label: c.comanda_number || "—",
      customerName: (c.customer_name || "").trim(),
      cancelledAt: c.cancelled_at || c.created_at || null,
      openedAt: c.created_at || null,
      reason: c.cancellation_reason || SEM_MOTIVO,
      category: c.cancellation_category ?? null,
      userId: c.cancelled_by_user_id || c.closed_by_user_id || null,
      value: 0,
      itemCount: 0,
    };
    empurraItens(venda, porComanda.get(c.id) || []);
    sales.push(venda);
  });

  const porPedido = new Map<string, any[]>();
  (itensPedido as any[]).forEach((it: any) => {
    if (!it.order_id) return;
    if (!porPedido.has(it.order_id)) porPedido.set(it.order_id, []);
    porPedido.get(it.order_id)!.push(it);
  });

  legado.forEach((o: any) => {
    const venda: CancelledSale = {
      id: o.id,
      origin: "pedido",
      orderId: o.id,
      label: o.order_number != null ? `#${o.order_number}` : "—",
      customerName: (o.customer_name || "").trim() || nomePorPedido.get(o.id) || "",
      cancelledAt: o.cancelled_at || o.opened_at || null,
      openedAt: o.opened_at || null,
      reason: o.cancellation_reason || SEM_MOTIVO,
      category: null,
      userId: o.closed_by_user_id || o.opened_by || null,
      value: 0,
      itemCount: 0,
    };
    empurraItens(venda, porPedido.get(o.id) || []);
    sales.push(venda);
  });

  sales.sort((a, b) => (b.cancelledAt || "").localeCompare(a.cancelledAt || ""));
  return { sales, items };
}

// ─────────────────────────────────────────────────────────────────────────────
// Itens cancelados dentro de uma comanda que seguiu viva.
// ─────────────────────────────────────────────────────────────────────────────

export interface CancelledComandaItem {
  id: string;
  comandaId: string;
  orderId: string | null;
  comandaNumber: string | null;
  customerName: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  paidQuantity: number;
  cancelledAt: string;
  userId: string | null;
  reason: string | null;
  category: string | null;
  /** Já tinha ido para a praça quando foi cancelado. */
  foiParaCozinha: boolean;
}

/**
 * Lê `pdv_cancelled_comanda_items`, onde cada linha é um item que saiu da
 * comanda. É diferente da comanda cancelada inteira: aqui a venda aconteceu e
 * só aquele item caiu fora, que é o caso do dia a dia (cliente desistiu do
 * prato, garçom lançou errado).
 */
export async function fetchCancelledItems(
  ownerId: string,
  startISO: string,
  endISO: string,
): Promise<CancelledComandaItem[]> {
  const linhas = await fetchAll((de, ate) => supabase
    .from("pdv_cancelled_comanda_items")
    .select(
      "id, comanda_id, order_id, product_name, quantity, unit_price, subtotal, paid_quantity, sent_to_kitchen_at, cancelled_at, cancelled_by_user_id, cancellation_reason, cancellation_category",
    )
    .eq("owner_user_id", ownerId)
    .gte("cancelled_at", startISO)
    .lte("cancelled_at", endISO)
    .order("cancelled_at", { ascending: false })
    .order("id")
    .range(de, ate));
  const comandaIds = Array.from(new Set(linhas.map((l: any) => l.comanda_id).filter(Boolean)));
  const porComanda = new Map<string, { numero: string | null; cliente: string | null }>();
  if (comandaIds.length) {
    const comandas = await fetchAll((de, ate) => supabase
      .from("pdv_comandas")
      .select("id, comanda_number, customer_name")
      .in("id", comandaIds)
      .order("id")
      .range(de, ate));
    (comandas || []).forEach((c: any) =>
      porComanda.set(c.id, { numero: c.comanda_number ?? null, cliente: c.customer_name ?? null }),
    );
  }

  return linhas.map((l: any) => ({
    id: l.id,
    comandaId: l.comanda_id,
    orderId: l.order_id ?? null,
    comandaNumber: porComanda.get(l.comanda_id)?.numero ?? null,
    customerName: porComanda.get(l.comanda_id)?.cliente ?? null,
    productName: l.product_name || "—",
    quantity: Number(l.quantity || 0),
    unitPrice: Number(l.unit_price || 0),
    subtotal: Number(l.subtotal || 0),
    paidQuantity: Number(l.paid_quantity || 0),
    cancelledAt: l.cancelled_at,
    userId: l.cancelled_by_user_id ?? null,
    reason: l.cancellation_reason ?? null,
    category: l.cancellation_category ?? null,
    foiParaCozinha: !!l.sent_to_kitchen_at,
  }));
}

/** Rótulos das categorias, iguais aos da tela de cancelamento. */
export const CATEGORIA_LABEL: Record<string, string> = {
  cliente_desistiu: "Cliente desistiu",
  pedido_errado: "Pedido errado",
  problema_cozinha: "Problema na cozinha",
  demora_excessiva: "Demora excessiva",
  item_indisponivel: "Item indisponível",
  outro: "Outro",
};
