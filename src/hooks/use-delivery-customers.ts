import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DeliveryCustomer {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  cpf: string | null;
  birth_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryAddress {
  id: string;
  customer_id: string;
  label: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string | null;
  reference: string | null;
  is_default: boolean;
  created_at: string;
}

export const useGetOrCreateCustomer = () => {
  return useMutation({
    mutationFn: async (phone: string) => {
      // Try to find existing customer
      const { data: existing, error: searchError } = await supabase
        .from("delivery_customers")
        .select("*")
        .eq("phone", phone)
        .maybeSingle();

      if (searchError) throw searchError;

      if (existing) {
        return existing as DeliveryCustomer;
      }

      // Create new customer
      const { data: newCustomer, error: createError } = await supabase
        .from("delivery_customers")
        .insert({ phone, name: "" })
        .select()
        .single();

      if (createError) throw createError;
      return newCustomer as DeliveryCustomer;
    },
  });
};

export const useUpdateCustomer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<DeliveryCustomer>;
    }) => {
      const { data, error } = await supabase
        .from("delivery_customers")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-customer"] });
    },
  });
};

/**
 * Endereços salvos NESTE aparelho, por cliente. Quem pede sem conta só vê os
 * endereços que salvou aqui: listar pelo telefone mostraria o endereço de
 * qualquer pessoa para quem soubesse o número dela (vazamento de 23/10/2026).
 */
const chaveEnderecos = (customerId: string) => `pm:enderecos:${customerId}`;
const enderecosDoAparelho = (customerId: string): string[] => {
  try {
    const raw = localStorage.getItem(chaveEnderecos(customerId));
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const lembrarEndereco = (customerId: string, id: string) => {
  try {
    const ids = enderecosDoAparelho(customerId);
    if (!ids.includes(id)) {
      localStorage.setItem(chaveEnderecos(customerId), JSON.stringify([id, ...ids].slice(0, 20)));
    }
  } catch {
    // sem armazenamento: o endereço vale só para este pedido
  }
};

export const useCustomerAddresses = (customerId: string) => {
  return useQuery({
    queryKey: ["delivery-addresses", customerId],
    queryFn: async () => {
      // Pelo servidor: com conta, todos os endereços do cliente; sem conta,
      // só os que este aparelho salvou.
      const { data, error } = await supabase.rpc("delivery_enderecos_listar" as any, {
        p_customer_id: customerId,
        p_ids: enderecosDoAparelho(customerId),
      });

      if (error) throw error;
      return (data ?? []) as DeliveryAddress[];
    },
    enabled: !!customerId,
  });
};

export const useCreateAddress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (address: Omit<DeliveryAddress, "id" | "created_at">) => {
      const { customer_id, ...resto } = address as any;
      const { data, error } = await supabase.rpc("delivery_endereco_salvar" as any, {
        p_customer_id: customer_id,
        p: resto,
      });

      if (error) throw error;
      const salvo = (Array.isArray(data) ? data[0] : data) as DeliveryAddress;
      lembrarEndereco(customer_id, salvo.id);
      return salvo;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-addresses", data.customer_id] });
      toast.success("Endereço salvo com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao salvar endereço: " + error.message);
    },
  });
};

export const useCreateOrder = () => {
  return useMutation({
    mutationFn: async (orderData: {
      userId: string;
      customerId: string;
      customerName: string;
      customerPhone: string;
      addressId?: string;
      addressText?: string;
      orderType: "delivery" | "pickup";
      subtotal: number;
      deliveryFee: number;
      discount: number;
      couponCode?: string;
      total: number;
      paymentMethod: string;
      changeFor?: number;
      notes?: string;
      idempotencyKey?: string;
      scheduledFor?: string;
      items: {
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        notes?: string;
        options: {
          optionName: string;
          itemName: string;
          itemId?: string;
          priceAdjustment: number;
          quantity?: number;
        }[];
      }[];
    }) => {
      // Chave de idempotência: previne pedidos duplicados em duplo clique,
      // retry de rede ou reenvio do formulário. O servidor devolve o pedido
      // que já existe quando a chave se repete.
      const idempotencyKey =
        orderData.idempotencyKey ??
        (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

      // Pedido, itens, adicionais e número numa transação só, no servidor.
      // A tela gravava em quatro chamadas e relia cada uma, o que exigia a
      // tabela de pedidos aberta para leitura de qualquer pessoa (vazamento
      // de 23/10/2026). O uso do cupom é contado pelo gatilho do banco; a
      // tela somava de novo e o cupom gastava em dobro.
      const { data: order, error } = await supabase.rpc("delivery_pedido_criar" as any, {
        p: { ...orderData, idempotencyKey },
      });
      if (error) throw error;
      return order;
    },
    onSuccess: () => {
      toast.success("Pedido realizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar pedido: " + error.message);
    },
  });
};
