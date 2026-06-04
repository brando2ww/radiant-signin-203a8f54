
-- 1) admin_settings
CREATE TABLE public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_settings TO authenticated;
GRANT ALL ON public.admin_settings TO service_role;

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins manage admin settings"
  ON public.admin_settings
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE TRIGGER admin_settings_updated_at
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) pdv_printer_status
CREATE TABLE public.pdv_printer_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.pdv_device_config(id) ON DELETE CASCADE,
  production_center_id uuid NOT NULL REFERENCES public.pdv_production_centers(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  is_online boolean NOT NULL DEFAULT false,
  last_tested_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, production_center_id)
);

CREATE INDEX idx_pdv_printer_status_owner ON public.pdv_printer_status(owner_user_id);
CREATE INDEX idx_pdv_printer_status_center ON public.pdv_printer_status(production_center_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_printer_status TO authenticated;
GRANT ALL ON public.pdv_printer_status TO service_role;

ALTER TABLE public.pdv_printer_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner and staff read printer status"
  ON public.pdv_printer_status
  FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_establishment_member(owner_user_id));

CREATE POLICY "owner and staff write printer status"
  ON public.pdv_printer_status
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR public.is_establishment_member(owner_user_id));

CREATE POLICY "owner and staff update printer status"
  ON public.pdv_printer_status
  FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_establishment_member(owner_user_id))
  WITH CHECK (owner_user_id = auth.uid() OR public.is_establishment_member(owner_user_id));

CREATE POLICY "owner and staff delete printer status"
  ON public.pdv_printer_status
  FOR DELETE
  TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_establishment_member(owner_user_id));

CREATE TRIGGER pdv_printer_status_updated_at
  BEFORE UPDATE ON public.pdv_printer_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
