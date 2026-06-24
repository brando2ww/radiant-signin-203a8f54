import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, CreditCard, ArrowRight, Check, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserModules } from "@/hooks/use-user-modules";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PlanCard } from "@/components/billing/PlanCard";

type ModuleKey = "tarefas" | "avaliacoes" | "compras" | "pdv_completo";

const PLANS: {
  id: ModuleKey;
  name: string;
  description: string;
  price: number;
  features: { label: string }[];
  isCompleto?: boolean;
}[] = [
  {
    id: "tarefas",
    name: "Tarefas",
    description: "Gestão de tarefas recorrentes e checklists operacionais",
    price: 149,
    features: [
      { label: "Tarefas recorrentes" },
      { label: "Checklists de abertura/fechamento" },
      { label: "Relatório de execução" },
      { label: "Checklist público via QR Code" },
    ],
  },
  {
    id: "avaliacoes",
    name: "Avaliações",
    description: "Coleta e análise de avaliações de clientes",
    price: 149,
    features: [
      { label: "Campanhas de avaliação" },
      { label: "Relatórios e NPS" },
      { label: "Integração Google Reviews" },
      { label: "Avaliação via QR Code" },
    ],
  },
  {
    id: "compras",
    name: "Compras",
    description: "Cotações, pedidos de compra e gestão de fornecedores",
    price: 149,
    features: [
      { label: "Cotações com múltiplos fornecedores" },
      { label: "Lista de compras automática" },
      { label: "Pedidos de compra" },
      { label: "Gestão de fornecedores" },
    ],
  },
  {
    id: "pdv_completo",
    name: "Velara PDV Completo",
    description: "Plano completo com todos os módulos incluídos",
    price: 397,
    isCompleto: true,
    features: [
      { label: "PDV Core (caixa, salão, estoque, produtos)" },
      { label: "Módulo de Compras" },
      { label: "Módulo de Tarefas" },
      { label: "Módulo de Avaliações" },
    ],
  },
];

export default function Onboarding() {
  const { user } = useAuth();
  const { tenantId, activeModules, isLoading: modulesLoading } = useUserModules();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialStep = searchParams.get("step") === "2" ? 2 : 1;

  const [step, setStep] = useState<1 | 2>(tenantId ? 2 : (initialStep as 1 | 2));
  const [establishmentName, setEstablishmentName] = useState(
    user?.user_metadata?.full_name ?? ""
  );
  const [isCreatingTenant, setIsCreatingTenant] = useState(false);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(tenantId);
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutModuleKey, setCheckoutModuleKey] = useState<ModuleKey | null>(null);

  useEffect(() => {
    if (tenantId && step === 1) {
      setCreatedTenantId(tenantId);
      setStep(2);
    }
  }, [tenantId, step]);

  const activeMods = activeModules();

  const handleCreateEstablishment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!establishmentName.trim() || isCreatingTenant) return;

    setIsCreatingTenant(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-tenant-self-service`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ name: establishmentName.trim() }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Erro ao criar estabelecimento");
      }

      setCreatedTenantId(result.tenantId);
      setStep(2);
    } catch (err: unknown) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsCreatingTenant(false);
    }
  };

  const handleSubscribeModule = async (moduleKey: ModuleKey) => {
    const tid = createdTenantId ?? tenantId;
    if (!tid || isCheckingOut) return;

    setIsCheckingOut(true);
    setCheckoutModuleKey(moduleKey);

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
          body: JSON.stringify({
            tenantId: tid,
            moduleKeys: [moduleKey],
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Erro ao criar sessão de pagamento");
      }

      window.location.href = result.url;
    } catch (err: unknown) {
      toast({ title: "Erro no checkout", description: (err as Error).message, variant: "destructive" });
      setIsCheckingOut(false);
      setCheckoutModuleKey(null);
    }
  };

  const toggleModule = (key: ModuleKey) => {
    if (activeMods.includes(key as any)) return;
    setSelectedModules((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSubscribeSelected = async () => {
    const tid = createdTenantId ?? tenantId;
    if (!tid || !selectedModules.length || isCheckingOut) return;

    setIsCheckingOut(true);
    setCheckoutModuleKey(null);

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
          body: JSON.stringify({ tenantId: tid, moduleKeys: selectedModules }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Erro ao criar sessão");
      window.location.href = result.url;
    } catch (err: unknown) {
      toast({ title: "Erro no checkout", description: (err as Error).message, variant: "destructive" });
      setIsCheckingOut(false);
    }
  };

  if (modulesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-primary">Velara</span>
          <span className="text-muted-foreground text-sm">PDV</span>
        </div>
        <button
          onClick={() => supabase.auth.signOut().then(() => navigate("/"))}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Sair
        </button>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-3 py-6">
        <div className={`flex items-center gap-2 ${step >= 1 ? "text-primary" : "text-muted-foreground"}`}>
          <div className={`rounded-full w-7 h-7 flex items-center justify-center text-xs font-medium border-2 ${step >= 1 ? "border-primary bg-primary text-primary-foreground" : "border-muted"}`}>
            {step > 1 ? <Check className="h-3.5 w-3.5" /> : "1"}
          </div>
          <span className="text-sm font-medium hidden sm:inline">Estabelecimento</span>
        </div>
        <div className="h-px w-8 bg-border" />
        <div className={`flex items-center gap-2 ${step >= 2 ? "text-primary" : "text-muted-foreground"}`}>
          <div className={`rounded-full w-7 h-7 flex items-center justify-center text-xs font-medium border-2 ${step >= 2 ? "border-primary bg-primary text-primary-foreground" : "border-muted"}`}>
            2
          </div>
          <span className="text-sm font-medium hidden sm:inline">Plano</span>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 pb-12">
        <div className="w-full max-w-3xl">
          {/* Step 1 — Criar Estabelecimento */}
          {step === 1 && (
            <div className="rounded-xl border border-border bg-card p-8 space-y-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">Configurar seu estabelecimento</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Como se chama seu negócio? Você pode alterar isso depois nas configurações.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreateEstablishment} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do estabelecimento</Label>
                  <Input
                    id="name"
                    value={establishmentName}
                    onChange={(e) => setEstablishmentName(e.target.value)}
                    placeholder="Ex: Restaurante do João, Loja da Maria..."
                    className="text-base"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!establishmentName.trim() || isCreatingTenant}
                  className="w-full sm:w-auto"
                  size="lg"
                >
                  {isCreatingTenant ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  Continuar para planos
                </Button>
              </form>
            </div>
          )}

          {/* Step 2 — Escolher Plano */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <CreditCard className="h-6 w-6 text-primary" />
                  <h1 className="text-2xl font-bold">Escolha seu plano</h1>
                </div>
                <p className="text-muted-foreground text-sm">
                  Contrate apenas os módulos que você precisa ou o pacote completo.
                  Sem trial — acesso liberado após confirmação do pagamento.
                </p>
              </div>

              {/* Cards de módulos avulsos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {PLANS.filter((p) => !p.isCompleto).map((plan) => {
                  const isActive = activeMods.includes(plan.id as any);
                  const isSelected = selectedModules.includes(plan.id);
                  const isLoadingThis = isCheckingOut && checkoutModuleKey === plan.id;
                  return (
                    <PlanCard
                      key={plan.id}
                      {...plan}
                      isActive={isActive}
                      isSelected={isSelected}
                      onSelect={toggleModule}
                      onSubscribe={handleSubscribeModule}
                      isLoading={isLoadingThis}
                      disabled={isCheckingOut && !isLoadingThis}
                    />
                  );
                })}
              </div>

              {/* Seleção múltipla — botão de assinar selecionados */}
              {selectedModules.length > 1 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-sm">
                      {selectedModules.length} módulos selecionados
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total: R$ {(selectedModules.length * 149).toFixed(2).replace(".", ",")}/mês
                    </p>
                  </div>
                  <Button
                    onClick={handleSubscribeSelected}
                    disabled={isCheckingOut}
                    size="sm"
                  >
                    {isCheckingOut && !checkoutModuleKey ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Assinar selecionados
                  </Button>
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  ou
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* PDV Completo */}
              {PLANS.filter((p) => p.isCompleto).map((plan) => {
                const isActive = activeMods.includes("pdv" as any);
                const isLoadingThis = isCheckingOut && checkoutModuleKey === plan.id;
                return (
                  <div key={plan.id} className="relative">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <Badge className="bg-amber-500 text-white text-xs px-3 py-1">
                        <Zap className="h-3 w-3 mr-1" />
                        Melhor custo-benefício
                      </Badge>
                    </div>
                    <PlanCard
                      {...plan}
                      isActive={isActive}
                      onSubscribe={handleSubscribeModule}
                      isLoading={isLoadingThis}
                      disabled={isCheckingOut && !isLoadingThis}
                      actionLabel="Assinar PDV Completo — R$ 397/mês"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
