import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DeliveryProduct {
  id: string;
  user_id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: number;
  promotional_price: number | null;
  preparation_time: number;
  serves: number;
  is_available: boolean;
  is_featured: boolean;
  order_position: number;
  created_at: string;
  updated_at: string;
}

export const useDeliveryProducts = (categoryId?: string) => {
  return useQuery({
    queryKey: ["delivery-products", categoryId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      let query = supabase
        .from("delivery_products")
        .select("*")
        .eq("user_id", user.id);

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query.order("order_position", { ascending: true });

      if (error) throw error;
      return data as DeliveryProduct[];
    },
  });
};

export const useCreateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      product: Omit<DeliveryProduct, "id" | "user_id" | "created_at" | "updated_at">
    ) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Auto-assign order_position as max+1 within the category if not set
      let orderPosition = product.order_position;
      if (!orderPosition || orderPosition === 0) {
        const { data: maxRow } = await supabase
          .from("delivery_products")
          .select("order_position")
          .eq("user_id", user.id)
          .eq("category_id", product.category_id)
          .order("order_position", { ascending: false })
          .limit(1)
          .maybeSingle();
        orderPosition = (maxRow?.order_position ?? 0) + 1;
      }

      const { data, error } = await supabase
        .from("delivery_products")
        .insert({ ...product, order_position: orderPosition, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-products"] });
      toast.success("Produto criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar produto: " + error.message);
    },
  });
};

export const useUpdateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<DeliveryProduct>;
    }) => {
      const { data, error } = await supabase
        .from("delivery_products")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-products"] });
      toast.success("Produto atualizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar produto: " + error.message);
    },
  });
};

export const useReorderProducts = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: { id: string; order_position: number }[]) => {
      const results = await Promise.all(
        items.map((item) =>
          supabase
            .from("delivery_products")
            .update({ order_position: item.order_position })
            .eq("id", item.id)
        )
      );
      const firstError = results.find((r) => r.error);
      if (firstError?.error) throw firstError.error;
    },
    onMutate: async (items) => {
      // Optimistic: apply new order_position to every cached delivery-products list.
      await queryClient.cancelQueries({ queryKey: ["delivery-products"] });
      const orderMap = new Map(items.map((i) => [i.id, i.order_position]));
      const snapshots: Array<[readonly unknown[], unknown]> = [];
      const caches = queryClient.getQueriesData<DeliveryProduct[]>({
        queryKey: ["delivery-products"],
      });
      for (const [key, list] of caches) {
        if (!list) continue;
        snapshots.push([key, list]);
        const next = list
          .map((p) =>
            orderMap.has(p.id)
              ? { ...p, order_position: orderMap.get(p.id)! }
              : p
          )
          .sort((a, b) => (a.order_position ?? 0) - (b.order_position ?? 0));
        queryClient.setQueryData(key, next);
      }
      return { snapshots };
    },
    onError: (error: Error, _items, ctx) => {
      if (ctx?.snapshots) {
        for (const [key, data] of ctx.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Erro ao reordenar produtos: " + error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-products"] });
      queryClient.invalidateQueries({ queryKey: ["public-products"] });
      queryClient.invalidateQueries({ queryKey: ["public-menu"] });
    },
  });
};

// Duplica um produto incluindo opções, itens das opções, ficha técnica
// e receitas dos itens das opções (preserva vínculos com pdv_ingredients).
export const useDuplicateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sourceId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 1) Carrega o produto fonte
      const { data: src, error: srcErr } = await supabase
        .from("delivery_products")
        .select("*")
        .eq("id", sourceId)
        .single();
      if (srcErr) throw srcErr;

      // 2) order_position no final da categoria
      const { data: maxRow } = await supabase
        .from("delivery_products")
        .select("order_position")
        .eq("user_id", user.id)
        .eq("category_id", src.category_id)
        .order("order_position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const orderPosition = (maxRow?.order_position ?? 0) + 1;

      // 3) Cria o novo produto
      const { id, user_id, created_at, updated_at, ...productData } = src as any;
      const { data: newProduct, error: prodErr } = await supabase
        .from("delivery_products")
        .insert({
          ...productData,
          name: `${src.name} (cópia)`,
          order_position: orderPosition,
          user_id: user.id,
        })
        .select()
        .single();
      if (prodErr) throw prodErr;

      // 4) Replica ficha técnica do produto principal
      const { data: srcRecipes } = await supabase
        .from("delivery_product_recipes")
        .select("ingredient_id, quantity, unit")
        .eq("product_id", sourceId);

      if (srcRecipes && srcRecipes.length > 0) {
        await supabase.from("delivery_product_recipes").insert(
          srcRecipes.map((r) => ({
            product_id: newProduct.id,
            ingredient_id: r.ingredient_id,
            quantity: r.quantity,
            unit: r.unit,
          })),
        );
      }

      // 5) Replica opções + itens + receitas dos itens
      const { data: srcOptions } = await supabase
        .from("delivery_product_options")
        .select("*")
        .eq("product_id", sourceId)
        .order("order_position");

      if (srcOptions && srcOptions.length > 0) {
        for (const opt of srcOptions) {
          const { data: newOpt, error: optErr } = await supabase
            .from("delivery_product_options")
            .insert({
              product_id: newProduct.id,
              name: opt.name,
              type: opt.type,
              is_required: opt.is_required,
              min_selections: opt.min_selections,
              max_selections: opt.max_selections,
              order_position: opt.order_position,
            })
            .select()
            .single();
          if (optErr) throw optErr;

          const { data: srcItems } = await supabase
            .from("delivery_product_option_items")
            .select("*")
            .eq("option_id", opt.id)
            .order("order_position");

          if (srcItems && srcItems.length > 0) {
            const { data: newItems, error: itemsErr } = await supabase
              .from("delivery_product_option_items")
              .insert(
                srcItems.map((it: any) => ({
                  option_id: newOpt.id,
                  name: it.name,
                  price_adjustment: it.price_adjustment,
                  is_available: it.is_available,
                  order_position: it.order_position,
                })),
              )
              .select();
            if (itemsErr) throw itemsErr;

            // mapa oldItemId -> newItemId (preserva ordem)
            const idMap = new Map<string, string>();
            srcItems.forEach((old: any, idx: number) => {
              if (newItems?.[idx]) idMap.set(old.id, newItems[idx].id);
            });

            const oldItemIds = srcItems.map((i: any) => i.id);
            const { data: srcOptRecipes } = await supabase
              .from("delivery_option_item_recipes")
              .select("option_item_id, ingredient_id, quantity, unit")
              .in("option_item_id", oldItemIds);

            if (srcOptRecipes && srcOptRecipes.length > 0) {
              await supabase.from("delivery_option_item_recipes").insert(
                srcOptRecipes
                  .filter((r) => idMap.has(r.option_item_id))
                  .map((r) => ({
                    option_item_id: idMap.get(r.option_item_id)!,
                    ingredient_id: r.ingredient_id,
                    quantity: r.quantity,
                    unit: r.unit,
                  })),
              );
            }
          }
        }
      }

      return newProduct;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-products"] });
      queryClient.invalidateQueries({ queryKey: ["product-options"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-option-recipes"] });
      toast.success("Produto duplicado com opções e ficha técnica!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao duplicar produto: " + error.message);
    },
  });
};

export const useDeleteProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("delivery_products")
        .delete()
        .eq("id", id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sem permissão para excluir este produto");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-products"] });
      toast.success("Produto excluído com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao excluir produto: " + error.message);
    },
  });
};

