import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PDVInvoice {
  id: string;
  user_id: string;
  invoice_number: string;
  invoice_key: string;
  series?: string | null;
  emission_date: string;
  entry_date?: string | null;
  supplier_id?: string | null;
  supplier_cnpj: string;
  supplier_name: string;
  total_products: number;
  total_tax: number;
  total_invoice: number;
  freight_value?: number | null;
  insurance_value?: number | null;
  other_expenses?: number | null;
  discount_value?: number | null;
  operation_type: string;
  invoice_type: string;
  xml_url?: string | null;
  pdf_url?: string | null;
  status: string;
  financial_transaction_id?: string | null;
  notes?: string | null;
  import_errors?: any;
  created_at: string;
  source?: string;
  updated_at: string;
}

export interface PDVInvoiceItem {
  id: string;
  invoice_id: string;
  item_number: number;
  product_code?: string | null;
  product_ean?: string | null;
  product_name: string;
  ncm?: string | null;
  cfop?: string | null;
  unit: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  discount_value?: number | null;
  freight_value?: number | null;
  insurance_value?: number | null;
  other_expenses?: number | null;
  icms_value?: number | null;
  ipi_value?: number | null;
  pis_value?: number | null;
  cofins_value?: number | null;
  ingredient_id?: string | null;
  match_status: string;
  suggested_ingredient_id?: string | null;
  created_at: string;
}

export function usePDVInvoices(filters?: {
  status?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['pdv-invoices', user?.id, filters],
    queryFn: async () => {
      if (!user?.id) return [];

      let query = supabase
        .from('pdv_invoices')
        .select('*')
        .eq('user_id', user.id);

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.startDate) {
        query = query.gte('emission_date', filters.startDate.toISOString());
      }

      if (filters?.endDate) {
        query = query.lte('emission_date', filters.endDate.toISOString());
      }

      const { data, error } = await query.order('emission_date', { ascending: false });

      if (error) throw error;
      return data as PDVInvoice[];
    },
    enabled: !!user?.id,
  });

  return {
    invoices: data || [],
    isLoading,
    error,
  };
}

export function usePDVInvoiceItems(invoiceId?: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['pdv-invoice-items', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [];

      const { data, error } = await supabase
        .from('pdv_invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('item_number');

      if (error) throw error;
      return data as PDVInvoiceItem[];
    },
    enabled: !!invoiceId,
  });

  return {
    items: data || [],
    isLoading,
  };
}

export function useCreateInvoice() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoice: Omit<PDVInvoice, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('pdv_invoices')
        .insert({
          ...invoice,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-invoices'] });
      toast.success('Nota fiscal importada com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao importar nota fiscal:', error);
      toast.error('Erro ao importar nota fiscal');
    },
  });
}

export function useCreateInvoiceItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: Omit<PDVInvoiceItem, 'id' | 'created_at'>[]) => {
      const { data, error } = await supabase
        .from('pdv_invoice_items')
        .insert(items)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      if (variables.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['pdv-invoice-items', variables[0].invoice_id] });
      }
    },
    onError: (error) => {
      console.error('Erro ao criar itens da nota:', error);
      toast.error('Erro ao criar itens da nota fiscal');
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PDVInvoice> }) => {
      const { data, error } = await supabase
        .from('pdv_invoices')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-invoices'] });
      toast.success('Nota fiscal atualizada!');
    },
    onError: (error) => {
      console.error('Erro ao atualizar nota:', error);
      toast.error('Erro ao atualizar nota fiscal');
    },
  });
}

// useFetchNFeAutomatica removido — busca automática SEFAZ via Nuvem Fiscal
// não é mais suportada. Use o botão "Importar NF-e" para enviar XML/PDF manualmente.

export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pdv_invoices')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-invoices'] });
      toast.success('Nota fiscal excluída!');
    },
    onError: (error) => {
      console.error('Erro ao excluir nota:', error);
      toast.error('Erro ao excluir nota fiscal');
    },
  });
}
