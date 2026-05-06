import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

export interface DeliveryCoupon {
  id: string;
  user_id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  min_order_value: number;
  max_discount: number | null;
  usage_limit: number;
  usage_count: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  created_at: string;
}

export const useDeliveryCoupons = () => {
  return useQuery({
    queryKey: ["delivery-coupons"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("delivery_coupons")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as DeliveryCoupon[];
    },
  });
};

export const useCreateCoupon = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      coupon: Omit<DeliveryCoupon, "id" | "user_id" | "usage_count" | "created_at">
    ) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("delivery_coupons")
        .insert({ 
          ...coupon, 
          user_id: user.id,
          usage_count: 0,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-coupons"] });
      toast.success("Cupom criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar cupom: " + error.message);
    },
  });
};

export const useUpdateCoupon = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<DeliveryCoupon>;
    }) => {
      const { data, error } = await supabase
        .from("delivery_coupons")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-coupons"] });
      toast.success("Cupom atualizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar cupom: " + error.message);
    },
  });
};

export const useDeleteCoupon = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("delivery_coupons")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-coupons"] });
      toast.success("Cupom excluído com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao excluir cupom: " + error.message);
    },
  });
};

export const useValidateCoupon = () => {
  return useMutation({
    mutationFn: async ({
      code,
      orderValue,
      userId,
    }: {
      code: string;
      orderValue: number;
      userId: string;
    }) => {
      const { data, error } = await supabase
        .from("delivery_coupons")
        .select("*")
        .eq("user_id", userId)
        .eq("code", code.toUpperCase())
        .eq("is_active", true)
        .maybeSingle();

      if (error || !data) {
        throw new Error("Cupom inválido ou expirado");
      }

      const coupon = data as DeliveryCoupon;

      // Validações
      const now = new Date();
      const validFrom = new Date(coupon.valid_from);
      const validUntil = new Date(coupon.valid_until);

      if (now < validFrom || now > validUntil) {
        throw new Error("Cupom fora do período de validade");
      }

      if (coupon.usage_count >= coupon.usage_limit) {
        throw new Error("Cupom esgotado");
      }

      if (orderValue < coupon.min_order_value) {
        throw new Error(
          `Pedido mínimo de ${formatBRL(coupon.min_order_value)} para usar este cupom`
        );
      }

      // Calcular desconto
      let discount = 0;
      if (coupon.type === "percentage") {
        discount = (orderValue * coupon.value) / 100;
        if (coupon.max_discount && discount > coupon.max_discount) {
          discount = coupon.max_discount;
        }
      } else {
        discount = coupon.value;
      }

      return { coupon, discount };
    },
  });
};
