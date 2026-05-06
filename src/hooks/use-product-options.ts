import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ProductOptionItem {
  id: string;
  option_id: string;
  name: string;
  price_adjustment: number;
  is_available: boolean;
  order_position: number;
  // Ingredient link fields (loaded from recipes)
  ingredient_id?: string;
  ingredient_quantity?: number;
  ingredient_unit?: string;
}

export interface ProductOption {
  id: string;
  product_id: string;
  name: string;
  type: "single" | "multiple";
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  order_position: number;
  allow_quantity?: boolean;
  items?: ProductOptionItem[];
}

// Fetch options for a product
export const useProductOptions = (productId?: string) => {
  return useQuery({
    queryKey: ["product-options", productId],
    queryFn: async () => {
      if (!productId) return [];

      const { data: options, error: optionsError } = await supabase
        .from("delivery_product_options")
        .select("*")
        .eq("product_id", productId)
        .order("order_position");

      if (optionsError) throw optionsError;

      const optionsWithItems = await Promise.all(
        options.map(async (option) => {
          const { data: items, error: itemsError } = await supabase
            .from("delivery_product_option_items")
            .select("*")
            .eq("option_id", option.id)
            .order("order_position");

          if (itemsError) throw itemsError;

          // Load recipes for each item to get ingredient links
          const itemIds = (items || []).map((i) => i.id);
          let recipesMap = new Map<string, { ingredient_id: string; quantity: number; unit: string }>();

          if (itemIds.length > 0) {
            const { data: recipes } = await supabase
              .from("delivery_option_item_recipes")
              .select("option_item_id, ingredient_id, quantity, unit")
              .in("option_item_id", itemIds);

            if (recipes) {
              recipes.forEach((r) => {
                recipesMap.set(r.option_item_id, {
                  ingredient_id: r.ingredient_id,
                  quantity: Number(r.quantity),
                  unit: r.unit,
                });
              });
            }
          }

          return {
            ...option,
            items: (items || []).map((item) => {
              const recipe = recipesMap.get(item.id);
              return {
                ...item,
                ingredient_id: recipe?.ingredient_id,
                ingredient_quantity: recipe?.quantity,
                ingredient_unit: recipe?.unit,
              };
            }),
          };
        })
      );

      return optionsWithItems as ProductOption[];
    },
    enabled: !!productId,
  });
};

// Helper to sync recipes after items are created/updated
async function syncRecipes(
  insertedItems: { id: string; ingredient_id?: string; ingredient_quantity?: number; ingredient_unit?: string }[]
) {
  for (const item of insertedItems) {
    // Delete existing recipe for this item
    await supabase
      .from("delivery_option_item_recipes")
      .delete()
      .eq("option_item_id", item.id);

    // Insert new recipe if ingredient is linked
    if (item.ingredient_id && item.ingredient_quantity) {
      await supabase
        .from("delivery_option_item_recipes")
        .insert({
          option_item_id: item.id,
          ingredient_id: item.ingredient_id,
          quantity: item.ingredient_quantity,
          unit: item.ingredient_unit || "un",
        });
    }
  }
}

// Create a new product option
export const useCreateProductOption = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      option: Omit<ProductOption, "id" | "items"> & {
        items: (Omit<ProductOptionItem, "id" | "option_id"> & {
          ingredient_id?: string;
          ingredient_quantity?: number;
          ingredient_unit?: string;
        })[];
      }
    ) => {
      const { data: newOption, error: optionError } = await supabase
        .from("delivery_product_options")
        .insert({
          product_id: option.product_id,
          name: option.name,
          type: option.type,
          is_required: option.is_required,
          min_selections: option.min_selections,
          max_selections: option.max_selections,
          order_position: option.order_position,
          allow_quantity: (option as any).allow_quantity ?? false,
        })
        .select()
        .single();

      if (optionError) throw optionError;

      // Insert items
      if (option.items.length > 0) {
        const { data: insertedItems, error: itemsError } = await supabase
          .from("delivery_product_option_items")
          .insert(
            option.items.map((item, index) => ({
              option_id: newOption.id,
              name: item.name,
              price_adjustment: item.price_adjustment,
              is_available: item.is_available,
              order_position: index,
            }))
          )
          .select();

        if (itemsError) throw itemsError;

        // Sync recipes for items with ingredient links
        if (insertedItems) {
          const itemsWithIngredients = insertedItems.map((inserted, index) => ({
            id: inserted.id,
            ingredient_id: option.items[index].ingredient_id,
            ingredient_quantity: option.items[index].ingredient_quantity,
            ingredient_unit: option.items[index].ingredient_unit,
          }));
          await syncRecipes(itemsWithIngredients);
        }
      }

      return newOption;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["product-options", variables.product_id] });
      queryClient.invalidateQueries({ queryKey: ["delivery-option-recipes"] });
      toast.success("Opção criada com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao criar opção");
    },
  });
};

// Update a product option
export const useUpdateProductOption = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ProductOption> }) => {
      const { data, error } = await supabase
        .from("delivery_product_options")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["product-options", data.product_id] });
      toast.success("Opção atualizada com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao atualizar opção");
    },
  });
};

// Full update: option + items + recipes
export const useFullUpdateProductOption = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      optionId,
      optionData,
    }: {
      optionId: string;
      optionData: Omit<ProductOption, "id" | "items"> & {
        items: (Omit<ProductOptionItem, "id" | "option_id"> & {
          ingredient_id?: string;
          ingredient_quantity?: number;
          ingredient_unit?: string;
        })[];
      };
    }) => {
      // Update option
      const { error: optionError } = await supabase
        .from("delivery_product_options")
        .update({
          name: optionData.name,
          type: optionData.type,
          is_required: optionData.is_required,
          min_selections: optionData.min_selections,
          max_selections: optionData.max_selections,
          allow_quantity: (optionData as any).allow_quantity ?? false,
        })
        .eq("id", optionId);

      if (optionError) throw optionError;

      // Delete old items (cascade will delete recipes via FK)
      const { data: oldItems } = await supabase
        .from("delivery_product_option_items")
        .select("id")
        .eq("option_id", optionId);

      if (oldItems && oldItems.length > 0) {
        // Delete recipes first
        for (const oldItem of oldItems) {
          await supabase
            .from("delivery_option_item_recipes")
            .delete()
            .eq("option_item_id", oldItem.id);
        }
        // Delete old items
        await supabase
          .from("delivery_product_option_items")
          .delete()
          .eq("option_id", optionId);
      }

      // Insert new items
      if (optionData.items.length > 0) {
        const { data: insertedItems, error: itemsError } = await supabase
          .from("delivery_product_option_items")
          .insert(
            optionData.items.map((item, index) => ({
              option_id: optionId,
              name: item.name,
              price_adjustment: item.price_adjustment,
              is_available: item.is_available,
              order_position: index,
            }))
          )
          .select();

        if (itemsError) throw itemsError;

        if (insertedItems) {
          const itemsWithIngredients = insertedItems.map((inserted, index) => ({
            id: inserted.id,
            ingredient_id: optionData.items[index].ingredient_id,
            ingredient_quantity: optionData.items[index].ingredient_quantity,
            ingredient_unit: optionData.items[index].ingredient_unit,
          }));
          await syncRecipes(itemsWithIngredients);
        }
      }

      return { product_id: optionData.product_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["product-options", data.product_id] });
      queryClient.invalidateQueries({ queryKey: ["delivery-option-recipes"] });
      toast.success("Opção atualizada com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao atualizar opção");
    },
  });
};

// Delete a product option
export const useDeleteProductOption = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      // Delete recipes for all items of this option
      const { data: items } = await supabase
        .from("delivery_product_option_items")
        .select("id")
        .eq("option_id", id);

      if (items && items.length > 0) {
        for (const item of items) {
          await supabase
            .from("delivery_option_item_recipes")
            .delete()
            .eq("option_item_id", item.id);
        }
      }

      // Delete all items
      const { error: itemsError } = await supabase
        .from("delivery_product_option_items")
        .delete()
        .eq("option_id", id);

      if (itemsError) throw itemsError;

      // Delete the option
      const { error } = await supabase
        .from("delivery_product_options")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { id, productId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["product-options", data.productId] });
      toast.success("Opção excluída com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao excluir opção");
    },
  });
};

// Importa opções de outro produto (clona opções, itens e receitas dos itens)
export const useImportProductOptions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      targetProductId,
      sourceOptionIds,
    }: {
      targetProductId: string;
      sourceOptionIds: string[];
    }) => {
      if (sourceOptionIds.length === 0) return { count: 0 };

      // pega maior order_position atual no destino
      const { data: existing } = await supabase
        .from("delivery_product_options")
        .select("order_position")
        .eq("product_id", targetProductId)
        .order("order_position", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextPos = (existing?.order_position ?? -1) + 1;

      const { data: srcOptions, error: srcErr } = await supabase
        .from("delivery_product_options")
        .select("*")
        .in("id", sourceOptionIds)
        .order("order_position");
      if (srcErr) throw srcErr;

      let imported = 0;
      for (const opt of srcOptions || []) {
        const { data: newOpt, error: optErr } = await supabase
          .from("delivery_product_options")
          .insert({
            product_id: targetProductId,
            name: opt.name,
            type: opt.type,
            is_required: opt.is_required,
            min_selections: opt.min_selections,
            max_selections: opt.max_selections,
            order_position: nextPos++,
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

        imported++;
      }

      return { count: imported };
    },
    onSuccess: ({ count }, variables) => {
      queryClient.invalidateQueries({ queryKey: ["product-options", variables.targetProductId] });
      queryClient.invalidateQueries({ queryKey: ["delivery-option-recipes"] });
      toast.success(`${count} ${count === 1 ? "opção importada" : "opções importadas"} com sucesso!`);
    },
    onError: (error: any) => {
      toast.error("Erro ao importar opções: " + error.message);
    },
  });
};

// Create option item
export const useCreateOptionItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ item, productId }: { item: Omit<ProductOptionItem, "id">; productId: string }) => {
      const { data, error } = await supabase
        .from("delivery_product_option_items")
        .insert(item)
        .select()
        .single();

      if (error) throw error;
      return { data, productId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["product-options", result.productId] });
      toast.success("Item adicionado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao adicionar item");
    },
  });
};

// Update option item
export const useUpdateOptionItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates, productId }: { id: string; updates: Partial<ProductOptionItem>; productId: string }) => {
      const { data, error } = await supabase
        .from("delivery_product_option_items")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { data, productId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["product-options", result.productId] });
      toast.success("Item atualizado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao atualizar item");
    },
  });
};

// Delete option item
export const useDeleteOptionItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      // Delete recipe first
      await supabase
        .from("delivery_option_item_recipes")
        .delete()
        .eq("option_item_id", id);

      const { error } = await supabase
        .from("delivery_product_option_items")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { id, productId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["product-options", result.productId] });
      toast.success("Item excluído com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao excluir item");
    },
  });
};
