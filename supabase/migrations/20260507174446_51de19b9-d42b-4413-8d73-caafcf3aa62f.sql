-- Enums
DO $$ BEGIN
  CREATE TYPE public.delivery_driver_status AS ENUM ('disponivel','em_entrega','inativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.delivery_vehicle_type AS ENUM ('moto','bicicleta','carro','a_pe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Drivers table
CREATE TABLE IF NOT EXISTS public.delivery_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  vehicle_type public.delivery_vehicle_type NOT NULL DEFAULT 'moto',
  plate text,
  avatar_url text,
  avatar_color text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  status public.delivery_driver_status NOT NULL DEFAULT 'disponivel',
  current_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_drivers_user_status
  ON public.delivery_drivers (user_id, status);

ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers select" ON public.delivery_drivers;
CREATE POLICY "Drivers select" ON public.delivery_drivers
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_establishment_member(user_id));

DROP POLICY IF EXISTS "Drivers insert" ON public.delivery_drivers;
CREATE POLICY "Drivers insert" ON public.delivery_drivers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_establishment_member(user_id));

DROP POLICY IF EXISTS "Drivers update" ON public.delivery_drivers;
CREATE POLICY "Drivers update" ON public.delivery_drivers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_establishment_member(user_id));

DROP POLICY IF EXISTS "Drivers delete" ON public.delivery_drivers;
CREATE POLICY "Drivers delete" ON public.delivery_drivers
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_establishment_member(user_id));

DROP TRIGGER IF EXISTS trg_delivery_drivers_updated_at ON public.delivery_drivers;
CREATE TRIGGER trg_delivery_drivers_updated_at
  BEFORE UPDATE ON public.delivery_drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add driver fields to delivery_orders
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.delivery_drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_assigned_at timestamptz;

-- FK current_order_id (deferred since delivery_orders existed)
DO $$ BEGIN
  ALTER TABLE public.delivery_drivers
    ADD CONSTRAINT delivery_drivers_current_order_fk
    FOREIGN KEY (current_order_id) REFERENCES public.delivery_orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;