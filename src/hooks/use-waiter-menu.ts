/**
 * Cardápio do garçom.
 *
 * O catálogo cru não serve para quem está em pé na frente da mesa: no Kōten são
 * 358 produtos ativos, e digitar "salm" devolve 46 linhas em ordem alfabética.
 * Aqui montamos a lista que ele realmente usa, com três fontes:
 *
 *   1. o HISTÓRICO do próprio restaurante (os mais pedidos na janela escolhida);
 *   2. o que o DONO fixou, para o prato novo que o histórico ainda não conhece;
 *   3. o que o dono escondeu, como as categorias de delivery.
 *
 * Nada aqui apaga produto: é preferência de tela.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

export interface WaiterMenuSettings {
  user_id: string;
  destaque_modo: "historico" | "manual" | "misto";
  destaque_janela_dias: 7 | 14 | 30 | 60 | 90;
  destaque_quantidade: number;
  categorias_ocultas: string[];
  categorias_ordem: string[];
  ocultar_sem_venda_dias: number | null;
}

export interface WaiterMenuItem {
  id: string;
  product_id: string;
  fixado: boolean;
  oculto: boolean;
  ordem: number | null;
  pai_product_id: string | null;
}

export interface TopProduct {
  product_id: string;
  product_name: string;
  quantidade: number;
  lancamentos: number;
}

const PADRAO: Omit<WaiterMenuSettings, "user_id"> = {
  destaque_modo: "misto",
  destaque_janela_dias: 30,
  destaque_quantidade: 20,
  categorias_ocultas: [],
  categorias_ordem: [],
  ocultar_sem_venda_dias: null,
};

export function useWaiterMenuSettings() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["waiter-menu-settings", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<WaiterMenuSettings> => {
      const { data, error } = await supabase
        .from("pdv_waiter_menu_settings")
        .select("*")
        .eq("user_id", visibleUserId!)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? { user_id: visibleUserId!, ...PADRAO };
    },
  });

  const salvar = useMutation({
    mutationFn: async (mudanca: Partial<WaiterMenuSettings>) => {
      const { error } = await supabase
        .from("pdv_waiter_menu_settings")
        .upsert(
          { user_id: visibleUserId, ...PADRAO, ...query.data, ...mudanca, atualizado_em: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["waiter-menu-settings"] });
      qc.invalidateQueries({ queryKey: ["waiter-top-products"] });
    },
  });

  return { settings: query.data, isLoading: query.isLoading, salvar };
}

export function useWaiterMenuItems() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["waiter-menu-items", visibleUserId],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdv_waiter_menu_items")
        .select("*")
        .eq("user_id", visibleUserId!);
      if (error) throw error;
      return (data ?? []) as WaiterMenuItem[];
    },
  });

  const definir = useMutation({
    mutationFn: async (mudanca: { product_id: string } & Partial<Omit<WaiterMenuItem, "id" | "product_id">>) => {
      const { error } = await supabase
        .from("pdv_waiter_menu_items")
        .upsert(
          { user_id: visibleUserId, ...mudanca, atualizado_em: new Date().toISOString() },
          { onConflict: "user_id,product_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["waiter-menu-items"] }),
  });

  return { itens: query.data ?? [], isLoading: query.isLoading, definir };
}

/** Os mais pedidos, calculados no banco. */
export function useWaiterTopProducts(dias?: number, limite?: number) {
  const { visibleUserId } = useEstablishmentId();

  return useQuery({
    queryKey: ["waiter-top-products", visibleUserId, dias, limite],
    enabled: !!visibleUserId,
    // Ranking não muda de minuto em minuto; 10 minutos de cache poupam o banco
    // em restaurante cheio, com vários garçons abrindo a tela ao mesmo tempo.
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<TopProduct[]> => {
      const { data, error } = await supabase.rpc("pdv_waiter_top_products", {
        _owner: visibleUserId!,
        _dias: dias ?? 30,
        _limite: limite ?? 20,
      });
      if (error) throw error;
      return (data ?? []) as TopProduct[];
    },
  });
}

/**
 * Texto sem acento, sem pontuação e sem o número que abre o nome do produto.
 *
 * O catálogo do Kōten chama os pratos de "04 Joe Salmão", e esse número na
 * frente é o que faz a ordem alfabética ficar sem sentido para quem busca.
 */
export function normalizar(texto: string): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\s*\d+\s*/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Casa os termos em qualquer ordem: "salmao sashimi" encontra
 * "05 Sashimi de Salmão". A busca antiga era um `includes` cru, que exigia a
 * frase exata e na mesma ordem.
 */
export function casaBusca(nome: string, busca: string): boolean {
  const alvo = normalizar(nome);
  const termos = normalizar(busca).split(" ").filter(Boolean);
  if (!termos.length) return true;
  return termos.every((t) => alvo.includes(t));
}
