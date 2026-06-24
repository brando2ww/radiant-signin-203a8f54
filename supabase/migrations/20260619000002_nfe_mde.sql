-- MDe (Manifestação do Destinatário) — controle de versão por tenant
ALTER TABLE public.tenant_fiscal_config
  ADD COLUMN IF NOT EXISTS last_mde_version text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS last_mde_query_at timestamptz;

-- Colunas MDe nas notas de entrada (pdv_invoices já tem source='manual')
ALTER TABLE public.pdv_invoices
  ADD COLUMN IF NOT EXISTS mde_status text,          -- situacao_manifesto da Focus: pendente, ciencia, confirmado, desconhecido, nao_realizado
  ADD COLUMN IF NOT EXISTS mde_raw_payload jsonb,    -- payload bruto retornado pela Focus MDe
  ADD COLUMN IF NOT EXISTS mde_queried_at timestamptz; -- última vez que consultamos detalhes desta nota

-- Logs de consultas MDe por tenant
CREATE TABLE IF NOT EXISTS public.nfe_mde_query_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  cnpj text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'error')),
  version_before text,
  version_after text,
  found_count integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Eventos de manifestação por nota
CREATE TABLE IF NOT EXISTS public.nfe_mde_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.pdv_invoices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  event_type text NOT NULL CHECK (event_type IN ('ciencia', 'confirmacao', 'desconhecimento', 'operacao_nao_realizada')),
  status text NOT NULL CHECK (status IN ('success', 'error')),
  protocol text,
  focus_response jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nfe_mde_query_logs_user ON public.nfe_mde_query_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_nfe_mde_query_logs_created ON public.nfe_mde_query_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nfe_mde_events_invoice ON public.nfe_mde_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pdv_invoices_source ON public.pdv_invoices(user_id, source);

ALTER TABLE public.nfe_mde_query_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfe_mde_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads their mde logs"
  ON public.nfe_mde_query_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Owner reads their mde events"
  ON public.nfe_mde_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());
