import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { normalizarProduto } from "@/hooks/use-vendas-catalogo";
import type { VendasProduto } from "@/lib/vendas/types";

/** Campos que a tela de catálogo da Força de vendas grava em pdv_products. */
export type ProdutoB2bGravar = {
  name?: string;
  category?: string;
  description?: string | null;
  price_b2b?: number | null;
  b2b_enabled?: boolean;
  sku?: string | null;
  sales_unit?: string | null;
  min_qty?: number | null;
  pack_qty?: number | null;
  image_url?: string | null;
  gallery?: string[];
};

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["vendas-catalogo"] });
  qc.invalidateQueries({ queryKey: ["pdv-products"] });
}

/** Atualiza um produto (só o dono consegue: regra do banco). */
export function useAtualizarProdutoB2b() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dados }: { id: string; dados: ProdutoB2bGravar }) => {
      const { data, error } = await supabase
        .from("pdv_products" as any)
        .update({ ...dados, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return normalizarProduto(data);
    },
    onSuccess: () => invalidar(qc),
  });
}

/**
 * Cria um produto pelo catálogo. pdv_products exige nome, categoria e preço de salão: o preço de balcão vale para salão
 * e balcão (o PDV usa o mesmo cadastro).
 */
export function useCriarProdutoB2b() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dados, precoBalcao }: { dados: ProdutoB2bGravar & { name: string; category: string }; precoBalcao: number }) => {
      if (!visibleUserId) throw new Error("Estabelecimento não identificado.");
      const { data, error } = await supabase
        .from("pdv_products" as any)
        .insert({
          ...dados,
          user_id: visibleUserId,
          price_salon: precoBalcao,
          price_balcao: precoBalcao,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return normalizarProduto(data) as VendasProduto;
    },
    onSuccess: () => invalidar(qc),
  });
}
