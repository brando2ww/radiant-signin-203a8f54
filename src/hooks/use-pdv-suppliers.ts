import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PDVSupplier {
  id: string;
  user_id: string;
  name: string;
  company_name?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  state_registration?: string | null;
  municipal_registration?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  neighborhood?: string | null;
  address_complement?: string | null;
  ibge_code?: string | null;
  is_billing_address?: boolean;
  notes?: string | null;
  commercial_notes?: string | null;
  financial_notes?: string | null;
  payment_terms?: string | null;
  delivery_time?: number | null;
  delivery_time_unit?: string | null;
  credit_limit?: number | null;
  preferred_payment_method?: string | null;
  category?: string | null;
  contacts?: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function usePDVSuppliers() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['pdv-suppliers', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('pdv_suppliers')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;
      return data as PDVSupplier[];
    },
    enabled: !!user?.id,
  });

  return {
    suppliers: data || [],
    isLoading,
  };
}

export function useCreateSupplier() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (supplier: Omit<PDVSupplier, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('pdv_suppliers')
        .insert({
          ...supplier,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-suppliers'] });
      toast.success('Fornecedor criado com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao criar fornecedor:', error);
      toast.error('Erro ao criar fornecedor');
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PDVSupplier> }) => {
      const { data, error } = await supabase
        .from('pdv_suppliers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-suppliers'] });
      toast.success('Fornecedor atualizado com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao atualizar fornecedor:', error);
      toast.error('Erro ao atualizar fornecedor');
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pdv_suppliers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-ingredients'] });
      toast.success('Fornecedor excluído com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao excluir fornecedor:', error);
      toast.error('Erro ao excluir fornecedor');
    },
  });
}
