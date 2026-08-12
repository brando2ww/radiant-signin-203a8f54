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
  /**
   * sem_estoque | nao_trabalha | em_falta. Preenchido = o fornecedor declarou
   * que não pode ofertar; a linha vem sem preço e fica fora do comparativo.
   */
  unavailable_reason: string | null;
  /** Preço como o fornecedor enviou, quando o comprador corrigiu o unit_price. */
  original_unit_price: number | null;
  corrected_at: string | null;
  is_winner: boolean;
  received_at: string;
  created_at: string;
  supplier?: {
    id: string;
    name: string;
    phone: string | null;
    whatsapp?: string | null;
    /** Pedido mínimo do fornecedor. 0 = não tem. null = não informado. */
    minimum_order?: number | null;
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

export interface UpdateQuotationData {
  id: string;
  deadline?: string;
  notes?: string;
  items: {
    /** Presente = item que já existe no banco. Ausente = item novo. */
    id?: string;
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
              supplier:pdv_suppliers(id, name, phone, whatsapp, minimum_order)
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

  // Edita uma cotação já criada: mexer em quantidade, trocar/remover item ou
  // acrescentar item novo antes que os fornecedores respondam.
  //
  // É uma reconciliação, não um "apaga tudo e recria": os vínculos de
  // fornecedor carregam `sent_at` (quem já recebeu o link) e as respostas
  // penduram no id do item. Recriar zeraria as duas coisas.
  const updateQuotation = useMutation({
    mutationFn: async (data: UpdateQuotationData) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error: requestError } = await supabase
        .from('pdv_quotation_requests')
        .update({
          deadline: data.deadline,
          notes: data.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      if (requestError) throw requestError;

      const { data: currentItems, error: currentError } = await supabase
        .from('pdv_quotation_items')
        .select('id, responses:pdv_quotation_responses(id)')
        .eq('quotation_request_id', data.id);

      if (currentError) throw currentError;

      const keptIds = new Set(
        data.items.map((i) => i.id).filter((id): id is string => !!id)
      );
      const removedItems = (currentItems || []).filter((i) => !keptIds.has(i.id));

      // Item com resposta guarda o preço que o fornecedor mandou. Apagar
      // destruiria a cotação recebida — melhor falhar alto do que perder.
      if (removedItems.some((i) => (i.responses?.length || 0) > 0)) {
        throw new Error(
          'Não dá para remover um item que já recebeu resposta de fornecedor.'
        );
      }

      if (removedItems.length > 0) {
        const { error } = await supabase
          .from('pdv_quotation_items')
          .delete()
          .in('id', removedItems.map((i) => i.id));
        if (error) throw error;
      }

      // Itens que continuam: atualiza em vez de recriar, preservando o id.
      for (const item of data.items) {
        if (!item.id) continue;
        const { error } = await supabase
          .from('pdv_quotation_items')
          .update({
            ingredient_id: item.ingredient_id,
            quantity_needed: item.quantity_needed,
            unit: item.unit,
            notes: item.notes,
          })
          .eq('id', item.id);
        if (error) throw error;
      }

      // Itens novos, um a um: o insert em lote não garante a ordem de retorno,
      // e a lista pode repetir o mesmo ingrediente — casar pelo ingredient_id
      // atribuiria os fornecedores à linha errada.
      const itemSupplierTargets: { itemId: string; supplierIds: string[] }[] =
        data.items
          .filter((i) => i.id)
          .map((i) => ({ itemId: i.id as string, supplierIds: i.selected_suppliers || [] }));

      for (const item of data.items) {
        if (item.id) continue;
        const { data: created, error } = await supabase
          .from('pdv_quotation_items')
          .insert({
            quotation_request_id: data.id,
            ingredient_id: item.ingredient_id,
            quantity_needed: item.quantity_needed,
            unit: item.unit,
            notes: item.notes,
          })
          .select('id')
          .single();
        if (error) throw error;
        itemSupplierTargets.push({
          itemId: created.id,
          supplierIds: item.selected_suppliers || [],
        });
      }

      // Fornecedores por item: diff, para não zerar o sent_at de quem já recebeu.
      const itemIds = itemSupplierTargets.map((t) => t.itemId);
      if (itemIds.length > 0) {
        const { data: existingLinks, error: linksError } = await supabase
          .from('pdv_quotation_item_suppliers')
          .select('id, quotation_item_id, supplier_id')
          .in('quotation_item_id', itemIds);

        if (linksError) throw linksError;

        const linkIdsToRemove: string[] = [];
        const linksToAdd: { quotation_item_id: string; supplier_id: string }[] = [];

        for (const target of itemSupplierTargets) {
          const current = (existingLinks || []).filter(
            (l) => l.quotation_item_id === target.itemId
          );
          const desired = new Set(target.supplierIds);

          current
            .filter((l) => !desired.has(l.supplier_id))
            .forEach((l) => linkIdsToRemove.push(l.id));

          const currentIds = new Set(current.map((l) => l.supplier_id));
          target.supplierIds
            .filter((supplierId) => !currentIds.has(supplierId))
            .forEach((supplierId) =>
              linksToAdd.push({
                quotation_item_id: target.itemId,
                supplier_id: supplierId,
              })
            );
        }

        if (linkIdsToRemove.length > 0) {
          const { error } = await supabase
            .from('pdv_quotation_item_suppliers')
            .delete()
            .in('id', linkIdsToRemove);
          if (error) throw error;
        }

        if (linksToAdd.length > 0) {
          const { error } = await supabase
            .from('pdv_quotation_item_suppliers')
            .insert(linksToAdd);
          if (error) throw error;
        }
      }

      return { id: data.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-quotations'] });
      queryClient.invalidateQueries({ queryKey: ['quotation-item-suppliers'] });
      toast.success('Cotação atualizada!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao atualizar cotação');
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
    updateQuotation,
    updateStatus,
    addResponse,
    updateResponse,
    setWinner,
    deleteQuotation,
  };
}
