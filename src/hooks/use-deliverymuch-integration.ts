import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DeliveryMuchSettings {
  deliverymuch_enabled: boolean | null;
  deliverymuch_email: string | null;
  deliverymuch_restaurant_uuid: string | null;
  deliverymuch_auto_accept: boolean | null;
  deliverymuch_token_expires_at: string | null;
  deliverymuch_delivery_time_min: number | null;
  deliverymuch_pickup_time_min: number | null;
}

export function useDeliveryMuchIntegration() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["deliverymuch-settings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("pdv_settings")
        .select(
          "deliverymuch_enabled, deliverymuch_email, deliverymuch_restaurant_uuid, deliverymuch_auto_accept, deliverymuch_token_expires_at, deliverymuch_delivery_time_min, deliverymuch_pickup_time_min"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return {
          deliverymuch_enabled: false,
          deliverymuch_email: null,
          deliverymuch_restaurant_uuid: null,
          deliverymuch_auto_accept: false,
          deliverymuch_token_expires_at: null,
          deliverymuch_delivery_time_min: 40,
          deliverymuch_pickup_time_min: 20,
        } as DeliveryMuchSettings;
      }

      return data as DeliveryMuchSettings;
    },
  });

  const connect = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await supabase.functions.invoke("deliverymuch-auth", {
        body: { action: "connect", email, password },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("DeliveryMuch conectado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["deliverymuch-settings"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-integrations-status"] });
    },
    onError: (error: Error) => {
      toast.error("Erro ao conectar DeliveryMuch: " + error.message);
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("deliverymuch-auth", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("DeliveryMuch desconectado");
      queryClient.invalidateQueries({ queryKey: ["deliverymuch-settings"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-integrations-status"] });
    },
    onError: () => {
      toast.error("Erro ao desconectar DeliveryMuch");
    },
  });

  const toggleOnline = useMutation({
    mutationFn: async (online: boolean) => {
      const { data, error } = await supabase.functions.invoke("deliverymuch-auth", {
        body: { action: "toggle_online", online },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data?.online ? "Loja aberta no DeliveryMuch" : "Loja fechada no DeliveryMuch");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar status: " + error.message);
    },
  });

  const setDeliveryTime = useMutation({
    mutationFn: async ({ delivery_min, pickup_min }: { delivery_min: number; pickup_min: number }) => {
      const { data, error } = await supabase.functions.invoke("deliverymuch-auth", {
        body: { action: "set_delivery_time", delivery_min, pickup_min },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Tempos de entrega atualizados");
      queryClient.invalidateQueries({ queryKey: ["deliverymuch-settings"] });
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar tempos: " + error.message);
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<DeliveryMuchSettings>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("pdv_settings")
        .update(updates)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações atualizadas");
      queryClient.invalidateQueries({ queryKey: ["deliverymuch-settings"] });
    },
    onError: () => {
      toast.error("Erro ao atualizar configurações");
    },
  });

  const isConnected = !!(settings?.deliverymuch_enabled && settings?.deliverymuch_restaurant_uuid);

  return {
    settings,
    isLoading,
    isConnected,
    connect,
    disconnect,
    toggleOnline,
    setDeliveryTime,
    updateSettings,
  };
}
