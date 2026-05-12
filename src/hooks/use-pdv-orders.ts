import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { resolveProductionCenterId } from "@/utils/resolveProductionCenter";
import { expandComposition } from "@/utils/expandComposition";
import { toast } from "sonner";

export interface PDVOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
  modifiers: any;
  kitchen_status: string;
  assigned_to_person: number | null;
  added_by: string | null;
  added_at: string;
  sent_to_kitchen_at: string | null;
  ready_at: string | null;
  created_at: string;
  weight: number | null;
}

export interface PDVOrder {
  id: string;
  user_id: string;
  order_number: string;
  source: string;
  table_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  status: string;
  subtotal: number;
  service_fee: number;
  discount: number;
  total: number;
  opened_by: string | null;
  opened_at: string;
  closed_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  delivery_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export function usePDVOrders() {
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["pdv-orders", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("pdv_orders")
        .select("*")
        .eq("user_id", visibleUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as PDVOrder[];
    },
    enabled: !!visibleUserId,
  });

  const { data: orderItems } = useQuery({
    queryKey: ["pdv-order-items", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");

      const orderIds = orders?.map(o => o.id) || [];
      if (orderIds.length === 0) return [];

      const { data, error } = await supabase
        .from("pdv_order_items")
        .select("*")
        .in("order_id", orderIds);

      if (error) throw error;
      return data as PDVOrderItem[];
    },
    enabled: !!user && !!orders && orders.length > 0,
  });

  const createOrder = useMutation({
    mutationFn: async (order: {
      source: string;
      table_id?: string;
      customer_name?: string;
    }) => {
      if (!user) throw new Error("Usuário não autenticado");
      const ownerId = visibleUserId || user.id;

      // Gerar número do pedido
      const orderNumber = `PDV${Date.now().toString().slice(-6)}`;

      const { data, error } = await supabase
        .from("pdv_orders")
        .insert({
          user_id: ownerId,
          order_number: orderNumber,
          source: order.source,
          table_id: order.table_id || null,
          customer_name: order.customer_name || null,
          status: "aberta",
          subtotal: 0,
          service_fee: 0,
          discount: 0,
          total: 0,
          opened_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Reserva número sequencial do turno (caixa aberto)
      if (data?.id) {
        await supabase.rpc("pdv_assign_order_ticket" as any, { p_order_id: data.id });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
      toast.success("Pedido criado com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao criar pedido: " + error.message);
    },
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PDVOrder> }) => {
      const { data, error } = await supabase
        .from("pdv_orders")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar pedido: " + error.message);
    },
  });

  const addItem = useMutation({
    mutationFn: async (item: {
      order_id: string;
      product_id: string;
      product_name: string;
      quantity: number;
      unit_price: number;
      notes?: string;
      modifiers?: any;
      kitchen_status?: string;
    }) => {
      if (!user) throw new Error("Usuário não autenticado");

      const subtotal = item.quantity * item.unit_price;
      const ownerId = visibleUserId || user.id;
      const production_center_id = await resolveProductionCenterId(item.product_id, ownerId);

      const { data, error } = await supabase
        .from("pdv_order_items")
        .insert({
          order_id: item.order_id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal,
          notes: item.notes || null,
          modifiers: item.modifiers || null,
          kitchen_status: item.kitchen_status || "pendente",
          added_by: user.id,
          production_center_id,
        })
        .select()
        .single();

      if (error) throw error;

      // Expandir produto composto: cria filhos invisíveis para roteamento de cozinha
      const children = await expandComposition(item.product_id, item.quantity, ownerId);
      if (children.length > 0) {
        const missing = children.filter((c) => !c.production_center_id);
        if (missing.length > 0) {
          toast.warning(
            `${missing.length} sub-produto(s) sem centro de produção configurado e não serão impressos.`,
          );
        }
        const childRows = children.map((c) => ({
          order_id: item.order_id,
          product_id: c.product_id,
          product_name: c.product_name,
          quantity: c.quantity,
          unit_price: 0,
          subtotal: 0,
          notes: null,
          modifiers: null,
          kitchen_status: item.kitchen_status || "pendente",
          added_by: user.id,
          production_center_id: c.production_center_id,
          parent_item_id: data.id,
          is_composite_child: true,
        }));
        const { error: childError } = await supabase
          .from("pdv_order_items")
          .insert(childRows);
        if (childError) {
          toast.error("Erro ao expandir composição: " + childError.message);
        }
      }

      // Atualizar totais do pedido
      const order = orders?.find(o => o.id === item.order_id);
      if (order) {
        const newSubtotal = order.subtotal + subtotal;
        const newTotal = newSubtotal + order.service_fee - order.discount;
        
        await supabase
          .from("pdv_orders")
          .update({ subtotal: newSubtotal, total: newTotal })
          .eq("id", item.order_id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-order-items"] });
      toast.success("Item adicionado ao pedido");
    },
    onError: (error: any) => {
      toast.error("Erro ao adicionar item: " + error.message);
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PDVOrderItem> }) => {
      const { data, error } = await supabase
        .from("pdv_order_items")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-order-items"] });
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar item: " + error.message);
    },
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const item = orderItems?.find(i => i.id === id);
      if (!item) throw new Error("Item não encontrado");

      const { error } = await supabase
        .from("pdv_order_items")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Atualizar totais do pedido
      const order = orders?.find(o => o.id === item.order_id);
      if (order) {
        const newSubtotal = order.subtotal - item.subtotal;
        const newTotal = newSubtotal + order.service_fee - order.discount;
        
        await supabase
          .from("pdv_orders")
          .update({ subtotal: newSubtotal, total: newTotal })
          .eq("id", item.order_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-order-items"] });
      toast.success("Item removido do pedido");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover item: " + error.message);
    },
  });

  const closeOrder = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("pdv_orders")
        .update({
          status: "fechada",
          closed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
      toast.success("Pedido fechado");
    },
    onError: (error: any) => {
      toast.error("Erro ao fechar pedido: " + error.message);
    },
  });

  const cancelOrder = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await supabase.rpc("pdv_cancel_order", {
        p_order_id: id,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      toast.success("Mesa cancelada");
    },
    onError: (error: any) => {
      toast.error("Erro ao cancelar pedido: " + error.message);
    },
  });

  return {
    orders: orders || [],
    orderItems: orderItems || [],
    isLoading,
    createOrder: createOrder.mutate,
    isCreating: createOrder.isPending,
    updateOrder: updateOrder.mutate,
    isUpdating: updateOrder.isPending,
    addItem: addItem.mutate,
    isAddingItem: addItem.isPending,
    updateItem: updateItem.mutate,
    isUpdatingItem: updateItem.isPending,
    removeItem: removeItem.mutate,
    isRemovingItem: removeItem.isPending,
    closeOrder: closeOrder.mutate,
    isClosing: closeOrder.isPending,
    cancelOrder: cancelOrder.mutate,
    isCancelling: cancelOrder.isPending,
  };
}
