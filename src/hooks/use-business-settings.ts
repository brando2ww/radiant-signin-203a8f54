import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface BusinessSettings {
  id?: string;
  user_id: string;
  business_name: string;
  business_slogan?: string;
  business_description?: string;
  logo_url?: string;
  cover_url?: string;
  primary_color: string;
  secondary_color: string;
  background_color?: string;
  welcome_message: string;
  thank_you_message: string;
  google_review_url?: string;
  slug?: string | null;
}

// Hook para o usuário autenticado gerenciar suas configurações
export function useBusinessSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("business_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      setSettings(data);
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const saveSettings = useCallback(
    async (updates: Partial<BusinessSettings>) => {
      if (!user) return;

      setSaving(true);
      try {
        const payload = {
          user_id: user.id,
          business_name: updates.business_name || "",
          business_slogan: updates.business_slogan,
          business_description: updates.business_description,
          logo_url: updates.logo_url,
          cover_url: updates.cover_url,
          primary_color: updates.primary_color || "#3b82f6",
          secondary_color: updates.secondary_color || "#8b5cf6",
          background_color: updates.background_color || "#f8fafc",
          welcome_message: updates.welcome_message || "Olá! Queremos ouvir você 😊",
          thank_you_message: updates.thank_you_message || "Obrigado! Esperamos vê-lo novamente em breve!",
          google_review_url: updates.google_review_url || null,
        };

        const { data, error } = await supabase
          .from("business_settings")
          .upsert(payload, { onConflict: 'user_id' })
          .select()
          .single();

        if (error) throw error;

        setSettings(data);
        toast.success("Configurações salvas com sucesso!");
      } catch (error) {
        console.error("Erro ao salvar configurações:", error);
        toast.error("Erro ao salvar configurações");
      } finally {
        setSaving(false);
      }
    },
    [user]
  );

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    settings,
    loading,
    saving,
    saveSettings,
    refreshSettings: loadSettings,
  };
}

// Hook para buscar configurações públicas (usado na página pública)
export function usePublicBusinessSettings(userId: string) {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("business_settings")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) throw error;
        setSettings(data);
      } catch (error) {
        console.error("Erro ao carregar configurações públicas:", error);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadSettings();
    }
  }, [userId]);

  return { settings, loading };
}
