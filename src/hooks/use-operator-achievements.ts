import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OperatorAchievement {
  id: string;
  code: string;
  name: string;
  icon: string;
  awarded_at: string;
}

export function useOperatorAchievements(operatorId: string | null | undefined) {
  return useQuery({
    queryKey: ["operator-achievements", operatorId],
    enabled: !!operatorId,
    queryFn: async (): Promise<OperatorAchievement[]> => {
      const { data, error } = await supabase
        .from("operator_achievements")
        .select("id, code, name, icon, awarded_at")
        .eq("operator_id", operatorId!)
        .order("awarded_at", { ascending: false });
      if (error) throw error;
      return (data as OperatorAchievement[]) || [];
    },
  });
}
