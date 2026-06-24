-- pdv_purchase_settings: configurações do módulo de compras por usuário
CREATE TABLE IF NOT EXISTS public.pdv_purchase_settings (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                   uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  quotation_prefix          text NOT NULL DEFAULT 'COT',
  quotation_digits          int  NOT NULL DEFAULT 4,
  order_prefix              text NOT NULL DEFAULT 'PC',
  order_digits              int  NOT NULL DEFAULT 4,
  min_suppliers             int  NOT NULL DEFAULT 1,
  default_deadline_days     int  NOT NULL DEFAULT 3,
  default_message_template  text,
  require_manager_approval  boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.pdv_purchase_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages purchase settings"
  ON public.pdv_purchase_settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- pdv_financial_settings: configurações do módulo financeiro por usuário
CREATE TABLE IF NOT EXISTS public.pdv_financial_settings (
  id                                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                             uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  default_accounting_regime           text NOT NULL DEFAULT 'cash',
  default_payable_chart_account_id    uuid REFERENCES public.pdv_chart_of_accounts(id) ON DELETE SET NULL,
  default_receivable_chart_account_id uuid REFERENCES public.pdv_chart_of_accounts(id) ON DELETE SET NULL,
  default_cost_center_id              uuid REFERENCES public.pdv_cost_centers(id)        ON DELETE SET NULL,
  default_bank_account_id             uuid REFERENCES public.pdv_bank_accounts(id)       ON DELETE SET NULL,
  overdue_tolerance_days              int  NOT NULL DEFAULT 0,
  alert_due_date_enabled              boolean NOT NULL DEFAULT false,
  alert_due_date_days_before          int  NOT NULL DEFAULT 3,
  alert_due_date_email                text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.pdv_financial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages financial settings"
  ON public.pdv_financial_settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
