import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "./use-establishment-id";
import { toast } from "sonner";

export interface FiscalConfig {
  id?: string;
  user_id?: string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  regime_tributario?: number | null;
  telefone?: string | null;
  email?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  codigo_municipio_ibge?: string | null;
  certificado_pfx_path?: string | null;
  certificado_valido_ate?: string | null;
  id_token_nfce_producao?: number | null;
  id_token_nfce_homologacao?: number | null;
  habilita_nfce?: boolean;
  habilita_nfe?: boolean;
  habilita_nfse?: boolean;
  serie_nfce?: number | null;
  serie_nfe?: number | null;
  serie_nfse?: number | null;
  focusnfe_empresa_id?: number | null;
  focusnfe_ambiente?: "homologacao" | "producao";
  cadastrada_em?: string | null;
  last_test_at?: string | null;
  last_test_status?: string | null;
  last_test_message?: string | null;
}

export function useFiscalConfig() {
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["fiscal-config", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return null;
      const { data, error } = await supabase
        .from("tenant_fiscal_config" as any)
        .select("*")
        .eq("user_id", visibleUserId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as any) as FiscalConfig | null;
    },
    enabled: !!visibleUserId,
  });

  const save = useMutation({
    mutationFn: async (
      values: Partial<FiscalConfig> & { senha_certificado?: string; csc_producao?: string; csc_homologacao?: string },
    ) => {
      if (!visibleUserId) throw new Error("Sem usuário");
      const { senha_certificado, csc_producao, csc_homologacao, ...rest } = values;
      // Cifras feitas no backend via Edge Function dedicada para senha/CSC.
      // Para simplificar a 1ª entrega, guardamos texto plano somente se a chave de cifra estiver disponível
      // — mas o caminho recomendado é o edge function 'focusnfe-save-secrets'. Aqui salvamos só campos não-secretos.
      const payload: any = { ...rest, user_id: visibleUserId };
      const { data, error } = await supabase
        .from("tenant_fiscal_config" as any)
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .maybeSingle();
      if (error) throw error;

      // Secrets: enviar para edge function que cifra e atualiza
      if (senha_certificado || csc_producao || csc_homologacao) {
        await supabase.functions.invoke("focusnfe-save-secrets", {
          body: { senha_certificado, csc_producao, csc_homologacao },
        });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-config"] });
      toast.success("Dados fiscais salvos");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const activate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("focusnfe-cadastrar-empresa", {
        body: { upload_certificate: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-config"] });
      toast.success("Empresa ativada na FocusNFE!");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao ativar"),
  });

  const uploadCertificate = useMutation({
    mutationFn: async (file: File) => {
      if (!visibleUserId) throw new Error("Sem usuário");
      const path = `${visibleUserId}/cert.pfx`;
      const { error } = await supabase.storage
        .from("fiscal-certificates")
        .upload(path, file, { upsert: true, contentType: "application/x-pkcs12" });
      if (error) throw error;
      await supabase
        .from("tenant_fiscal_config" as any)
        .upsert({ user_id: visibleUserId, certificado_pfx_path: path }, { onConflict: "user_id" });
      return path;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-config"] });
      toast.success("Certificado enviado");
    },
    onError: (e: any) => toast.error(e.message || "Erro no upload"),
  });

  return {
    config: query.data,
    isLoading: query.isLoading,
    save: save.mutateAsync,
    isSaving: save.isPending,
    activate: activate.mutateAsync,
    isActivating: activate.isPending,
    uploadCertificate: uploadCertificate.mutateAsync,
    isUploading: uploadCertificate.isPending,
  };
}
