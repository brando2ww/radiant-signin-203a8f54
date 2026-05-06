import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PublicCategory {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  order_position: number;
}

export interface PublicProduct {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: number;
  promotional_price: number | null;
  preparation_time: number;
  serves: number;
  is_featured: boolean;
  available_days?: number[] | null;
  delivery_product_options?: PublicProductOption[];
}

export interface PublicProductOption {
  id: string;
  product_id: string;
  name: string;
  type: "single" | "multiple";
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  order_position: number;
  allow_quantity?: boolean;
  delivery_product_option_items?: PublicProductOptionItem[];
}

export interface PublicProductOptionItem {
  id: string;
  option_id: string;
  name: string;
  price_adjustment: number;
  is_available: boolean;
  order_position: number;
}

export const usePublicCategories = (userId: string) => {
  return useQuery({
    queryKey: ["public-categories", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_categories")
        .select("id, name, description, image_url, order_position")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("order_position", { ascending: true });

      if (error) throw error;
      return data as PublicCategory[];
    },
    enabled: !!userId,
  });
};

export const usePublicProducts = (userId: string, categoryId?: string) => {
  return useQuery({
    queryKey: ["public-products", userId, categoryId],
    queryFn: async () => {
      let query = supabase
        .from("delivery_products")
        .select(`
          id,
          category_id,
          name,
          description,
          image_url,
          base_price,
          promotional_price,
          preparation_time,
          serves,
          is_featured,
          available_days,
          delivery_product_options (
            id,
            product_id,
            name,
            type,
            is_required,
            min_selections,
            max_selections,
            order_position,
            allow_quantity,
            delivery_product_option_items (
              id,
              option_id,
              name,
              price_adjustment,
              is_available,
              order_position
            )
          )
        `)
        .eq("user_id", userId)
        .eq("is_available", true);

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query.order("order_position", { ascending: true });

      if (error) throw error;

      // Filtra produtos pelo dia da semana atual (0=Dom .. 6=Sáb)
      const today = new Date().getDay();
      const filtered = (data as PublicProduct[]).filter((p) => {
        const days = p.available_days as number[] | null | undefined;
        return !days || days.length === 0 || days.includes(today);
      });

      return filtered;
    },
    enabled: !!userId,
  });
};

export const usePublicSettings = (userId: string) => {
  return useQuery({
    queryKey: ["public-delivery-settings", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
};

export const useBusinessSettings = (userId: string) => {
  return useQuery({
    queryKey: ["public-business-settings", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
};
