import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { brtRange } from "@/lib/reports-data-source";
import { buildDeliveryProductBridge } from "@/lib/reports/delivery-product-bridge";

/**
 * Cobertura de ficha técnica.
 *
 * Sem ficha, o produto não baixa estoque, não tem CMV e aparece no relatório
 * com margem de 100% — três mentiras pelo preço de uma. Mas montar ficha é
 * trabalho manual e ninguém encara 44 produtos de uma vez.
 *
 * Por isso a medida aqui é COBERTURA DE RECEITA, não contagem de produtos:
 * cobrir os 10 mais vendidos costuma cobrir a maior parte da saída, e é isso
 * que decide por onde começar. A lista sai ordenada por dinheiro, do maior para
 * o menor, e a linha carrega quanto daquele faturamento está descoberto.
 */

const DELIVERED = ["entregue", "delivered", "completed"];

export interface ProdutoSemFicha {
  productId: string;
  name: string;
  quantidade: number;
  receita: number;
  /** Fatia da receita do período que este produto representa. */
  participacao: number;
}

export interface AdicionalSemFicha {
  nome: string;
  vezes: number;
  receita: number;
  /** Quantos cadastros diferentes têm esse mesmo nome no cardápio. */
  cadastros: number;
}

export interface RecipeCoverage {
  produtosSemFicha: ProdutoSemFicha[];
  adicionaisSemFicha: AdicionalSemFicha[];
  receitaTotal: number;
  receitaComFicha: number;
  /** 0 a 1. É o número que importa. */
  cobertura: number;
  totalProdutosVendidos: number;
  produtosComFicha: number;
}

export function useRecipeCoverage(from: Date, to: Date) {
  const { visibleUserId } = useEstablishmentId();
  const { startISO, endISO } = brtRange(from, to);

  return useQuery({
    queryKey: ["recipe-coverage", visibleUserId, startISO, endISO],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<RecipeCoverage> => {
      const owner = visibleUserId!;

      const [{ data: produtos }, { data: fichas }, { data: pdvItems }, { data: delItems }] =
        await Promise.all([
          supabase.from("pdv_products").select("id, name").eq("user_id", owner),
          supabase.from("pdv_product_recipes").select("product_id"),
          supabase
            .from("pdv_comanda_items")
            .select(
              "product_id, product_name, quantity, subtotal, comanda:pdv_comandas!inner(created_at, order:pdv_orders!inner(user_id, status))",
            )
            .eq("comanda.order.user_id", owner)
            .in("comanda.order.status", ["fechada", "fechado"])
            .gte("comanda.created_at", startISO)
            .lte("comanda.created_at", endISO),
          supabase
            .from("delivery_order_items")
            .select(
              "product_id, product_name, quantity, subtotal, delivery_order_item_options(item_name, option_item_id, quantity, price_adjustment), order:delivery_orders!inner(user_id, status, delivered_at)",
            )
            .eq("order.user_id", owner)
            .in("order.status", DELIVERED)
            .gte("order.delivered_at", startISO)
            .lte("order.delivered_at", endISO),
        ]);

      const lista = (produtos ?? []) as { id: string; name: string }[];
      const comFicha = new Set(
        ((fichas ?? []) as { product_id: string }[]).map((r) => r.product_id),
      );
      const nomePorId = new Map(lista.map((p) => [p.id, p.name]));

      // O delivery tem catálogo próprio; sem a ponte, todo produto vendido lá
      // apareceria como "sem ficha" mesmo tendo ficha no PDV.
      const ponte = await buildDeliveryProductBridge(owner, lista);

      const agg = new Map<string, { name: string; qtd: number; receita: number }>();
      const somar = (id: string | null, nome: string, qtd: number, receita: number) => {
        if (!id) return;
        const cur = agg.get(id) ?? { name: nomePorId.get(id) ?? nome, qtd: 0, receita: 0 };
        cur.qtd += qtd;
        cur.receita += receita;
        agg.set(id, cur);
      };

      (pdvItems ?? []).forEach((it: any) =>
        somar(it.product_id, it.product_name, Number(it.quantity || 0), Number(it.subtotal || 0)),
      );
      (delItems ?? []).forEach((it: any) =>
        somar(
          ponte.resolve(it.product_id, it.product_name),
          it.product_name,
          Number(it.quantity || 0),
          Number(it.subtotal || 0),
        ),
      );

      let receitaTotal = 0;
      let receitaComFicha = 0;
      const semFicha: ProdutoSemFicha[] = [];

      agg.forEach((v, id) => {
        receitaTotal += v.receita;
        if (comFicha.has(id)) {
          receitaComFicha += v.receita;
          return;
        }
        semFicha.push({ productId: id, name: v.name, quantidade: v.qtd, receita: v.receita, participacao: 0 });
      });

      semFicha.forEach((p) => {
        p.participacao = receitaTotal > 0 ? p.receita / receitaTotal : 0;
      });
      semFicha.sort((a, b) => b.receita - a.receita || b.quantidade - a.quantidade);

      // ---- adicionais ----
      // O mesmo adicional costuma estar cadastrado em vários grupos do cardápio,
      // cada um com id próprio. Aqui eles são agrupados pelo NOME, que é como o
      // lojista pensa neles: "cream cheese" é um só, ainda que apareça em dez
      // combos. `cadastros` conta quantos ids diferentes existem por trás.
      const usados = new Set<string>();
      const porNome = new Map<string, { vezes: number; receita: number; ids: Set<string> }>();

      (delItems ?? []).forEach((it: any) => {
        const qtdItem = Number(it.quantity || 0) || 1;
        (Array.isArray(it.delivery_order_item_options) ? it.delivery_order_item_options : [])
          .forEach((o: any) => {
            const nome = String(o?.item_name ?? "").trim();
            if (!nome) return;
            const vezes = (Number(o.quantity) || 1) * qtdItem;
            const cur = porNome.get(nome) ?? { vezes: 0, receita: 0, ids: new Set<string>() };
            cur.vezes += vezes;
            cur.receita += Number(o.price_adjustment || 0) * vezes;
            if (o.option_item_id) {
              cur.ids.add(o.option_item_id);
              usados.add(o.option_item_id);
            }
            porNome.set(nome, cur);
          });
      });

      // Ficha de adicional existe? Só dá para saber pelos que têm vínculo.
      const idsUsados = Array.from(usados);
      const comFichaOpcao = new Set<string>();
      if (idsUsados.length > 0) {
        const { data: vinculos } = await supabase
          .from("delivery_product_option_items")
          .select("id, source_pdv_option_item_id")
          .in("id", idsUsados);
        const origens = ((vinculos ?? []) as any[]).filter((v) => v.source_pdv_option_item_id);
        if (origens.length > 0) {
          const { data: fichasOpcao } = await supabase
            .from("pdv_option_item_recipes")
            .select("option_item_id")
            .in("option_item_id", origens.map((v) => v.source_pdv_option_item_id));
          const comOrigem = new Set(((fichasOpcao ?? []) as any[]).map((f) => f.option_item_id));
          origens.forEach((v) => {
            if (comOrigem.has(v.source_pdv_option_item_id)) comFichaOpcao.add(v.id);
          });
        }
      }

      const adicionaisSemFicha: AdicionalSemFicha[] = [];
      porNome.forEach((v, nome) => {
        const todosComFicha = v.ids.size > 0 && Array.from(v.ids).every((id) => comFichaOpcao.has(id));
        if (todosComFicha) return;
        adicionaisSemFicha.push({ nome, vezes: v.vezes, receita: v.receita, cadastros: v.ids.size });
      });
      adicionaisSemFicha.sort((a, b) => b.vezes - a.vezes || b.receita - a.receita);

      return {
        produtosSemFicha: semFicha,
        adicionaisSemFicha,
        receitaTotal,
        receitaComFicha,
        cobertura: receitaTotal > 0 ? receitaComFicha / receitaTotal : 0,
        totalProdutosVendidos: agg.size,
        produtosComFicha: Array.from(agg.keys()).filter((id) => comFicha.has(id)).length,
      };
    },
  });
}
