import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { toast } from "sonner";

export interface AuthorizedEmployee {
  id: string;
  user_id: string;
  full_name: string;
  role_title: string | null;
  avatar_url: string | null;
  credit_limit: number;
  is_active: boolean;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  balance?: number;
}

export function useAuthorizedEmployees() {
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["pdv-authorized-employees", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [];
      const { data: emps, error } = await supabase
        .from("pdv_authorized_employees")
        .select("*")
        .eq("user_id", visibleUserId)
        .order("full_name");
      if (error) throw error;

      const { data: entries } = await supabase
        .from("pdv_employee_consumption_entries")
        .select("employee_id,total,paid_amount,status")
        .eq("user_id", visibleUserId)
        .neq("status", "pago");

      const balances = new Map<string, number>();
      (entries || []).forEach((e: any) => {
        const cur = balances.get(e.employee_id) || 0;
        balances.set(e.employee_id, cur + (Number(e.total) - Number(e.paid_amount)));
      });

      return (emps || []).map((e: any) => ({
        ...e,
        balance: balances.get(e.id) || 0,
      })) as AuthorizedEmployee[];
    },
    enabled: !!visibleUserId,
  });

  const create = useMutation({
    mutationFn: async (payload: Partial<AuthorizedEmployee>) => {
      if (!user) throw new Error("Não autenticado");
      const { data, error } = await supabase
        .from("pdv_authorized_employees")
        .insert({
          user_id: visibleUserId || user.id,
          full_name: payload.full_name!,
          role_title: payload.role_title || null,
          avatar_url: payload.avatar_url || null,
          credit_limit: payload.credit_limit ?? 0,
          is_active: payload.is_active ?? true,
          internal_notes: payload.internal_notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdv-authorized-employees"] });
      toast.success("Funcionário cadastrado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AuthorizedEmployee> }) => {
      const { error } = await supabase
        .from("pdv_authorized_employees")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdv-authorized-employees"] });
      toast.success("Funcionário atualizado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pdv_authorized_employees")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdv-authorized-employees"] });
      toast.success("Funcionário removido");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    employees,
    isLoading,
    create: create.mutate,
    isCreating: create.isPending,
    update: update.mutate,
    isUpdating: update.isPending,
    remove: remove.mutate,
    isRemoving: remove.isPending,
  };
}
