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

export const useCustomerAddresses = (customerId: string) => {
  return useQuery({
    queryKey: ["delivery-addresses", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_addresses")
        .select("*")
        .eq("customer_id", customerId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as DeliveryAddress[];
    },
    enabled: !!customerId,
  });
};

export const useCreateAddress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      address: Omit<DeliveryAddress, "id" | "created_at">
    ) => {
      // If this is set as default, unset all others first
      if (address.is_default) {
        await supabase
          .from("delivery_addresses")
          .update({ is_default: false })
          .eq("customer_id", address.customer_id);
      }

      const { data, error } = await supabase
        .from("delivery_addresses")
        .insert(address)
        .select()
        .single();

      if (error) throw error;
      return data;
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
        }[];
      }[];
    }) => {
      // Generate order number
      const orderNumber = `#${Date.now().toString().slice(-8)}`;

      // Create order
      const { data: order, error: orderError } = await supabase
        .from("delivery_orders")
        .insert({
          order_number: orderNumber,
          user_id: orderData.userId,
          customer_id: orderData.customerId,
          customer_name: orderData.customerName,
          customer_phone: orderData.customerPhone,
          delivery_address_id: orderData.addressId || null,
          delivery_address_text: orderData.addressText || null,
          order_type: orderData.orderType,
          status: "pending",
          subtotal: orderData.subtotal,
          delivery_fee: orderData.deliveryFee,
          discount: orderData.discount,
          coupon_code: orderData.couponCode || null,
          total: orderData.total,
          payment_method: orderData.paymentMethod,
          payment_status: "pending",
          change_for: orderData.changeFor || null,
          notes: orderData.notes || null,
          estimated_time: 45,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const itemsToInsert = orderData.items.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.subtotal,
        notes: item.notes || null,
      }));

      const { data: orderItems, error: itemsError } = await supabase
        .from("delivery_order_items")
        .insert(itemsToInsert)
        .select();

      if (itemsError) throw itemsError;

      // production_center_id é resolvido automaticamente por trigger no servidor
      // (delivery_resolve_item_center) — sem necessidade de UPDATE no cliente.

      // Create order item options
      const optionsToInsert: any[] = [];
      orderData.items.forEach((item, index) => {
        const orderItemId = orderItems[index].id;
        item.options.forEach((option) => {
          optionsToInsert.push({
            order_item_id: orderItemId,
            option_name: option.optionName,
            item_name: option.itemName,
            option_item_id: option.itemId || null,
            price_adjustment: option.priceAdjustment,
          });
        });
      });

      if (optionsToInsert.length > 0) {
        const { error: optionsError } = await supabase
          .from("delivery_order_item_options")
          .insert(optionsToInsert);

        if (optionsError) throw optionsError;
      }

      // Update coupon usage if applicable
      if (orderData.couponCode) {
        // Increment coupon usage count
        const { data: coupon } = await supabase
          .from("delivery_coupons")
          .select("usage_count")
          .eq("code", orderData.couponCode)
          .single();

        if (coupon) {
          await supabase
            .from("delivery_coupons")
            .update({ usage_count: coupon.usage_count + 1 })
            .eq("code", orderData.couponCode);
        }
      }

      return order;
    },
    onSuccess: () => {
      toast.success("Pedido realizado com sucesso! 🎉");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar pedido: " + error.message);
    },
  });
};
