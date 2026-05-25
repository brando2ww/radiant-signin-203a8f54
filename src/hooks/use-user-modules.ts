import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type UserModule = 'financeiro' | 'crm' | 'delivery' | 'pdv' | 'avaliacoes' | 'tarefas';

interface TenantModuleRow {
  id: string;
  tenant_id: string;
  module: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export function useUserModules() {
  const { user } = useAuth();

  // First get the tenant_id for this user
  const { data: tenantId, isLoading: isLoadingTenantId } = useQuery({
    queryKey: ['user-tenant-id', user?.id],
    queryFn: async () => {
      if (!user) return null;

      // Check if user is a tenant owner
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      if (tenant) return tenant.id;

      // Check establishment_users for tenant_id
      const { data: eu } = await supabase
        .from('establishment_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .not('tenant_id', 'is', null)
        .maybeSingle();

      return eu?.tenant_id || null;
    },
    enabled: !!user,
  });

  const { data: modules = [], isLoading: isLoadingModules } = useQuery({
    queryKey: ['tenant-modules', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('tenant_modules')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (error) throw error;
      return data as TenantModuleRow[];
    },
    enabled: !!tenantId,
  });

  const hasModule = (module: UserModule): boolean => {
    if (!user) return false;
    // If no tenant_id found (legacy/no tenant setup), allow all
    if (!tenantId) return true;

    const mod = modules.find((m) => m.module === module);
    if (!mod) return false;

    if (mod.expires_at) {
      if (new Date(mod.expires_at) < new Date()) return false;
    }

    return true;
  };

  const getDefaultModuleRoute = (): string => {
    if (hasModule('pdv')) return '/pdv/dashboard';
    if (hasModule('avaliacoes')) return '/avaliacoes';
    if (hasModule('delivery')) return '/pdv/dashboard';
    return '/pdv/dashboard';
  };

  return {
    modules,
    isLoading: isLoadingTenantId || isLoadingModules,
    hasModule,
    getDefaultModuleRoute,
    tenantId,
  };
}
