/**
 * Força de vendas · quem está abrindo o app do representante (/representante).
 *
 * Três situações:
 *  - representante: entra com o próprio cadastro (vendas_representantes.rep_user_id = ele). Se o cadastro está inativo
 *    ou não aparece (módulo desligado também esconde a linha), a casca mostra a tela de acesso bloqueado;
 *  - dono ou gerente: pré-visualização, escolhendo de qual representante ver os dados;
 *  - qualquer outro papel: não entra (a casca manda para /pdv).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useUserRole } from "@/hooks/use-user-role";
import type { VendasRepresentante } from "@/lib/vendas/types";

export type RepAccess = "rep" | "preview" | "denied";

export type RepBrand = {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

const PREVIEW_ROLES = ["proprietario", "gerente"];

export function useVendasRepSession() {
  const { user } = useAuth();
  const { role, isLoading: roleLoading } = useUserRole();
  const { visibleUserId, isLoading: ownerLoading } = useEstablishmentId();

  const roleName = String(role);
  const access: RepAccess =
    roleName === "representante" ? "rep" : PREVIEW_ROLES.includes(roleName) ? "preview" : "denied";

  const myRepQuery = useQuery({
    queryKey: ["vendas-rep-me", user?.id],
    enabled: !!user?.id && !roleLoading && access === "rep",
    queryFn: async (): Promise<VendasRepresentante | null> => {
      const { data, error } = await supabase
        .from("vendas_representantes" as any)
        .select("*")
        .eq("rep_user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as VendasRepresentante) ?? null;
    },
  });

  const previewRepsQuery = useQuery({
    queryKey: ["vendas-rep-preview-list", visibleUserId],
    enabled: !!visibleUserId && !ownerLoading && !roleLoading && access === "preview",
    queryFn: async (): Promise<VendasRepresentante[]> => {
      const { data, error } = await supabase
        .from("vendas_representantes" as any)
        .select("*")
        .eq("user_id", visibleUserId!)
        .order("name");
      if (error) throw error;
      return (data as unknown as VendasRepresentante[]) ?? [];
    },
  });

  const brandQuery = useQuery({
    queryKey: ["vendas-rep-brand", visibleUserId],
    enabled: !!visibleUserId && !ownerLoading,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<RepBrand> => {
      const { data } = await supabase
        .from("business_settings")
        .select("business_name, logo_url, primary_color")
        .eq("user_id", visibleUserId!)
        .maybeSingle();
      return {
        name: data?.business_name?.trim() || "",
        logoUrl: data?.logo_url || null,
        primaryColor: data?.primary_color || null,
      };
    },
  });

  // A marca entra no carregamento para a barra do topo não piscar o nome genérico antes do da empresa.
  const loading =
    roleLoading ||
    ownerLoading ||
    (!!visibleUserId && brandQuery.isLoading) ||
    (access === "rep" && myRepQuery.isLoading) ||
    (access === "preview" && previewRepsQuery.isLoading);

  return {
    access,
    loading,
    ownerId: visibleUserId,
    myRep: myRepQuery.data ?? null,
    myRepError: myRepQuery.error as Error | null,
    previewReps: previewRepsQuery.data ?? [],
    brand: brandQuery.data ?? { name: "", logoUrl: null, primaryColor: null },
  };
}
