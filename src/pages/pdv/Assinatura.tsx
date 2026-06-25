import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CreditCard, CheckCircle, AlertTriangle, XCircle,
  Loader2, ExternalLink, Package, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUserModules } from "@/hooks/use-user-modules";
import { useUserRole } from "@/hooks/use-user-role";
import { useSubscription } from "@/hooks/use-subscription";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PlanCard } from "@/components/billing/PlanCard";

type ModuleKey = "tarefas" | "avaliacoes" | "compras" | "pdv_completo";

const MODULE_INFO: Record<string, { name: string; description: string; price: number; features: { label: string }[] }> = {
  tarefas: {
    name: "Tarefas",
    description: "Tarefas recorrentes e checklists operacionais",
    price: 149,
    features: [
      { label: "Tarefas recorrentes" },
      { label: "Checklists operacionais" },
      { label: "Checklist público via QR Code" },
    ],
  },
  avaliacoes: {
    name: "Avaliações",
    description: "Coleta e análise de avaliações de clientes",
    price: 149,
    features: [
      { label: "Campanhas de avaliação" },
      { label: "Relatórios e NPS" },
      { label: "Integração Google Reviews" },
    ],
  },
  compras: {
    name: "Compras",
    description: "Cotações, pedidos e gestão de fornecedores",
    price: 149,
    features: [
      { label: "Cotações com fornecedores" },
      { label: "Pedidos de compra" },
      { label: "Gestão de fornecedores" },
    ],
  },
  pdv_completo: {
    name: "Velara PDV Completo",
    description: "PDV Core + Compras + Tarefas + Avaliações",
    price: 599,
    features: [
      { label: "PDV Core (caixa, salão, estoque)" },
      { label: "Módulo de Compras" },
      { label: "Módulo de Tarefas" },
      { label: "Módulo de Avaliações" },
    ],
  },
};

const ALL_BILLABLE_MODULES: ModuleKey[] = ["tarefas", "avaliacoes", "compras", "pdv_completo"];

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20"><CheckCircle className="h-3 w-3 mr-1" />Ativa</Badge>;
    case "past_due":
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Pagamento pendente</Badge>;
    case "canceled":
    case "incomplete_expired":
      return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Cancelada</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function Assinatura() {
  const { activeModules, tenantId, isStripeManaged } = useUserModules();
  const { role } = useUserRole();
  const { subscription, isLoading: subLoading } = useSubscription();
  const navigate = useNavigate();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const activeMods = activeModules();

  if (role !== "proprietario") {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-center p-8">
        <div className="space-y-2">
          <CreditCard className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="font-medium">Acesso restrito</p>
          <p className="text-sm text-muted-foreground">
            Esta página é acessível apenas para o proprietário da conta.
          </p>
        </div>
      </div>
    );
  }

  const handleSubscribeModule = async (moduleKey: ModuleKey) => {
    if (!tenantId || checkoutLoading) return;
    setCheckoutLoading(moduleKey);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ tenantId, moduleKeys: [moduleKey] }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.href = result.url;
    } catch (err: unknown) {
      toast({ title: "Erro no checkout", description: (err as Error).message, variant: "destructive" });
      setCheckoutLoading(null);
    }
  };

  const handleOpenPortal = async () => {
    if (!tenantId || portalLoading) return;
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-customer-portal`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ tenantId }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.open(result.url, "_blank");
    } catch (err: unknown) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  const hasCompleto = activeMods.includes("pdv" as any);
  const availableModules = ALL_BILLABLE_MODULES.filter((m) => {
    if (m === "pdv_completo") return !hasCompleto;
    return !activeMods.includes(m as any) && !hasCompleto;
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Assinatura</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie seus módulos contratados e cobrança.
          </p>
        </div>
        {isStripeManaged && (
          <Button
            variant="outline"
            onClick={handleOpenPortal}
            disabled={portalLoading}
            size="sm"
          >
            {portalLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Gerenciar cobrança
          </Button>
        )}
      </div>

      {/* Status da assinatura */}
      {subLoading ? (
        <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Carregando assinatura...</p>
        </div>
      ) : subscription ? (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Status da assinatura
            </h2>
            {statusBadge(subscription.status)}
          </div>
          {subscription.currentPeriodEnd && (
            <p className="text-sm text-muted-foreground">
              {subscription.cancelAtPeriodEnd ? "Cancela em" : "Próxima cobrança"}:{" "}
              <span className="font-medium text-foreground">
                {new Date(subscription.currentPeriodEnd).toLocaleDateString("pt-BR")}
              </span>
            </p>
          )}
        </div>
      ) : !isStripeManaged ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Conta em modo legado. Contate o suporte para migrar para o plano atual.
          </p>
        </div>
      ) : null}

      {/* Módulos ativos */}
      {activeMods.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-primary" />
            Módulos ativos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeMods.filter((m) => MODULE_INFO[m]).map((m) => {
              const info = MODULE_INFO[m];
              return (
                <div key={m} className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{info.name}</p>
                    <p className="text-xs text-muted-foreground">{info.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Módulos disponíveis */}
      {availableModules.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4 text-amber-500" />
            Módulos disponíveis
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableModules.filter((m) => m !== "pdv_completo").map((m) => {
              const info = MODULE_INFO[m];
              if (!info) return null;
              return (
                <PlanCard
                  key={m}
                  id={m}
                  {...info}
                  isActive={false}
                  onSubscribe={(id) => handleSubscribeModule(id as ModuleKey)}
                  isLoading={checkoutLoading === m}
                  disabled={!!checkoutLoading && checkoutLoading !== m}
                />
              );
            })}
          </div>

          {availableModules.includes("pdv_completo") && (
            <div className="mt-4">
              <PlanCard
                id="pdv_completo"
                {...MODULE_INFO.pdv_completo}
                isCompleto
                isActive={false}
                onSubscribe={(id) => handleSubscribeModule(id as ModuleKey)}
                isLoading={checkoutLoading === "pdv_completo"}
                disabled={!!checkoutLoading && checkoutLoading !== "pdv_completo"}
                actionLabel="Assinar PDV Completo — R$ 599/mês"
              />
            </div>
          )}
        </div>
      )}

      {activeMods.length === 0 && !subLoading && (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
          <CreditCard className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="font-medium">Nenhum módulo ativo</p>
          <p className="text-sm text-muted-foreground">
            Contrate um módulo para liberar o acesso ao sistema.
          </p>
          <Button onClick={() => navigate("/onboarding?step=2")}>
            Escolher plano
          </Button>
        </div>
      )}
    </div>
  );
}
