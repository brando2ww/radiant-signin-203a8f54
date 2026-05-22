import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

export interface PDVProduct {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string;
  image_url: string | null;
  price_salon: number;
  price_balcao: number | null;
  price_delivery: number | null;
  preparation_time: number;
  serves: number;
  is_available: boolean;
  available_times: any;
  is_sold_by_weight: boolean;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  origin: string | null;
  cst_icms: string | null;
  csosn: string | null;
  icms_rate: number | null;
  pis_cst: string | null;
  pis_rate: number | null;
  cofins_cst: string | null;
  cofins_rate: number | null;
  tax_unit: string | null;
  ean: string | null;
  is_composite: boolean;
  stock_deduction_mode: string;
  created_at: string;
  updated_at: string;
}

export function usePDVProducts() {
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ["pdv-products", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("pdv_products")
        .select("*")
        .eq("user_id", visibleUserId)
        .order("category")
        .order("name");

      if (error) throw error;
      return data as PDVProduct[];
    },
    enabled: !!visibleUserId,
  });

  const createProduct = useMutation({
    mutationFn: async (product: Omit<PDVProduct, "id" | "user_id" | "created_at" | "updated_at">) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("pdv_products")
        .insert({ ...product, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-products"] });
      toast.success("Produto criado com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao criar produto: " + error.message);
    },
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PDVProduct> }) => {
      const { data, error } = await supabase
        .from("pdv_products")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-products"] });
      toast.success("Produto atualizado com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar produto: " + error.message);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pdv_products")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-products"] });
      toast.success("Produto removido com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover produto: " + error.message);
    },
  });

  const duplicateProduct = useMutation({
    mutationFn: async (sourceId: string) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { data: src, error: srcErr } = await supabase
        .from("pdv_products")
        .select("*")
        .eq("id", sourceId)
        .single();
      if (srcErr) throw srcErr;

      const { id, user_id, created_at, updated_at, ...productData } = src as any;
      const { data: newProduct, error: prodErr } = await supabase
        .from("pdv_products")
        .insert({ ...productData, name: `${src.name} (cópia)`, user_id: user.id })
        .select()
        .single();
      if (prodErr) throw prodErr;

      const { data: srcRecipes } = await supabase
        .from("pdv_product_recipes")
        .select("ingredient_id, quantity, unit")
        .eq("product_id", sourceId);
      if (srcRecipes && srcRecipes.length > 0) {
        await supabase.from("pdv_product_recipes").insert(
          srcRecipes.map((r: any) => ({
            product_id: newProduct.id,
            ingredient_id: r.ingredient_id,
            quantity: r.quantity,
            unit: r.unit,
          })),
        );
      }

      const { data: srcGroups } = await supabase
        .from("pdv_product_composition_groups")
        .select("*")
        .eq("parent_product_id", sourceId)
        .order("order_position");

      const groupIdMap = new Map<string, string>();
      if (srcGroups && srcGroups.length > 0) {
        for (const g of srcGroups as any[]) {
          const { data: newGroup, error: gErr } = await supabase
            .from("pdv_product_composition_groups")
            .insert({
              parent_product_id: newProduct.id,
              name: g.name,
              type: g.type,
              is_required: g.is_required,
              min_selections: g.min_selections,
              max_selections: g.max_selections,
              order_position: g.order_position,
            })
            .select()
            .single();
          if (gErr) throw gErr;
          groupIdMap.set(g.id, newGroup.id);
        }
      }

      const { data: srcComps } = await supabase
        .from("pdv_product_compositions")
        .select("*")
        .eq("parent_product_id", sourceId)
        .order("order_position");
      if (srcComps && srcComps.length > 0) {
        await supabase.from("pdv_product_compositions").insert(
          (srcComps as any[]).map((c) => ({
            parent_product_id: newProduct.id,
            child_product_id: c.child_product_id,
            group_id: c.group_id ? groupIdMap.get(c.group_id) ?? null : null,
            quantity: c.quantity,
            order_position: c.order_position,
          })),
        );
      }

      const { data: srcOptions } = await supabase
        .from("pdv_product_options")
        .select("*")
        .eq("product_id", sourceId)
        .order("order_position");

      if (srcOptions && srcOptions.length > 0) {
        for (const opt of srcOptions as any[]) {
          const { data: newOpt, error: optErr } = await supabase
            .from("pdv_product_options")
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
            .from("pdv_product_option_items")
            .select("*")
            .eq("option_id", opt.id)
            .order("order_position");

          if (srcItems && srcItems.length > 0) {
            const { data: newItems, error: itemsErr } = await supabase
              .from("pdv_product_option_items")
              .insert(
                (srcItems as any[]).map((it) => ({
                  option_id: newOpt.id,
                  name: it.name,
                  price_adjustment: it.price_adjustment,
                  is_available: it.is_available,
                  order_position: it.order_position,
                  linked_product_id: it.linked_product_id ?? null,
                })),
              )
              .select();
            if (itemsErr) throw itemsErr;

            const idMap = new Map<string, string>();
            (srcItems as any[]).forEach((old, idx) => {
              if (newItems?.[idx]) idMap.set(old.id, newItems[idx].id);
            });

            const oldItemIds = (srcItems as any[]).map((i) => i.id);
            const { data: srcOptRecipes } = await supabase
              .from("pdv_option_item_recipes")
              .select("option_item_id, ingredient_id, quantity, unit")
              .in("option_item_id", oldItemIds);

            if (srcOptRecipes && srcOptRecipes.length > 0) {
              await supabase.from("pdv_option_item_recipes").insert(
                (srcOptRecipes as any[])
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
      queryClient.invalidateQueries({ queryKey: ["pdv-products"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-product-options"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-composition-groups"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-compositions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-recipes"] });
      toast.success("Produto duplicado com composição, opções e ficha técnica");
    },
    onError: (error: any) => {
      toast.error("Erro ao duplicar produto: " + error.message);
    },
  });

  return {
    products: products || [],
    isLoading,
    createProduct: createProduct.mutate,
    isCreating: createProduct.isPending,
    updateProduct: updateProduct.mutate,
    isUpdating: updateProduct.isPending,
    deleteProduct: deleteProduct.mutate,
    isDeleting: deleteProduct.isPending,
    duplicateProduct: duplicateProduct.mutate,
    isDuplicating: duplicateProduct.isPending,
  };
}
