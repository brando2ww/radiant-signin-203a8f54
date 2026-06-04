-- Helper padronizado para acesso por owner
CREATE OR REPLACE FUNCTION public.can_access_owner(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _owner IS NOT NULL
    AND (_owner = auth.uid() OR public.is_establishment_member(_owner));
$$;

-- tenant_integrations: permitir que o próprio dono do tenant (ou membros) leiam
DROP POLICY IF EXISTS "Tenant can view own integrations" ON public.tenant_integrations;

CREATE POLICY "Tenant can view own integrations"
ON public.tenant_integrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = tenant_integrations.tenant_id
      AND public.can_access_owner(t.owner_user_id)
  )
);