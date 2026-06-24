import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useInvalidateNfeMde } from "./use-nfe-mde";

interface ConsultarResult {
  found: number;
  new: number;
  version: string;
}

export function useNfeMdeConsultar() {
  const invalidate = useInvalidateNfeMde();

  return useMutation({
    mutationFn: async (): Promise<ConsultarResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/focusnfe-mde-consultar`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Erro ao consultar MDe");
      return body as ConsultarResult;
    },
    onSuccess: (result) => {
      invalidate();
      if (result.new > 0) {
        toast.success(`${result.new} nova(s) NF-e encontrada(s)`);
      } else {
        toast.info("Nenhuma NF-e nova encontrada");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
