import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PDVProduct } from "@/hooks/use-pdv-products";

export interface CompositionItem {
  id: string;
  group_id: string | null;
  parent_product_id: string;
  child_product_id: string;
  quantity: number;
  order_position: number;
  child_product?: PDVProduct;
}

export interface CompositionGroup {
  id: string;
  parent_product_id: string;
  name: string;
  type: "single" | "multiple" | string;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  order_position: number;
  items: CompositionItem[];
}

export function useCompositionGroups(productId?: string) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pdv-composition-groups", productId],
    enabled: !!productId,
    queryFn: async (): Promise<CompositionGroup[]> => {
      if (!productId) return [];
      const { data: groups, error: gErr } = await supabase
        .from("pdv_product_composition_groups")
        .select("*")
        .eq("parent_product_id", productId)
        .order("order_position");
      if (gErr) throw gErr;

      const { data: comps, error: cErr } = await supabase
        .from("pdv_product_compositions")
        .select(
          "*, child_product:pdv_products!pdv_product_compositions_child_product_id_fkey(*)"
        )
        .eq("parent_product_id", productId)
        .order("order_position");
      if (cErr) throw cErr;

      // Orphan compositions (without group): create a virtual default group bucket
      // — but we already backfill server-side, so we just group by group_id.
      const byGroup = new Map<string, CompositionItem[]>();
      (comps || []).forEach((c: any) => {
        const key = c.group_id || "__none__";
        const arr = byGroup.get(key) || [];
        arr.push(c as CompositionItem);
        byGroup.set(key, arr);
      });

      return (groups || []).map((g: any) => ({
        ...g,
        items: byGroup.get(g.id) || [],
      })) as CompositionGroup[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pdv-composition-groups", productId] });
    qc.invalidateQueries({ queryKey: ["pdv-compositions", productId] });
  };

  const createGroup = useMutation({
    mutationFn: async (input: {
      parent_product_id: string;
      name: string;
      type?: string;
      is_required?: boolean;
      min_selections?: number;
      max_selections?: number;
      order_position?: number;
    }) => {
      const { data, error } = await supabase
        .from("pdv_product_composition_groups")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (e: any) => toast.error("Erro ao criar grupo: " + e.message),
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Omit<CompositionGroup, "id" | "items" | "parent_product_id">>) => {
      const { error } = await supabase
        .from("pdv_product_composition_groups")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error("Erro ao atualizar grupo: " + e.message),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pdv_product_composition_groups")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error("Erro ao remover grupo: " + e.message),
  });

  const addItem = useMutation({
    mutationFn: async (input: {
      groupId: string;
      parentProductId: string;
      childProductId: string;
      quantity?: number;
    }) => {
      if (input.parentProductId === input.childProductId) {
        throw new Error("Um produto não pode ser sub-produto de si mesmo");
      }
      const { data, error } = await supabase
        .from("pdv_product_compositions")
        .insert({
          parent_product_id: input.parentProductId,
          child_product_id: input.childProductId,
          group_id: input.groupId,
          quantity: input.quantity ?? 1,
          order_position: 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
    onError: (e: any) => {
      if (e.message?.includes("duplicate key")) {
        toast.error("Este sub-produto já está na composição");
      } else {
        toast.error("Erro ao adicionar: " + e.message);
      }
    },
  });

  const updateItemQuantity = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const { error } = await supabase
        .from("pdv_product_compositions")
        .update({ quantity })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error("Erro ao atualizar: " + e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pdv_product_compositions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error("Erro ao remover: " + e.message),
  });

  return {
    groups: data || [],
    isLoading,
    createGroup,
    updateGroup,
    deleteGroup,
    addItem,
    updateItemQuantity,
    removeItem,
  };
}
