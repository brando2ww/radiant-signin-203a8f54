import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface QuotationItem {
  id: string;
  quotation_request_id: string;
  ingredient_id: string;
  quantity_needed: number;
  unit: string;
  notes: string | null;
  created_at: string;
  ingredient?: {
    id: string;
    name: string;
    unit: string;
  };
  responses?: QuotationResponse[];
}

export interface QuotationResponse {
  id: string;
  quotation_item_id: string;
  supplier_id: string;
  unit_price: number | null;
  total_price: number | null;
  expiration_date: string | null;
  delivery_days: number | null;
  minimum_order: number | null;
  payment_terms: string | null;
  brand: string | null;
  /** resfriado | congelado | ambiente (seco). null = não informado. */
  conservation: string | null;
  origin: string | null;
  notes: string | null;
  is_winner: boolean;
  received_at: string;
  created_at: string;
  supplier?: {
    id: string;
    name: string;
    phone: string | null;
    whatsapp?: string | null;
  };
}

export interface QuotationRequest {
  id: string;
  user_id: string;
  request_number: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  deadline: string | null;
  notes: string | null;
  message_template: string | null;
  created_at: string;
  updated_at: string;
  items?: QuotationItem[];
}

export interface CreateQuotationData {
  deadline?: string;
  notes?: string;
  message_template?: string;
  items: {
    ingredient_id: string;
    quantity_needed: number;
    unit: string;
    notes?: string;
    selected_suppliers?: string[];
  }[];
}

export interface CreateResponseData {
  quotation_item_id: string;
  supplier_id: string;
  unit_price?: number;
  total_price?: number;
  expiration_date?: string;
  delivery_days?: number;
  minimum_order?: number;
  payment_terms?: string;
  brand?: string;
  conservation?: string;
  origin?: string;
  notes?: string;
}

export function usePDVQuotations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Generate next request number
  const generateRequestNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from('pdv_quotation_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .gte('created_at', `${year}-01-01`);

    const nextNumber = (count || 0) + 1;
    return `COT-${year}-${String(nextNumber).padStart(4, '0')}`;
  };

  // Fetch all quotation requests
  const { data: quotations = [], isLoading } = useQuery({
    queryKey: ['pdv-quotations', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('pdv_quotation_requests')
        .select(`
          *,
          items:pdv_quotation_items(
            *,
            ingredient:pdv_ingredients(id, name, unit),
            responses:pdv_quotation_responses(
              *,
              supplier:pdv_suppliers(id, name, phone, whatsapp)
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as QuotationRequest[];
    },
    enabled: !!user,
  });

  // Realtime: fornecedor enviou o orçamento pelo link → o vínculo é atualizado
  // (status/submitted_at). Recarrega as cotações para refletir as respostas ao vivo.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`quotation-links-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pdv_quotation_supplier_links', filter: `user_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ['pdv-quotations', user.id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  // Create quotation request
  const createQuotation = useMutation({
    mutationFn: async (data: CreateQuotationData) => {
      if (!user) throw new Error('Usuário não autenticado');

      const requestNumber = await generateRequestNumber();

      // Create the request
      const { data: request, error: requestError } = await supabase
        .from('pdv_quotation_requests')
        .insert({
          user_id: user.id,
          request_number: requestNumber,
          deadline: data.deadline,
          notes: data.notes,
          message_template: data.message_template,
          status: 'pending',
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Create items
      const itemsToInsert = data.items.map((item) => ({
        quotation_request_id: request.id,
        ingredient_id: item.ingredient_id,
        quantity_needed: item.quantity_needed,
        unit: item.unit,
        notes: item.notes,
      }));

      const { data: createdItems, error: itemsError } = await supabase
        .from('pdv_quotation_items')
        .insert(itemsToInsert)
        .select('id, ingredient_id');

      if (itemsError) throw itemsError;

      // Insert selected suppliers for each item
      if (createdItems && createdItems.length > 0) {
        const supplierLinks: { quotation_item_id: string; supplier_id: string }[] = [];

        createdItems.forEach((createdItem) => {
          const originalItem = data.items.find(i => i.ingredient_id === createdItem.ingredient_id);
          if (originalItem?.selected_suppliers) {
            originalItem.selected_suppliers.forEach((supplierId) => {
              supplierLinks.push({
                quotation_item_id: createdItem.id,
                supplier_id: supplierId,
              });
            });
          }
        });

        if (supplierLinks.length > 0) {
          const { error: suppliersError } = await supabase
            .from('pdv_quotation_item_suppliers')
            .insert(supplierLinks);

          if (suppliersError) throw suppliersError;
        }
      }

      return request;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-quotations'] });
      toast.success('Cotação criada com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao criar cotação');
    },
  });

  // Update quotation status
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: QuotationRequest['status'] }) => {
      const { error } = await supabase
        .from('pdv_quotation_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-quotations'] });
      toast.success('Status atualizado!');
    },
    onError: () => {
      toast.error('Erro ao atualizar status');
    },
  });

  // Add response from supplier
  const addResponse = useMutation({
    mutationFn: async (data: CreateResponseData) => {
      const { data: response, error } = await supabase
        .from('pdv_quotation_responses')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-quotations'] });
      toast.success('Resposta registrada!');
    },
    onError: () => {
      toast.error('Erro ao registrar resposta');
    },
  });

  // Update response
  const updateResponse = useMutation({
    mutationFn: async ({ id, ...data }: Partial<CreateResponseData> & { id: string }) => {
      const { error } = await supabase
        .from('pdv_quotation_responses')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-quotations'] });
      toast.success('Resposta atualizada!');
    },
    onError: () => {
      toast.error('Erro ao atualizar resposta');
    },
  });

  // Set winner
  const setWinner = useMutation({
    mutationFn: async ({ responseId, quotationItemId }: { responseId: string; quotationItemId: string }) => {
      // Unset all winners for this item
      await supabase
        .from('pdv_quotation_responses')
        .update({ is_winner: false })
        .eq('quotation_item_id', quotationItemId);

      // Set the winner
      const { error } = await supabase
        .from('pdv_quotation_responses')
        .update({ is_winner: true })
        .eq('id', responseId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-quotations'] });
      toast.success('Vencedor definido!');
    },
    onError: () => {
      toast.error('Erro ao definir vencedor');
    },
  });

  // Delete quotation
  const deleteQuotation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pdv_quotation_requests')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-quotations'] });
      toast.success('Cotação excluída!');
    },
    onError: () => {
      toast.error('Erro ao excluir cotação');
    },
  });

  // Get quotation stats
  const stats = {
    total: quotations.length,
    pending: quotations.filter((q) => q.status === 'pending').length,
    inProgress: quotations.filter((q) => q.status === 'in_progress').length,
    completed: quotations.filter((q) => q.status === 'completed').length,
  };

  return {
    quotations,
    isLoading,
    stats,
    createQuotation,
    updateStatus,
    addResponse,
    updateResponse,
    setWinner,
    deleteQuotation,
  };
}
