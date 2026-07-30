import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DeliveryMuchSettings {
  deliverymuch_enabled: boolean;
  deliverymuch_username: string | null;
  deliverymuch_company_uuid: string | null;
  deliverymuch_companies: string[];
  deliverymuch_env: "dev" | "prod";
  deliverymuch_auto_accept: boolean;
  deliverymuch_delivery_time_min: number;
  deliverymuch_pickup_time_min: number;
  deliverymuch_connected_at: string | null;
  deliverymuch_last_sync_at: string | null;
  deliverymuch_last_error: string | null;
  deliverymuch_last_error_at: string | null;
  deliverymuch_paused: boolean;
  deliverymuch_default_production_center_id: string | null;
  deliverymuch_require_open_cashier: boolean;
  deliverymuch_alert_minutes: number;
  deliverymuch_last_poll_at: string | null;
  deliverymuch_shadow_mode: boolean;
}

/** Saúde da conexão, servida pela edge function · o token nunca chega ao browser. */
export interface DeliveryMuchStatus {
  connected: boolean;
  username: string | null;
  token_expires_at: string | null;
  can_auto_renew: boolean;
  scope: string | null;
  env: "dev" | "prod";
}

/** Recorte do GET /companies/{uuid} que a tela usa. */
export interface DeliveryMuchCompany {
  id: string;
  name: string;
  slug?: string;
  cnpj?: string;
  phone?: string;
  is_online: boolean;
  delivery_time?: number;
  pickup_time?: number;
  minimum_order_price?: number;
  address?: {
    street?: string;
    number?: string;
    district?: string;
    city?: string;
    state_acronym?: string;
  };
  delivery_forms?: Array<{
    type: string;
    payment_methods: Array<{
      key: string;
      name: string;
      cards?: Array<{ id: number; name: string }>;
    }>;
  }>;
}

export interface DeliveryMuchLogEntry {
  id: number;
  action: string;
  status: string;
  http_status: number | null;
  message: string | null;
  created_at: string;
}

const DEFAULTS: DeliveryMuchSettings = {
  deliverymuch_enabled: false,
  deliverymuch_username: null,
  deliverymuch_company_uuid: null,
  deliverymuch_companies: [],
  deliverymuch_env: "dev",
  deliverymuch_auto_accept: true,
  deliverymuch_delivery_time_min: 40,
  deliverymuch_pickup_time_min: 20,
  deliverymuch_connected_at: null,
  deliverymuch_last_sync_at: null,
  deliverymuch_last_error: null,
  deliverymuch_last_error_at: null,
  deliverymuch_paused: false,
  deliverymuch_default_production_center_id: null,
  deliverymuch_require_open_cashier: true,
  deliverymuch_alert_minutes: 5,
  deliverymuch_last_poll_at: null,
  deliverymuch_shadow_mode: true,
};

const SETTINGS_COLUMNS =
  "deliverymuch_enabled, deliverymuch_username, deliverymuch_company_uuid, deliverymuch_companies, deliverymuch_env, deliverymuch_auto_accept, deliverymuch_delivery_time_min, deliverymuch_pickup_time_min, deliverymuch_connected_at, deliverymuch_last_sync_at, deliverymuch_last_error, deliverymuch_last_error_at, deliverymuch_paused, deliverymuch_default_production_center_id, deliverymuch_require_open_cashier, deliverymuch_alert_minutes, deliverymuch_last_poll_at, deliverymuch_shadow_mode";

/** Erro devolvido pela edge function vem no corpo, não na mensagem do FunctionsError. */
async function invokeAuth<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("deliverymuch-auth", { body: payload });

  const body = (data ?? {}) as { error?: string; code?: string };
  if (body.error) {
    const err = new Error(body.error) as Error & { code?: string };
    err.code = body.code;
    throw err;
  }
  if (error) throw error;

  return data as T;
}

export function useDeliveryMuchIntegration() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["deliverymuch-settings"] });
    queryClient.invalidateQueries({ queryKey: ["deliverymuch-status"] });
    queryClient.invalidateQueries({ queryKey: ["deliverymuch-log"] });
  };

  const { data: settings, isLoading } = useQuery({
    queryKey: ["deliverymuch-settings"],
    queryFn: async (): Promise<DeliveryMuchSettings> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("pdv_settings")
        .select(SETTINGS_COLUMNS)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return DEFAULTS;

      return {
        ...DEFAULTS,
        ...data,
        deliverymuch_companies: Array.isArray(data.deliverymuch_companies)
          ? (data.deliverymuch_companies as string[])
          : [],
      } as DeliveryMuchSettings;
    },
  });

  const isConnected = Boolean(settings?.deliverymuch_username);

  const { data: status } = useQuery({
    queryKey: ["deliverymuch-status"],
    enabled: isConnected,
    // o token vive 1 hora; conferir de tempos em tempos mantém o aviso honesto
    refetchInterval: 5 * 60 * 1000,
    queryFn: () => invokeAuth<DeliveryMuchStatus>({ action: "status" }),
  });

  const { data: log } = useQuery({
    queryKey: ["deliverymuch-log"],
    enabled: isConnected,
    queryFn: async (): Promise<DeliveryMuchLogEntry[]> => {
      const { data, error } = await supabase
        .from("deliverymuch_sync_log")
        .select("id, action, status, http_status, message, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data ?? [];
    },
  });

  const connect = useMutation({
    mutationFn: (vars: { username: string; password: string }) =>
      invokeAuth<{ companies: string[]; needs_company_selection: boolean }>({
        action: "connect",
        ...vars,
      }),
    onSuccess: (data) => {
      invalidate();
      toast.success(
        data.needs_company_selection
          ? `Login aceito · ${data.companies.length} lojas encontradas, escolha qual vincular.`
          : "Loja conectada à DeliveryMuch.",
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const selectCompany = useMutation({
    mutationFn: (company_uuid: string) => invokeAuth({ action: "select_company", company_uuid }),
    onSuccess: () => {
      invalidate();
      toast.success("Loja vinculada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testConnection = useMutation({
    mutationFn: () =>
      invokeAuth<{ success: boolean; api_status: number; api_response: unknown }>({
        action: "test_connection",
      }),
    onSuccess: (data) => {
      invalidate();
      if (data.success) {
        toast.success("Conexão validada: autenticação e API respondendo.");
      } else {
        // autenticar funcionou, quem falhou foi a API · a distinção importa
        toast.warning(
          `Autenticação válida, mas a API da DeliveryMuch respondeu ${data.api_status}. Veja o histórico abaixo.`,
        );
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Dados reais da loja na plataforma. Falha aqui não pode derrubar a tela:
  // a API deles pode estar fora do ar e a configuração local segue utilizável.
  const {
    data: company,
    error: companyError,
    isFetching: isFetchingCompany,
  } = useQuery({
    queryKey: ["deliverymuch-company"],
    enabled: isConnected && Boolean(settings?.deliverymuch_company_uuid),
    retry: false,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const data = await invokeAuth<{ company: DeliveryMuchCompany }>({ action: "company_info" });
      return data.company;
    },
  });

  const toggleOnline = useMutation({
    mutationFn: (online: boolean) => invokeAuth({ action: "toggle_online", online }),
    onSuccess: (_data, online) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["deliverymuch-company"] });
      toast.success(
        `Loja ${online ? "aberta" : "fechada"} na DeliveryMuch. A plataforma leva alguns instantes para refletir.`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setDeliveryTime = useMutation({
    mutationFn: (vars: { delivery_min?: number; pickup_min?: number }) =>
      invokeAuth({ action: "set_delivery_time", ...vars }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["deliverymuch-company"] });
      toast.success("Tempos atualizados na plataforma.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disconnect = useMutation({
    mutationFn: () => invokeAuth({ action: "disconnect" }),
    onSuccess: () => {
      invalidate();
      toast.success("Integração desconectada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<DeliveryMuchSettings>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("pdv_settings")
        .update(patch)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliverymuch-settings"] });
      toast.success("Configuração salva.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    settings: settings ?? DEFAULTS,
    status,
    company,
    companyError: companyError as Error | null,
    isFetchingCompany,
    log: log ?? [],
    isLoading,
    isConnected,
    needsCompanySelection: isConnected && !settings?.deliverymuch_company_uuid,
    connect,
    selectCompany,
    testConnection,
    toggleOnline,
    setDeliveryTime,
    disconnect,
    updateSettings,
  };
}
