import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface IFoodSettings {
  ifood_merchant_id: string | null;
  ifood_enabled: boolean;
  ifood_auto_accept: boolean;
  ifood_sync_menu: boolean;
  ifood_token_expires_at: string | null;
}

export function useIFoodIntegration() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["ifood-settings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("pdv_settings")
        .select("ifood_merchant_id, ifood_enabled, ifood_auto_accept, ifood_sync_menu, ifood_token_expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      
      // Return default values if no settings exist yet
      if (!data) {
        return {
          ifood_merchant_id: null,
          ifood_enabled: false,
          ifood_auto_accept: false,
          ifood_sync_menu: true,
          ifood_token_expires_at: null,
        } as IFoodSettings;
      }
      
      return data as IFoodSettings;
    },
  });

  const connectIFood = useMutation({
    mutationFn: async ({ code }: { code: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("ifood-oauth", {
        body: {
          action: "exchange_code",
          code,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("iFood conectado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["ifood-settings"] });
    },
    onError: (error) => {
      console.error("Error connecting iFood:", error);
      toast.error("Erro ao conectar iFood: " + error.message);
    },
  });

  const disconnectIFood = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("ifood-oauth", {
        body: { action: "disconnect" },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("iFood desconectado");
      queryClient.invalidateQueries({ queryKey: ["ifood-settings"] });
    },
    onError: (error) => {
      console.error("Error disconnecting iFood:", error);
      toast.error("Erro ao desconectar iFood");
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<IFoodSettings>) => {
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
      queryClient.invalidateQueries({ queryKey: ["ifood-settings"] });
    },
    onError: (error) => {
      console.error("Error updating settings:", error);
      toast.error("Erro ao atualizar configurações");
    },
  });

  const syncReviews = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("ifood-sync-reviews", {
        body: { user_id: user.id },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const count = data?.imported || 0;
      toast.success(`${count} avaliação(ões) importada(s) do iFood`);
      queryClient.invalidateQueries({ queryKey: ["ifood-settings"] });
    },
    onError: (error) => {
      console.error("Error syncing reviews:", error);
      toast.error("Erro ao sincronizar avaliações do iFood");
    },
  });

  const isConnected = settings?.ifood_enabled && settings?.ifood_merchant_id;

  return {
    settings,
    isLoading,
    isConnected,
    connectIFood,
    disconnectIFood,
    updateSettings,
    syncReviews,
  };
}
