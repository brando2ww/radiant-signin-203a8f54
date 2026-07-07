import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface IngredientSupplier {
  id: string;
  user_id: string;
  ingredient_id: string;
  supplier_id: string;
  is_preferred: boolean;
  last_price: number | null;
  last_purchase_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  supplier?: {
    id: string;
    name: string;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    contact_name: string | null;
  };
  ingredient?: {
    id: string;
    name: string;
    unit: string;
  };
}

export interface CreateIngredientSupplierData {
  ingredient_id: string;
  supplier_id: string;
  is_preferred?: boolean;
  notes?: string;
}

export interface UpdateIngredientSupplierData {
  is_preferred?: boolean;
  last_price?: number;
  last_purchase_date?: string;
  notes?: string;
}

export function usePDVIngredientSuppliers(ingredientId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch suppliers for a specific ingredient
  const { data: ingredientSuppliers = [], isLoading } = useQuery({
    queryKey: ['pdv-ingredient-suppliers', user?.id, ingredientId],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from('pdv_ingredient_suppliers')
        .select(`
          *,
          supplier:pdv_suppliers(id, name, phone, whatsapp, email, contact_name),
          ingredient:pdv_ingredients(id, name, unit)
        `)
        .eq('user_id', user.id);

      if (ingredientId) {
        query = query.eq('ingredient_id', ingredientId);
      }

      const { data, error } = await query.order('is_preferred', { ascending: false });

      if (error) throw error;
      return data as IngredientSupplier[];
    },
    enabled: !!user,
  });

  // Fetch all suppliers that can supply a specific ingredient (for selection)
  const { data: availableSuppliers = [] } = useQuery({
    queryKey: ['pdv-suppliers-for-ingredient', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('pdv_suppliers')
        .select('id, name, phone, whatsapp, email, contact_name')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Create ingredient-supplier link
  const createLink = useMutation({
    mutationFn: async (data: CreateIngredientSupplierData) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { data: result, error } = await supabase
        .from('pdv_ingredient_suppliers')
        .insert({
          user_id: user.id,
          ...data,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-ingredient-suppliers'] });
      toast.success('Fornecedor vinculado com sucesso!');
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate')) {
        toast.error('Este fornecedor já está vinculado a este ingrediente');
      } else {
        toast.error('Erro ao vincular fornecedor');
      }
    },
  });

  // Update link
  const updateLink = useMutation({
    mutationFn: async ({ id, ...data }: UpdateIngredientSupplierData & { id: string }) => {
      const { error } = await supabase
        .from('pdv_ingredient_suppliers')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-ingredient-suppliers'] });
      toast.success('Vínculo atualizado!');
    },
    onError: () => {
      toast.error('Erro ao atualizar vínculo');
    },
  });

  // Delete link
  const deleteLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pdv_ingredient_suppliers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-ingredient-suppliers'] });
      toast.success('Fornecedor desvinculado!');
    },
    onError: () => {
      toast.error('Erro ao desvincular fornecedor');
    },
  });

  // Set as preferred supplier
  const setPreferred = useMutation({
    mutationFn: async ({ id, ingredientId }: { id: string; ingredientId: string }) => {
      if (!user) throw new Error('Usuário não autenticado');

      // First, unset all as preferred for this ingredient
      await supabase
        .from('pdv_ingredient_suppliers')
        .update({ is_preferred: false })
        .eq('user_id', user.id)
        .eq('ingredient_id', ingredientId);

      // Then set the selected one as preferred
      const { error } = await supabase
        .from('pdv_ingredient_suppliers')
        .update({ is_preferred: true, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-ingredient-suppliers'] });
      toast.success('Fornecedor preferencial definido!');
    },
    onError: () => {
      toast.error('Erro ao definir fornecedor preferencial');
    },
  });

  return {
    ingredientSuppliers,
    availableSuppliers,
    isLoading,
    createLink,
    updateLink,
    deleteLink,
    setPreferred,
  };
}

// Hook to get all ingredients with their suppliers count
interface IngredientWithSuppliers {
  id: string;
  name: string;
  unit: string;
  current_stock: number | null;
  min_stock: number | null;
  suppliersCount: number;
}

export function useIngredientsWithSuppliers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pdv-ingredients-with-suppliers', user?.id],
    queryFn: async (): Promise<IngredientWithSuppliers[]> => {
      if (!user) return [];

      // Use any to avoid deep type instantiation issues
      const ingredientsResult = await (supabase as any)
        .from('pdv_ingredients')
        .select('id, name, unit, current_stock, min_stock')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');
      
      if (ingredientsResult.error) throw ingredientsResult.error;
      const ingredients = (ingredientsResult.data || []) as Array<{
        id: string;
        name: string;
        unit: string;
        current_stock: number | null;
        min_stock: number | null;
      }>;

      const linksResult = await (supabase as any)
        .from('pdv_ingredient_suppliers')
        .select('ingredient_id, supplier_id')
        .eq('user_id', user.id);

      if (linksResult.error) throw linksResult.error;
      const links = (linksResult.data || []) as Array<{
        ingredient_id: string;
        supplier_id: string;
      }>;

      const supplierCounts: Record<string, number> = {};
      links.forEach((link) => {
        supplierCounts[link.ingredient_id] = (supplierCounts[link.ingredient_id] || 0) + 1;
      });

      return ingredients.map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        current_stock: ingredient.current_stock,
        min_stock: ingredient.min_stock,
        suppliersCount: supplierCounts[ingredient.id] || 0,
      }));
    },
    enabled: !!user,
  });
}