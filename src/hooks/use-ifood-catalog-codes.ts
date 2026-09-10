import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

/**
 * Códigos do cardápio para configurar no iFood.
 *
 * O iFood casa o pedido com o produto pelo campo `externalCode`, que o lojista
 * preenche no cardápio DELE. Esta tela existe para ele saber QUAL número
 * digitar em cada item e complemento — sem ela, o pedido entra e não casa com
 * nada, silenciosamente.
 *
 * A coluna "configurado" não é um palpite: um código só é dado como configurado
 * quando já VOLTOU num pedido real do iFood. É a única prova de que o lojista
 * digitou certo do outro lado.
 */
export interface CatalogCodeItem {
  code: number;
  name: string;
  configurado: boolean;
}

export interface CatalogCodeProduct extends CatalogCodeItem {
  subitens: CatalogCodeItem[];
}

export function useIFoodCatalogCodes() {
  const { visibleUserId } = useEstablishmentId();

  return useQuery({
    queryKey: ["ifood-catalog-codes", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<{ produtos: CatalogCodeProduct[]; total: number; configurados: number }> => {
      if (!visibleUserId) return { produtos: [], total: 0, configurados: 0 };

      const [codesRes, prodRes, optRes, seenRes] = await Promise.all([
        supabase
          .from("delivery_catalog_codes" as any)
          .select("code, kind, ref_id")
          .eq("user_id", visibleUserId),
        supabase
          .from("delivery_products")
          .select("id, name, order_position")
          .eq("user_id", visibleUserId),
        supabase
          .from("delivery_product_options")
          .select("id, product_id, delivery_product_option_items (id, name, order_position)"),
        // Códigos que já chegaram em pedido do iFood: prova de configuração.
        supabase
          .from("delivery_order_items")
          .select("external_product_id, delivery_orders!inner(user_id, source)")
          .eq("delivery_orders.user_id", visibleUserId)
          .eq("delivery_orders.source", "ifood"),
      ]);

      const codes = (codesRes.data ?? []) as unknown as { code: number; kind: string; ref_id: string }[];
      const porRef = new Map(codes.map((c) => [c.ref_id, c.code]));

      const vistos = new Set(
        ((seenRes.data ?? []) as unknown as { external_product_id: string | null }[])
          .map((r) => String(r.external_product_id ?? "").trim())
          .filter(Boolean),
      );
      const foiVisto = (code: number) => vistos.has(String(code));

      // subitens agrupados pelo produto a que pertencem
      const subPorProduto = new Map<string, CatalogCodeItem[]>();
      for (const o of (optRes.data ?? []) as any[]) {
        const lista = subPorProduto.get(o.product_id) ?? [];
        for (const it of o.delivery_product_option_items ?? []) {
          const code = porRef.get(it.id);
          if (code === undefined) continue;
          // Dentro de um produto o mesmo código não se repete: dois cadastros
          // com o mesmo nome no mesmo combo são a mesma escolha para quem cola.
          if (lista.some((x) => x.code === code)) continue;
          lista.push({ code, name: it.name, configurado: foiVisto(code) });
        }
        subPorProduto.set(o.product_id, lista);
      }

      const produtos: CatalogCodeProduct[] = ((prodRes.data ?? []) as any[])
        .map((p) => {
          const code = porRef.get(p.id);
          if (code === undefined) return null;
          return {
            code,
            name: p.name,
            configurado: foiVisto(code),
            subitens: (subPorProduto.get(p.id) ?? []).sort((a, b) => a.code - b.code),
          };
        })
        .filter(Boolean) as CatalogCodeProduct[];

      produtos.sort((a, b) => a.code - b.code);

      // Conta CÓDIGO, não linha do cardápio. O mesmo adicional aparece em vários
      // produtos dividindo um código só — "Wassabi" está em 11 combos do Kōten.
      // Contar linha diria "195 códigos" quando existem 97 itens de verdade, e
      // o progresso nunca fecharia em 100%.
      const porCodigo = new Map<number, boolean>();
      produtos.forEach((p) => {
        [p, ...p.subitens].forEach((i) => {
          porCodigo.set(i.code, (porCodigo.get(i.code) ?? false) || i.configurado);
        });
      });
      return {
        produtos,
        total: porCodigo.size,
        configurados: Array.from(porCodigo.values()).filter(Boolean).length,
      };
    },
  });
}
