import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

export interface ProductionCenter {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  printer_name: string | null;
  printer_ip: string | null;
  printer_port: number | null;
  is_active: boolean;
  display_order: number;
  print_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductionCenterInput {
  name: string;
  slug?: string;
  color?: string;
  icon?: string;
  printer_name?: string | null;
  printer_ip?: string | null;
  printer_port?: number | null;
  display_order?: number;
  print_complete?: boolean;
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

export function useProductionCenters() {
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();
  const queryClient = useQueryClient();

  const ownerId = visibleUserId || user?.id;

  const { data: centers = [], isLoading } = useQuery({
    queryKey: ["pdv-production-centers", ownerId],
    queryFn: async () => {
      if (!ownerId) return [];
      const { data, error } = await supabase
        .from("pdv_production_centers")
        .select("*")
        .eq("user_id", ownerId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as ProductionCenter[];
    },
    enabled: !!ownerId,
  });

  const createCenter = useMutation({
    mutationFn: async (input: ProductionCenterInput) => {
      if (!user) throw new Error("Usuário não autenticado");

      const slug = input.slug || slugify(input.name);
      const maxOrder = Math.max(0, ...centers.map((c) => c.display_order));

      const { data, error } = await supabase
        .from("pdv_production_centers")
        .insert({
          user_id: user.id,
          name: input.name,
          slug,
          color: input.color || "#3b82f6",
          icon: input.icon || "ChefHat",
          printer_name: input.printer_name || null,
          printer_ip: input.printer_ip || null,
          printer_port: input.printer_port ?? 9100,
          display_order: input.display_order ?? maxOrder + 1,
          print_complete: input.print_complete ?? false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-production-centers"] });
      toast.success("Centro de produção criado");
    },
    onError: (error: any) => {
      if (error.code === "23505") {
        toast.error("Já existe um centro com esse identificador");
      } else {
        toast.error("Erro ao criar centro: " + error.message);
      }
    },
  });

  const updateCenter = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ProductionCenterInput>) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("pdv_production_centers")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-production-centers"] });
      toast.success("Centro atualizado");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });

  const deleteCenter = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("pdv_production_centers")
        .update({ is_active: false })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-production-centers"] });
      toast.success("Centro removido");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover: " + error.message);
    },
  });

  const reorderCenters = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!user) throw new Error("Usuário não autenticado");

      await Promise.all(
        orderedIds.map((id, index) =>
          supabase
            .from("pdv_production_centers")
            .update({ display_order: index })
            .eq("id", id)
            .eq("user_id", user.id)
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-production-centers"] });
    },
  });

  return {
    centers,
    isLoading,
    createCenter: createCenter.mutateAsync,
    isCreating: createCenter.isPending,
    updateCenter: updateCenter.mutateAsync,
    isUpdating: updateCenter.isPending,
    deleteCenter: deleteCenter.mutateAsync,
    isDeleting: deleteCenter.isPending,
    reorderCenters: reorderCenters.mutate,
  };
}
