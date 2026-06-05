
-- 1) Carimbar role nos usuários existentes
-- Clientes finais (têm linha em delivery_customers.auth_user_id)
UPDATE auth.users u
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'delivery_customer')
WHERE id IN (SELECT auth_user_id FROM public.delivery_customers WHERE auth_user_id IS NOT NULL)
  AND COALESCE(raw_user_meta_data->>'role','') <> 'delivery_customer';

-- Estabelecimentos (donos de tenant, staff, super admin, ou que já têm profile)
UPDATE auth.users u
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'establishment')
WHERE COALESCE(raw_user_meta_data->>'role','') = ''
  AND (
    EXISTS (SELECT 1 FROM public.tenants t WHERE t.owner_user_id = u.id)
    OR EXISTS (SELECT 1 FROM public.establishment_users eu WHERE eu.user_id = u.id)
    OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = u.id)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
  );

-- 2) Limpar profiles órfãos de clientes finais (não devem ter profile de estabelecimento)
DELETE FROM public.profiles p
WHERE p.id IN (SELECT auth_user_id FROM public.delivery_customers WHERE auth_user_id IS NOT NULL);

-- 3) Recriar handle_new_user para não criar profile quando for cliente final
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Clientes finais (delivery/fidelidade) não recebem profile de estabelecimento
  IF COALESCE(NEW.raw_user_meta_data->>'role','') = 'delivery_customer' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, full_name, document_type, document)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'document_type',
    NEW.raw_user_meta_data->>'document'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 4) Helper para guards
CREATE OR REPLACE FUNCTION public.is_delivery_customer(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _uid
      AND COALESCE(u.raw_user_meta_data->>'role','') = 'delivery_customer'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_delivery_customer(uuid) TO anon, authenticated, service_role;
