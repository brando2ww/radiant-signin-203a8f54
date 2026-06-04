import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAdminSetting<T = unknown>(key: string, defaultValue: T) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin_settings", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return (data?.value as T) ?? defaultValue;
    },
  });

  const mutation = useMutation({
    mutationFn: async (value: T) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("admin_settings")
        .upsert(
          { key, value: value as any, updated_by: auth.user?.id ?? null },
          { onConflict: "key" }
        );
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => {
      qc.setQueryData(["admin_settings", key], value);
    },
  });

  return {
    value: (query.data ?? defaultValue) as T,
    isLoading: query.isLoading,
    setValue: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
