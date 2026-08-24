import { supabase } from "@/integrations/supabase/client";
import { fetchItemsByOrderIds, fetchDeliveryItemsByPeriod } from "@/lib/reports-data-source";
import { buildDeliveryProductBridge } from "@/lib/reports/delivery-product-bridge";

/**
 * Consumo de insumo no período, deduzido de venda × ficha técnica.
 *
 * POR QUE NÃO SAI DE `pdv_stock_movements`: em produção essa tabela tem 277
 * entradas e **3** saídas por venda em todo o histórico. A baixa automática de
 * estoque depende de configuração por insumo e praticamente não roda, então um
 * relatório de giro apoiado nela aparece vazio e passa a impressão de que nada
 * é consumido.
 *
 * A ficha técnica funciona hoje, sem depender de ninguém configurar nada — é a
 * mesma dedução que o CMV já faz em `use-pdv-cmv.ts`.
 */

export interface ConsumoPorInsumo {
  /** ingredient_id → quantidade consumida no período. */
  quantidade: Map<string, number>;
  /** ingredient_id → custo do que foi consumido. */
  valor: Map<string, number>;
  /** Produtos vendidos que não têm ficha técnica — consumo invisível. */
  produtosSemFicha: number;
  /** Receita desses produtos, para dimensionar o buraco. */
  receitaSemFicha: number;
}

interface LinhaReceita {
  product_id: string;
  quantity: number;
  ingredient_id: string;
  unit_cost: number;
}

export async function fetchConsumoPorFichaTecnica(
  ownerUserId: string,
  startISO: string,
  endISO: string,
): Promise<ConsumoPorInsumo> {
  const [{ data: catalogo }, { data: recipes }, { data: comps }] = await Promise.all([
    supabase.from("pdv_products").select("id, name").eq("user_id", ownerUserId),
    supabase
      .from("pdv_product_recipes")
      .select("product_id, quantity, pdv_ingredients(id, unit_cost)"),
    supabase.from("pdv_product_compositions").select("parent_product_id, child_product_id, quantity"),
  ]);

  const receitaPorProduto = new Map<string, LinhaReceita[]>();
  (recipes ?? []).forEach((r: any) => {
    const ing = r.pdv_ingredients;
    if (!ing?.id) return;
    const lista = receitaPorProduto.get(r.product_id) ?? [];
    lista.push({
      product_id: r.product_id,
      quantity: Number(r.quantity) || 0,
      ingredient_id: ing.id,
      unit_cost: Number(ing.unit_cost) || 0,
    });
    receitaPorProduto.set(r.product_id, lista);
  });

  const composicao = new Map<string, Array<{ child: string; qty: number }>>();
  (comps ?? []).forEach((c: any) => {
    const lista = composicao.get(c.parent_product_id) ?? [];
    lista.push({ child: c.child_product_id, qty: Number(c.quantity) || 0 });
    composicao.set(c.parent_product_id, lista);
  });

  // Itens vendidos nos dois canais, no mesmo período.
  const { data: orders } = await supabase
    .from("pdv_orders")
    .select("id")
    .eq("user_id", ownerUserId)
    .in("status", ["fechada", "fechado"])
    .gte("opened_at", startISO)
    .lte("opened_at", endISO);

  const ponte = await buildDeliveryProductBridge(ownerUserId, (catalogo || []) as any);
  const [pdvItems, delItems] = await Promise.all([
    fetchItemsByOrderIds((orders ?? []).map((o) => o.id)),
    fetchDeliveryItemsByPeriod(ownerUserId, startISO, endISO),
  ]);

  const vendidos = new Map<string, { qty: number; receita: number }>();
  const somar = (pid: string | null, qty: number, receita: number) => {
    if (!pid) return;
    const a = vendidos.get(pid) ?? { qty: 0, receita: 0 };
    a.qty += qty;
    a.receita += receita;
    vendidos.set(pid, a);
  };
  pdvItems.forEach((it: any) =>
    somar(it.product_id, Number(it.quantity) || 0, Number(it.subtotal) || 0),
  );
  delItems.forEach((it) =>
    somar(
      ponte.resolve(it.product_id, it.product_name),
      Number(it.quantity) || 0,
      Number(it.subtotal) || 0,
    ),
  );

  const quantidade = new Map<string, number>();
  const valor = new Map<string, number>();
  let produtosSemFicha = 0;
  let receitaSemFicha = 0;

  /** Explode o produto na sua ficha, descendo por kits. `visitados` corta ciclo. */
  const explodir = (pid: string, fator: number, visitados: Set<string>): boolean => {
    if (visitados.has(pid)) return false;
    visitados.add(pid);

    let achou = false;
    (receitaPorProduto.get(pid) ?? []).forEach((linha) => {
      const qtd = linha.quantity * fator;
      quantidade.set(linha.ingredient_id, (quantidade.get(linha.ingredient_id) ?? 0) + qtd);
      valor.set(linha.ingredient_id, (valor.get(linha.ingredient_id) ?? 0) + qtd * linha.unit_cost);
      achou = true;
    });

    (composicao.get(pid) ?? []).forEach((filho) => {
      if (explodir(filho.child, fator * filho.qty, new Set(visitados))) achou = true;
    });

    return achou;
  };

  vendidos.forEach((v, pid) => {
    const temFicha = explodir(pid, v.qty, new Set());
    if (!temFicha) {
      produtosSemFicha += 1;
      receitaSemFicha += v.receita;
    }
  });

  return { quantidade, valor, produtosSemFicha, receitaSemFicha };
}
