import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type UserModule = 'financeiro' | 'crm' | 'delivery' | 'pdv' | 'avaliacoes' | 'tarefas' | 'compras';

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

  // Resolve tenant_id + stripe_customer_id do usuário.
  const { data: tenantData, isLoading: isLoadingTenantId } = useQuery({
    queryKey: ['user-tenant-id', user?.id],
    queryFn: async () => {
      if (!user) return null;

      // 1. usuário é dono de um tenant?
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, stripe_customer_id')
        .eq('owner_user_id', user.id)
        .maybeSingle();
      if (tenant) return { id: tenant.id, stripeCustomerId: tenant.stripe_customer_id as string | null };

      // 2. vínculo em establishment_users
      const { data: eu } = await supabase
        .from('establishment_users')
        .select('tenant_id, establishment_owner_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (eu?.tenant_id) {
        // Resolve stripe_customer_id para staff
        const { data: t } = await supabase
          .from('tenants')
          .select('id, stripe_customer_id')
          .eq('id', eu.tenant_id)
          .maybeSingle();
        return { id: eu.tenant_id, stripeCustomerId: (t?.stripe_customer_id as string | null) ?? null };
      }

      // 3. staff sem tenant_id direto: resolver via tenant do dono do estabelecimento
      if (eu?.establishment_owner_id) {
        const { data: ownerTenant } = await supabase
          .from('tenants')
          .select('id, stripe_customer_id')
          .eq('owner_user_id', eu.establishment_owner_id)
          .maybeSingle();
        if (ownerTenant) return { id: ownerTenant.id, stripeCustomerId: ownerTenant.stripe_customer_id as string | null };
      }

      return null;
    },
    enabled: !!user,
  });

  const tenantId = tenantData?.id ?? null;
  const isStripeManaged = !!(tenantData?.stripeCustomerId);

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
    if (!tenantId) return ['pdv', 'compras', 'financeiro', 'delivery', 'avaliacoes', 'tarefas', 'crm'];
    const now = new Date();
    return modules
      .filter((m) => !m.expires_at || new Date(m.expires_at) >= now)
      .map((m) => m.module as UserModule);
  };

  const getDefaultModuleRoute = (): string => {
    // Sem tenant (legado): mantém PDV
    if (!tenantId) return '/pdv/caixa';
    const active = activeModules();
    // Standalone só quando avaliações é o ÚNICO módulo
    if (active.length === 1 && active[0] === 'avaliacoes') return '/avaliacoes';
    if (hasModule('pdv')) return '/pdv/caixa';
    if (hasModule('avaliacoes')) return '/pdv/avaliacoes';
    if (hasModule('tarefas')) return '/pdv/tarefas';
    if (hasModule('delivery')) return '/pdv/delivery/pedidos';
    if (hasModule('financeiro')) return '/pdv/financeiro/lancamentos';
    if (hasModule('crm')) return '/pdv/crm';
    return '/pdv/caixa';
  };

  return {
    modules,
    isLoading: isLoadingTenantId || isLoadingModules,
    hasModule,
    activeModules,
    getDefaultModuleRoute,
    tenantId,
    isStripeManaged,
  };
}
