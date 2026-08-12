import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// iFood · estado e ações da integração (modelo centralizado)
//
// O que existia antes chamava a ifood-oauth com um "código de autorização" do
// fluxo distribuído, que a API recusa para este aplicativo. Aqui não há
// credencial por loja: o token é da aplicação Velara e já enxerga as lojas
// vinculadas a ela no iFood. O que a tela faz é reivindicar qual dessas lojas
// pertence a esta conta.

export interface IFoodMerchant {
  merchant_id: string;
  name: string | null;
  is_active: boolean;
  linked_at: string;
  last_status: any | null;
  last_status_at: string | null;
}

export interface IFoodAvailableMerchant {
  id: string;
  name: string;
  linked: boolean;
}

export interface IFoodSettings {
  ifood_enabled: boolean;
  ifood_paused: boolean;
  ifood_merchant_id: string | null;
  ifood_merchant_name: string | null;
  ifood_connected_at: string | null;
  ifood_last_sync_at: string | null;
  ifood_last_error: string | null;
  ifood_last_error_at: string | null;
  ifood_shadow_mode: boolean;
  ifood_auto_accept: boolean;
  ifood_require_open_cashier: boolean;
  ifood_default_production_center_id: string | null;
  ifood_alert_minutes: number;
}

export interface IFoodPlatformHealth {
  last_poll_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
}

export interface IFoodLogEntry {
  sync_type: string;
  status: string;
  http_status: number | null;
  error_message: string | null;
  created_at: string;
}

export interface IFoodStatus {
  connected: boolean;
  settings: IFoodSettings | null;
  merchants: IFoodMerchant[];
  platform: IFoodPlatformHealth | null;
  logs: IFoodLogEntry[];
}

/** Sem polling recente, o iFood considera o aplicativo OFFLINE e a loja sai do
 *  ar na plataforma. Dois minutos é folga generosa sobre a janela de 30s. */
export const POLL_STALE_MS = 2 * 60 * 1000;

export function isPollingHealthy(platform: IFoodPlatformHealth | null): boolean {
  if (!platform?.last_poll_at) return false;
  return Date.now() - Date.parse(platform.last_poll_at) < POLL_STALE_MS;
}

async function callAuth<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ifood-auth", {
    body: { action, ...payload },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export function useIFoodIntegration() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ifood-status"] });

  const statusQuery = useQuery({
    queryKey: ["ifood-status"],
    queryFn: () => callAuth<IFoodStatus>("status"),
    // a saúde do polling envelhece sozinha: sem refetch a tela mente
    refetchInterval: 60_000,
  });

  /** Lojas que o app enxerga no iFood e que ainda não são de outra conta. */
  const availableMerchants = useMutation({
    mutationFn: () =>
      callAuth<{ merchants: IFoodAvailableMerchant[]; totalNoApp: number }>("available_merchants"),
    onError: (err: Error) => toast.error(traduzErro(err)),
  });

  const linkMerchant = useMutation({
    mutationFn: (merchantId: string) => callAuth("link_merchant", { merchantId }),
    onSuccess: () => {
      toast.success("Loja vinculada ao iFood");
      invalidate();
    },
    onError: (err: Error) => toast.error(traduzErro(err)),
  });

  const unlinkMerchant = useMutation({
    mutationFn: (merchantId: string) => callAuth("unlink_merchant", { merchantId }),
    onSuccess: () => {
      toast.success("Loja desvinculada");
      invalidate();
    },
    onError: (err: Error) => toast.error(traduzErro(err)),
  });

  const selectMerchant = useMutation({
    mutationFn: (merchantId: string) => callAuth("select_merchant", { merchantId }),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(traduzErro(err)),
  });

  const testConnection = useMutation({
    mutationFn: () => callAuth<{ success: boolean; httpStatus: number; storeStatus?: any }>("test_connection"),
    onSuccess: (data) => {
      if (data.success) toast.success("Conexão com o iFood respondeu normalmente");
      else toast.error(`O iFood respondeu ${data.httpStatus}`);
      invalidate();
    },
    onError: (err: Error) => toast.error(traduzErro(err)),
  });

  /** Ajustes de operação gravados direto, sem passar pela edge function. */
  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<IFoodSettings>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("pdv_settings")
        .upsert({ user_id: user.id, ...patch } as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast.error("Erro ao salvar: " + err.message),
  });

  return {
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    refetch: statusQuery.refetch,
    pollingHealthy: isPollingHealthy(statusQuery.data?.platform ?? null),
    availableMerchants,
    linkMerchant,
    unlinkMerchant,
    selectMerchant,
    testConnection,
    updateSettings,
  };
}

/**
 * Mensagens do iFood são secas e o operador não sabe o que fazer com elas.
 * Estes três casos são os que aparecem de verdade em campo.
 */
function traduzErro(err: Error): string {
  const msg = err.message ?? "";
  if (/no permissions granted|não tem módulos liberados/i.test(msg)) {
    return "O aplicativo iFood ainda não tem módulos liberados. Isso se resolve no Portal do Desenvolvedor.";
  }
  if (/not configured|não configurada/i.test(msg)) {
    return "Integração iFood não configurada pelo administrador do sistema.";
  }
  if (/merchant_taken|já está vinculada a outra conta/i.test(msg)) {
    return "Essa loja já está vinculada a outra conta do Velara.";
  }
  return msg || "Falha ao falar com o iFood";
}
