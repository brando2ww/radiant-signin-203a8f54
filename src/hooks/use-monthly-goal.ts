import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

function currentMonthYear() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export function useMonthlyGoal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const monthYear = currentMonthYear();

  const query = useQuery({
    queryKey: ["monthly-goal", user?.id, monthYear],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_goals")
        .select("id, revenue_goal, month_year")
        .eq("user_id", user!.id)
        .eq("month_year", monthYear)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const setGoal = useMutation({
    mutationFn: async (revenueGoal: number) => {
      if (!user?.id) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("monthly_goals")
        .upsert(
          {
            user_id: user.id,
            month_year: monthYear,
            revenue_goal: revenueGoal,
          },
          { onConflict: "user_id,month_year" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-goal", user?.id, monthYear] });
    },
  });

  return {
    goal: query.data?.revenue_goal ? Number(query.data.revenue_goal) : null,
    isLoading: query.isLoading,
    setGoal: setGoal.mutateAsync,
    isSaving: setGoal.isPending,
  };
}
