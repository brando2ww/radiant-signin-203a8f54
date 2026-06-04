
CREATE TABLE IF NOT EXISTS public.tenant_fiscal_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  razao_social text,
  nome_fantasia text,
  cnpj text,
  inscricao_estadual text,
  inscricao_municipal text,
  regime_tributario integer DEFAULT 1,
  telefone text,
  email text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  municipio text,
  uf text,
  cep text,
  codigo_municipio_ibge text,
  certificado_pfx_path text,
  certificado_senha_cifrada text,
  certificado_valido_ate timestamptz,
  csc_nfce_producao_cifrado text,
  csc_nfce_homologacao_cifrado text,
  id_token_nfce_producao integer,
  id_token_nfce_homologacao integer,
  habilita_nfce boolean NOT NULL DEFAULT false,
  habilita_nfe boolean NOT NULL DEFAULT false,
  habilita_nfse boolean NOT NULL DEFAULT false,
  serie_nfce integer DEFAULT 1,
  serie_nfe integer DEFAULT 1,
  serie_nfse integer DEFAULT 1,
  focusnfe_empresa_id bigint,
  focusnfe_ambiente text NOT NULL DEFAULT 'homologacao' CHECK (focusnfe_ambiente IN ('homologacao','producao')),
  focusnfe_token_producao_cifrado text,
  focusnfe_token_homologacao_cifrado text,
  cadastrada_em timestamptz,
  last_test_at timestamptz,
  last_test_status text,
  last_test_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_fiscal_config TO authenticated;
GRANT ALL ON public.tenant_fiscal_config TO service_role;

ALTER TABLE public.tenant_fiscal_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_config_select_owner_or_staff"
  ON public.tenant_fiscal_config
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_establishment_member(user_id));

CREATE POLICY "fiscal_config_insert_owner"
  ON public.tenant_fiscal_config
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "fiscal_config_update_owner"
  ON public.tenant_fiscal_config
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "fiscal_config_delete_owner"
  ON public.tenant_fiscal_config
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_tenant_fiscal_config_updated_at ON public.tenant_fiscal_config;
CREATE TRIGGER trg_tenant_fiscal_config_updated_at
  BEFORE UPDATE ON public.tenant_fiscal_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
