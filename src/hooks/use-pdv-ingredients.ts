import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PDVIngredient {
  id: string;
  user_id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  unit_cost: number;
  supplier_id?: string | null;
  supplier?: {
    id: string;
    name: string;
  } | null;
  expiration_date: string | null;
  
  // Novos campos básicos
  code?: string;
  category?: string;
  loss_percentage: number;
  selling_price: number;
  icms_rate: number;
  origin: string;
  
  // Controle de saída
  automatic_output: 'none' | 'sale' | 'entry';
  sector?: string;
  cost_center?: string;
  
  // Controles de estoque avançados
  max_stock: number;
  real_cost: number;
  average_cost: number;
  last_entry_date?: string;
  purchase_lot: number;
  current_balance: number;
  
  // Códigos e identificação
  ean?: string;
  ean_quantity: number;
  factory_code?: string;
  observations?: string;
  
  created_at: string;
  updated_at: string;
}

export function usePDVIngredients() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: ingredients, isLoading } = useQuery({
    queryKey: ["pdv-ingredients", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("pdv_ingredients")
        .select(`
          *,
          supplier:pdv_suppliers(id, name)
        `)
        .eq("user_id", user.id)
        .order("name");

      if (error) throw error;
      return data as PDVIngredient[];
    },
    enabled: !!user,
  });

  const createIngredient = useMutation({
    mutationFn: async (ingredient: Omit<PDVIngredient, "id" | "user_id" | "created_at" | "updated_at">) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("pdv_ingredients")
        .insert({ ...ingredient, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-ingredients"] });
      toast.success("Insumo criado com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao criar insumo: " + error.message);
    },
  });

  const updateIngredient = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PDVIngredient> }) => {
      const { data, error } = await supabase
        .from("pdv_ingredients")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-ingredients"] });
      toast.success("Insumo atualizado com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar insumo: " + error.message);
    },
  });

  const deleteIngredient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pdv_ingredients")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-ingredients"] });
      toast.success("Insumo removido com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover insumo: " + error.message);
    },
  });

  const adjustStock = useMutation({
    mutationFn: async ({ id, adjustment, reason }: { id: string; adjustment: number; reason: string }) => {
      const ingredient = ingredients?.find(i => i.id === id);
      if (!ingredient) throw new Error("Insumo não encontrado");

      const newStock = ingredient.current_stock + adjustment;
      if (newStock < 0) throw new Error("Estoque não pode ser negativo");

      const { data, error } = await supabase
        .from("pdv_ingredients")
        .update({ current_stock: newStock })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-ingredients"] });
      toast.success("Estoque ajustado com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao ajustar estoque: " + error.message);
    },
  });

  return {
    ingredients: ingredients || [],
    isLoading,
    createIngredient: createIngredient.mutate,
    // Versão await: quem cria o insumo precisa encadear o vínculo de
    // fornecedores e só encerrar o formulário se as DUAS etapas passarem.
    createIngredientAsync: createIngredient.mutateAsync,
    isCreating: createIngredient.isPending,
    updateIngredient: updateIngredient.mutate,
    updateIngredientAsync: updateIngredient.mutateAsync,
    isUpdating: updateIngredient.isPending,
    deleteIngredient: deleteIngredient.mutate,
    isDeleting: deleteIngredient.isPending,
    adjustStock: adjustStock.mutate,
    isAdjusting: adjustStock.isPending,
  };
}
