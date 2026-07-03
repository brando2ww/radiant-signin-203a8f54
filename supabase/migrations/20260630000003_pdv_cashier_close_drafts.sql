-- Rascunho cross-device da Etapa 1 do fechamento de caixa.
-- Permite que um operador inicie o fechamento em uma máquina e continue em outra.
-- A tabela pdv_cashier_close_blind_snapshots continua sendo o snapshot committed (após "Avançar").
CREATE TABLE IF NOT EXISTS public.pdv_cashier_close_drafts (
  cashier_session_id uuid PRIMARY KEY REFERENCES public.pdv_cashier_sessions(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL,
  declared_cash      numeric,
  declared_credit    numeric,
  declared_debit     numeric,
  declared_pix       numeric,
  declared_voucher   numeric,
  declared_fiado     numeric,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pdv_cashier_close_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "draft_all" ON public.pdv_cashier_close_drafts
  FOR ALL
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.establishment_users eu
      WHERE eu.establishment_owner_id = public.pdv_cashier_close_drafts.user_id
        AND eu.user_id = auth.uid()
        AND eu.is_active = true
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.establishment_users eu
      WHERE eu.establishment_owner_id = user_id
        AND eu.user_id = auth.uid()
        AND eu.is_active = true
    )
  );
