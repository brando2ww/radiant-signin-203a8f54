import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  ingredient_id: string;
  quotation_response_id: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  quantity_received: number;
  notes: string | null;
  created_at: string;
  ingredient?: {
    id: string;
    name: string;
    unit: string;
  };
}

export interface PurchaseOrder {
  id: string;
  user_id: string;
  supplier_id: string | null;
  quotation_request_id: string | null;
  order_number: string;
  status: 'draft' | 'sent' | 'confirmed' | 'partial' | 'received' | 'cancelled';
  order_date: string;
  expected_delivery: string | null;
  actual_delivery: string | null;
  subtotal: number;
  discount: number;
  freight: number;
  total: number;
  payment_terms: string | null;
  notes: string | null;
  whatsapp_sent_at: string | null;
  /** Token do link público /pedido/:token que vai no WhatsApp do fornecedor. */
  public_token?: string;
  /** Quando o fornecedor abriu o link — mostra se a mensagem chegou de fato. */
  supplier_viewed_at?: string | null;
  supplier_confirmed_at?: string | null;
  supplier_note?: string | null;
  /** Encerrado com itens faltando, por decisão do gestor. */
  closed_incomplete?: boolean;
  /** Justificativa obrigatória quando closed_incomplete. */
  closure_reason?: string | null;
  created_at: string;
  updated_at: string;
  supplier?: {
    id: string;
    name: string;
    phone: string | null;
  };
  items?: PurchaseOrderItem[];
}

export interface CreatePurchaseOrderData {
  supplier_id: string;
  quotation_request_id?: string;
  expected_delivery?: string;
  discount?: number;
  freight?: number;
  payment_terms?: string;
  notes?: string;
  items: {
    ingredient_id: string;
    quotation_response_id?: string;
    quantity: number;
    unit: string;
    unit_price: number;
  }[];
}

export function usePDVPurchaseOrders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Generate next order number
  const generateOrderNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from('pdv_purchase_orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .gte('created_at', `${year}-01-01`);

    const nextNumber = (count || 0) + 1;
    return `PC-${year}-${String(nextNumber).padStart(4, '0')}`;
  };

  // Fetch all purchase orders
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['pdv-purchase-orders', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('pdv_purchase_orders')
        .select(`
          *,
          supplier:pdv_suppliers(id, name, phone),
          items:pdv_purchase_order_items(
            *,
            ingredient:pdv_ingredients(id, name, unit)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PurchaseOrder[];
    },
    enabled: !!user,
  });

  // Create purchase order
  const createOrder = useMutation({
    mutationFn: async (data: CreatePurchaseOrderData) => {
      if (!user) throw new Error('Usuário não autenticado');

      const orderNumber = await generateOrderNumber();

      // Calculate totals
      const subtotal = data.items.reduce(
        (sum, item) => sum + item.quantity * item.unit_price,
        0
      );
      const total = subtotal - (data.discount || 0) + (data.freight || 0);

      // Create the order
      const { data: order, error: orderError } = await supabase
        .from('pdv_purchase_orders')
        .insert({
          user_id: user.id,
          supplier_id: data.supplier_id,
          quotation_request_id: data.quotation_request_id,
          order_number: orderNumber,
          expected_delivery: data.expected_delivery,
          discount: data.discount || 0,
          freight: data.freight || 0,
          subtotal,
          total,
          payment_terms: data.payment_terms,
          notes: data.notes,
          status: 'draft',
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create items
      const items = data.items.map((item) => ({
        purchase_order_id: order.id,
        ingredient_id: item.ingredient_id,
        quotation_response_id: item.quotation_response_id,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
      }));

      const { error: itemsError } = await supabase
        .from('pdv_purchase_order_items')
        .insert(items);

      if (itemsError) throw itemsError;

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-purchase-orders'] });
      toast.success('Pedido de compra criado!');
    },
    onError: () => {
      toast.error('Erro ao criar pedido de compra');
    },
  });

  // Update order status
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PurchaseOrder['status'] }) => {
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'received') {
        updates.actual_delivery = new Date().toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from('pdv_purchase_orders')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-purchase-orders'] });
      toast.success('Status atualizado!');
    },
    onError: () => {
      toast.error('Erro ao atualizar status');
    },
  });

  // Mark as sent via WhatsApp
  const markAsSent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pdv_purchase_orders')
        .update({
          status: 'sent',
          whatsapp_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-purchase-orders'] });
      toast.success('Pedido marcado como enviado!');
    },
    onError: () => {
      toast.error('Erro ao marcar como enviado');
    },
  });

  // Update received quantities
  const updateReceivedQuantity = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      const { error } = await supabase
        .from('pdv_purchase_order_items')
        .update({ quantity_received: quantity })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-purchase-orders'] });
      toast.success('Quantidade atualizada!');
    },
    onError: () => {
      toast.error('Erro ao atualizar quantidade');
    },
  });

  // Recebimento: dá entrada no estoque, registra a movimentação e recalcula o
  // custo médio (tudo na função pdv_receive_purchase_order, em transação).
  const receiveOrder = useMutation({
    mutationFn: async ({
      orderId,
      items,
      closeIncomplete,
      closeReason,
    }: {
      orderId: string;
      items: Array<{ item_id: string; quantity: number }>;
      /** Encerra o pedido mesmo faltando mercadoria (fornecedor não entregará). */
      closeIncomplete?: boolean;
      closeReason?: string;
    }) => {
      const { data, error } = await (supabase as any).rpc('pdv_receive_purchase_order', {
        p_order_id: orderId,
        p_items: items,
        p_close_incomplete: closeIncomplete ?? false,
        p_close_reason: closeReason ?? null,
      });

      if (error) throw error;
      return data as {
        status: string;
        items_moved: number;
        items_pending: number;
        closed_incomplete?: boolean;
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pdv-purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-stock-movements'] });

      if (result?.closed_incomplete) {
        toast.success(
          `Pedido encerrado com ${result.items_pending} item(ns) não entregue(s). O motivo ficou registrado.`
        );
      } else if (result?.status === 'partial') {
        toast.success(
          `Recebimento parcial registrado. ${result.items_pending} item(ns) ainda em falta.`
        );
      } else {
        toast.success('Pedido recebido e estoque atualizado!');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao registrar o recebimento');
    },
  });

  // Delete order
  const deleteOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pdv_purchase_orders')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-purchase-orders'] });
      toast.success('Pedido excluído!');
    },
    onError: () => {
      toast.error('Erro ao excluir pedido');
    },
  });

  // Stats
  const stats = {
    total: orders.length,
    draft: orders.filter((o) => o.status === 'draft').length,
    sent: orders.filter((o) => o.status === 'sent').length,
    confirmed: orders.filter((o) => o.status === 'confirmed').length,
    received: orders.filter((o) => o.status === 'received').length,
    totalValue: orders
      .filter((o) => !['cancelled', 'received'].includes(o.status))
      .reduce((sum, o) => sum + o.total, 0),
  };

  return {
    orders,
    isLoading,
    stats,
    createOrder,
    updateStatus,
    markAsSent,
    updateReceivedQuantity,
    receiveOrder,
    deleteOrder,
  };
}
