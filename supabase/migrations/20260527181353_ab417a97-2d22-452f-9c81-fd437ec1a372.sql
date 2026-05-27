
-- 1. Add columns to delivery_customers
ALTER TABLE public.delivery_customers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'CPF';

CREATE INDEX IF NOT EXISTS idx_delivery_customers_email ON public.delivery_customers(email);
CREATE INDEX IF NOT EXISTS idx_delivery_customers_auth_user_id ON public.delivery_customers(auth_user_id);

-- 2. Trigger to upsert delivery_customers when a delivery_customer auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_delivery_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_name text;
  v_phone text;
  v_cpf text;
  v_birth date;
  v_doc_type text;
  v_existing_id uuid;
BEGIN
  v_role := NEW.raw_user_meta_data->>'role';
  IF v_role IS DISTINCT FROM 'delivery_customer' THEN
    RETURN NEW;
  END IF;

  v_name := COALESCE(NEW.raw_user_meta_data->>'name', '');
  v_phone := regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '\D', '', 'g');
  v_cpf := NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'cpf', ''), '\D', '', 'g'), '');
  v_doc_type := COALESCE(NEW.raw_user_meta_data->>'document_type', 'CPF');
  BEGIN
    v_birth := NULLIF(NEW.raw_user_meta_data->>'birth_date', '')::date;
  EXCEPTION WHEN OTHERS THEN
    v_birth := NULL;
  END;

  -- Match priority: phone, then email
  IF v_phone <> '' THEN
    SELECT id INTO v_existing_id FROM public.delivery_customers
      WHERE regexp_replace(phone, '\D', '', 'g') = v_phone
      LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.delivery_customers
      WHERE lower(email) = lower(NEW.email)
      LIMIT 1;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.delivery_customers
       SET auth_user_id = NEW.id,
           name = COALESCE(NULLIF(v_name, ''), name),
           email = COALESCE(NEW.email, email),
           cpf = COALESCE(v_cpf, cpf),
           birth_date = COALESCE(v_birth, birth_date),
           document_type = COALESCE(v_doc_type, document_type),
           updated_at = now()
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.delivery_customers
      (auth_user_id, name, phone, email, cpf, birth_date, document_type)
    VALUES
      (NEW.id, v_name, v_phone, NEW.email, v_cpf, v_birth, v_doc_type);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_delivery_customer ON auth.users;
CREATE TRIGGER on_auth_user_created_delivery_customer
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_delivery_customer();

-- 3. RLS: customer can view & update own delivery_customers row
DROP POLICY IF EXISTS "Customers can view own profile" ON public.delivery_customers;
CREATE POLICY "Customers can view own profile"
  ON public.delivery_customers FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Customers can update own profile" ON public.delivery_customers;
CREATE POLICY "Customers can update own profile"
  ON public.delivery_customers FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- 4. RLS: customer can view own orders
DROP POLICY IF EXISTS "Customers can view own orders" ON public.delivery_orders;
CREATE POLICY "Customers can view own orders"
  ON public.delivery_orders FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM public.delivery_customers WHERE auth_user_id = auth.uid()
    )
  );
