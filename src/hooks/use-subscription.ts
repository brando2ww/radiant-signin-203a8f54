import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserModules } from "@/hooks/use-user-modules";

export interface SubscriptionRecord {
  id: string;
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  planKey: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

export function useSubscription() {
  const { tenantId } = useUserModules();

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["tenant-subscription", tenantId],
    queryFn: async (): Promise<SubscriptionRecord | null> => {
      if (!tenantId) return null;
      const { data, error } = await (supabase.from("tenant_subscriptions" as any) as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        tenantId: data.tenant_id,
        stripeCustomerId: data.stripe_customer_id,
        stripeSubscriptionId: data.stripe_subscription_id,
        status: data.status,
        planKey: data.plan_key ?? null,
        currentPeriodStart: data.current_period_start ?? null,
        currentPeriodEnd: data.current_period_end ?? null,
        cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
        createdAt: data.created_at,
      };
    },
    enabled: !!tenantId,
  });

  const isActive = subscription?.status === "active";
  const isPastDue = subscription?.status === "past_due";
  const isCanceled = ["canceled", "incomplete_expired"].includes(subscription?.status ?? "");

  return { subscription: subscription ?? null, isLoading, isActive, isPastDue, isCanceled };
}
