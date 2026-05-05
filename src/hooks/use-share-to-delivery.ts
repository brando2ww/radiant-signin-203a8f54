import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PDVProduct } from "@/hooks/use-pdv-products";

export const useSharedProductIds = () => {
  return useQuery({
    queryKey: ["shared-delivery-product-ids"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Set<string>();

      const { data, error } = await supabase
        .from("delivery_products")
        .select("source_pdv_product_id")
        .eq("user_id", user.id)
        .not("source_pdv_product_id", "is", null);

      if (error) throw error;
      return new Set(
        (data || [])
          .map((d: any) => d.source_pdv_product_id as string)
          .filter(Boolean)
      );
    },
  });
};

export const useShareToDelivery = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      product,
      categoryId,
      basePrice,
    }: {
      product: PDVProduct;
      categoryId: string;
      basePrice: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Check if already shared
      const { data: existing } = await supabase
        .from("delivery_products")
        .select("id")
        .eq("source_pdv_product_id", product.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) throw new Error("Este produto já está no delivery");

      const { data, error } = await supabase
        .from("delivery_products")
        .insert({
          user_id: user.id,
          category_id: categoryId,
          name: product.name,
          description: product.description,
          image_url: product.image_url,
          base_price: basePrice,
          preparation_time: product.preparation_time,
          serves: product.serves,
          is_available: product.is_available,
          source_pdv_product_id: product.id,
          order_position: 0,
        })
        .select()
        .single();

      if (error) throw error;

      // Clonar opções/itens do PDV para o produto recém-criado no delivery
      try {
        await supabase.rpc("delivery_clone_options_from_pdv" as any, {
          p_pdv_product_id: product.id,
        });
      } catch (e) {
        console.warn("[useShareToDelivery] falha ao clonar opções", e);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared-delivery-product-ids"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-products"] });
      toast.success("Produto enviado para o Delivery!");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
};

export const useResyncDeliveryOptions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pdvProductId: string) => {
      const { error } = await supabase.rpc(
        "delivery_clone_options_from_pdv" as any,
        { p_pdv_product_id: pdvProductId },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-products"] });
      queryClient.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Opções sincronizadas com o delivery!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
