import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Tenant {
  id: string;
  name: string;
  document: string | null;
  owner_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  parent_tenant_id: string | null;
}

export interface TenantModule {
  id: string;
  tenant_id: string;
  module: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface TenantIntegration {
  id: string;
  tenant_id: string;
  integration_slug: string;
  is_active: boolean;
  created_at: string;
}

export function useTenants() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Tenant[];
    },
    enabled: !!user?.id,
  });

  const createTenant = useMutation({
    mutationFn: async (payload: {
      name: string;
      document?: string;
      modules: string[];
      admin_email: string;
      admin_password: string;
      admin_name: string;
      admin_phone?: string;
      parent_tenant_id?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("create-tenant", {
        body: payload,
      });
      if (error) {
        const msg = data?.error || error.message;
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Tenant criado com sucesso!");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao criar tenant");
    },
  });

  const fetchTenantModules = async (tenantId: string): Promise<TenantModule[]> => {
    const { data, error } = await supabase
      .from("tenant_modules")
      .select("*")
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return data as TenantModule[];
  };

  const fetchTenantUsers = async (tenantId: string) => {
    const { data, error } = await supabase
      .from("establishment_users")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  };

  const fetchTenantIntegrations = async (tenantId: string): Promise<TenantIntegration[]> => {
    const { data, error } = await supabase
      .from("tenant_integrations")
      .select("*")
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return data as TenantIntegration[];
  };

  const updateTenantUser = async (
    userId: string,
    updates: {
      role?: "proprietario" | "gerente" | "caixa" | "garcom" | "cozinheiro" | "estoquista" | "financeiro" | "atendente_delivery";
      is_active?: boolean;
      max_discount_percent?: number;
      discount_password?: string;
    }
  ) => {
    const { error } = await supabase
      .from("establishment_users")
      .update(updates)
      .eq("id", userId);
    if (error) throw error;
  };

  const toggleTenantModule = async (moduleId: string, isActive: boolean) => {
    const { error } = await supabase
      .from("tenant_modules")
      .update({ is_active: isActive })
      .eq("id", moduleId);
    if (error) throw error;
  };

  const upsertTenantModule = async (
    tenantId: string,
    module: string,
    isActive: boolean
  ) => {
    const { data: existing, error: selError } = await supabase
      .from("tenant_modules")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("module", module as any)
      .maybeSingle();
    if (selError) throw selError;

    if (existing) {
      const { error } = await supabase
        .from("tenant_modules")
        .update({ is_active: isActive })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("tenant_modules")
        .insert({ tenant_id: tenantId, module: module as any, is_active: isActive });
      if (error) throw error;
    }
  };

  const deleteTenant = async (tenantId: string) => {
    const { error } = await supabase.from("tenants").delete().eq("id", tenantId);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["tenants"] });
  };

  const saveTenantIntegrations = async (
    tenantId: string,
    slugs: string[]
  ) => {
    const { error: delError } = await supabase
      .from("tenant_integrations")
      .delete()
      .eq("tenant_id", tenantId);
    if (delError) throw delError;

    if (slugs.length > 0) {
      const rows = slugs.map((slug) => ({
        tenant_id: tenantId,
        integration_slug: slug,
        is_active: true,
      }));
      const { error: insError } = await supabase
        .from("tenant_integrations")
        .insert(rows);
      if (insError) throw insError;
    }
  };

  // --- Franchise functions ---

  const fetchChildTenants = async (parentId: string): Promise<Tenant[]> => {
    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("parent_tenant_id", parentId)
      .order("name");
    if (error) throw error;
    return data as Tenant[];
  };

  const linkChildTenant = async (parentId: string, childId: string) => {
    const { error } = await supabase
      .from("tenants")
      .update({ parent_tenant_id: parentId })
      .eq("id", childId);
    if (error) throw error;
  };

  const unlinkChildTenant = async (childId: string) => {
    const { error } = await supabase
      .from("tenants")
      .update({ parent_tenant_id: null })
      .eq("id", childId);
    if (error) throw error;
  };

  const fetchTenantProducts = async (tenantId: string) => {
    // Get owner_user_id of tenant
    const { data: tenant } = await supabase
      .from("tenants")
      .select("owner_user_id")
      .eq("id", tenantId)
      .single();
    if (!tenant?.owner_user_id) return [];

    const { data, error } = await supabase
      .from("pdv_products")
      .select("id, name, category, price_salon, image_url, is_available")
      .eq("user_id", tenant.owner_user_id)
      .order("name");
    if (error) throw error;
    return data || [];
  };

  const fetchTenantTables = async (tenantId: string) => {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("owner_user_id")
      .eq("id", tenantId)
      .single();
    if (!tenant?.owner_user_id) return [];

    const { data, error } = await supabase
      .from("pdv_tables")
      .select("id, table_number, capacity, shape, sector_id")
      .eq("user_id", tenant.owner_user_id)
      .is("deleted_at", null)
      .order("table_number");
    if (error) throw error;
    return data || [];
  };

  const shareProducts = async (
    sourceTenantId: string,
    targetTenantIds: string[],
    productIds: string[]
  ) => {
    const { data, error } = await supabase.functions.invoke("sync-shared-products", {
      body: {
        action: "share_products",
        source_tenant_id: sourceTenantId,
        target_tenant_ids: targetTenantIds,
        product_ids: productIds,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const syncProducts = async (sourceTenantId: string) => {
    const { data, error } = await supabase.functions.invoke("sync-shared-products", {
      body: {
        action: "sync_products",
        source_tenant_id: sourceTenantId,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const shareTables = async (
    sourceTenantId: string,
    targetTenantIds: string[],
    tableIds: string[]
  ) => {
    const { data, error } = await supabase.functions.invoke("sync-shared-products", {
      body: {
        action: "share_tables",
        source_tenant_id: sourceTenantId,
        target_tenant_ids: targetTenantIds,
        table_ids: tableIds,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  return {
    tenants,
    isLoading,
    createTenant,
    fetchTenantModules,
    fetchTenantUsers,
    fetchTenantIntegrations,
    updateTenantUser,
    toggleTenantModule,
    upsertTenantModule,
    saveTenantIntegrations,
    fetchChildTenants,
    linkChildTenant,
    unlinkChildTenant,
    fetchTenantProducts,
    fetchTenantTables,
    shareProducts,
    syncProducts,
    shareTables,
  };
}
