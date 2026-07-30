import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ProductMapEntry {
  id: string;
  external_product_id: string;
  external_name: string | null;
  delivery_product_id: string | null;
  production_center_id: string | null;
  status: string;
  times_seen: number;
  last_seen_at: string;
}

export interface PaymentMapEntry {
  id: string;
  external_key: string;
  label: string | null;
  payment_method: string;
  is_prepaid: boolean;
}

export const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Dinheiro" },
  { value: "credit", label: "Crédito" },
  { value: "debit", label: "Débito" },
  { value: "pix", label: "Pix" },
  { value: "voucher", label: "Vale / Ticket" },
  { value: "online", label: "Pago online" },
];

/**
 * Sugere um produto local para um nome vindo da plataforma.
 * Casamento exato de nome normalizado, depois contido. Sem heurística mais
 * esperta de propósito: sugestão errada aceita sem querer manda o item para a
 * impressora errada, então o custo de um falso positivo é alto.
 */
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function suggestProduct<T extends { id: string; name: string }>(
  externalName: string | null,
  products: T[],
): T | null {
  if (!externalName) return null;
  const target = normalize(externalName);

  const exact = products.find((p) => normalize(p.name) === target);
  if (exact) return exact;

  const contained = products.filter((p) =>
    normalize(p.name).includes(target) || target.includes(normalize(p.name))
  );
  return contained.length === 1 ? contained[0] : null;
}

export interface ShadowOrder {
  id: string;
  external_code: string | null;
  external_stage: string | null;
  first_seen_at: string;
  preview: {
    customer_name?: string;
    order_type?: string;
    total?: number;
    payment_method?: string;
    items?: Array<{ product_name: string; quantity: number; options: string | null }>;
  } | null;
}

export function useDeliveryMuchMapping() {
  const queryClient = useQueryClient();

  const invalidateProducts = () =>
    queryClient.invalidateQueries({ queryKey: ["deliverymuch-product-map"] });

  const { data: productMap, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["deliverymuch-product-map"],
    queryFn: async (): Promise<ProductMapEntry[]> => {
      const { data, error } = await supabase
        .from("deliverymuch_product_map")
        .select("id, external_product_id, external_name, delivery_product_id, production_center_id, status, times_seen, last_seen_at")
        .order("status", { ascending: true })
        .order("times_seen", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: paymentMap } = useQuery({
    queryKey: ["deliverymuch-payment-map"],
    queryFn: async (): Promise<PaymentMapEntry[]> => {
      const { data, error } = await supabase
        .from("deliverymuch_payment_map")
        .select("id, external_key, label, payment_method, is_prepaid")
        .order("external_key");

      if (error) throw error;
      return data ?? [];
    },
  });

  /** Produtos do cardápio local, para o seletor de vínculo. */
  const { data: localProducts } = useQuery({
    queryKey: ["deliverymuch-local-products"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("delivery_products")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name");

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: productionCenters } = useQuery({
    queryKey: ["deliverymuch-production-centers"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("pdv_production_centers")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name");

      if (error) throw error;
      return data ?? [];
    },
  });

  const linkProduct = useMutation({
    mutationFn: async (vars: {
      id: string;
      delivery_product_id: string | null;
      production_center_id?: string | null;
    }) => {
      const { error } = await supabase
        .from("deliverymuch_product_map")
        .update({
          delivery_product_id: vars.delivery_product_id,
          ...(vars.production_center_id !== undefined
            ? { production_center_id: vars.production_center_id }
            : {}),
          status: vars.delivery_product_id ? "mapped" : "pending",
        })
        .eq("id", vars.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProducts();
      toast.success("Produto vinculado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const ignoreProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("deliverymuch_product_map")
        .update({ status: "ignored", delivery_product_id: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProducts();
      toast.success("Produto marcado como ignorado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setPaymentMethod = useMutation({
    mutationFn: async (vars: { id: string; payment_method: string; is_prepaid?: boolean }) => {
      const { error } = await supabase
        .from("deliverymuch_payment_map")
        .update({
          payment_method: vars.payment_method,
          ...(vars.is_prepaid !== undefined ? { is_prepaid: vars.is_prepaid } : {}),
        })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliverymuch-payment-map"] });
      toast.success("Forma de pagamento atualizada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const seedPaymentMap = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("deliverymuch-orders", {
        body: { action: "seed_payment_map" },
      });
      const body = (data ?? {}) as { error?: string; count?: number };
      if (body.error) throw new Error(body.error);
      if (error) throw error;
      return body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["deliverymuch-payment-map"] });
      toast.success(`${data.count ?? 0} formas de pagamento carregadas da loja.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /** Pedidos vistos em modo observação, para comparar com o app Eugênio. */
  const { data: shadowOrders } = useQuery({
    queryKey: ["deliverymuch-shadow-orders"],
    refetchInterval: 60 * 1000,
    queryFn: async (): Promise<ShadowOrder[]> => {
      const { data, error } = await supabase
        .from("deliverymuch_shadow_orders")
        .select("id, external_code, external_stage, first_seen_at, preview")
        .order("first_seen_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data ?? []) as unknown as ShadowOrder[];
    },
  });

  const pending = (productMap ?? []).filter((p) => p.status === "pending");

  return {
    productMap: productMap ?? [],
    shadowOrders: shadowOrders ?? [],
    pendingProducts: pending,
    paymentMap: paymentMap ?? [],
    localProducts: localProducts ?? [],
    productionCenters: productionCenters ?? [],
    isLoadingProducts,
    linkProduct,
    ignoreProduct,
    setPaymentMethod,
    seedPaymentMap,
  };
}
