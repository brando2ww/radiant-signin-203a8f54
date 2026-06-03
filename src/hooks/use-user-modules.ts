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

  // Resolve tenant_id do usuário: owner → establishment_users.tenant_id →
  // tenant do dono do estabelecimento (para staff sem tenant_id direto).
  const { data: tenantId, isLoading: isLoadingTenantId } = useQuery({
    queryKey: ['user-tenant-id', user?.id],
    queryFn: async () => {
      if (!user) return null;

      // 1. usuário é dono de um tenant?
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle();
      if (tenant) return tenant.id;

      // 2. vínculo em establishment_users
      const { data: eu } = await supabase
        .from('establishment_users')
        .select('tenant_id, establishment_owner_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (eu?.tenant_id) return eu.tenant_id;

      // 3. staff sem tenant_id direto: resolver via tenant do dono do estabelecimento
      if (eu?.establishment_owner_id) {
        const { data: ownerTenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('owner_user_id', eu.establishment_owner_id)
          .maybeSingle();
        if (ownerTenant) return ownerTenant.id;
      }

      return null;
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
    // Sem tenant vinculado (legado): libera tudo
    if (!tenantId) return true;

    const mod = modules.find((m) => m.module === module);
    if (!mod) return false;

    if (mod.expires_at && new Date(mod.expires_at) < new Date()) return false;

    return true;
  };

  const activeModules = (): UserModule[] => {
    if (!tenantId) return ['pdv', 'financeiro', 'delivery', 'avaliacoes', 'tarefas', 'crm'];
    const now = new Date();
    return modules
      .filter((m) => !m.expires_at || new Date(m.expires_at) >= now)
      .map((m) => m.module as UserModule);
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
    activeModules,
    getDefaultModuleRoute,
    tenantId,
  };
}
