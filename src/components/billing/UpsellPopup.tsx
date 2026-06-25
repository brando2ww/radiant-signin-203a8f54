import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserModules, type UserModule } from "@/hooks/use-user-modules";
import { useUserRole } from "@/hooks/use-user-role";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const SUPPRESS_PATHS = ["/onboarding", "/admin", "/"];

interface Offer {
  key: string;
  title: string;
  description: string;
}

function getOffer(activeMods: UserModule[]): Offer | null {
  const has = (m: UserModule) => activeMods.includes(m);
  const hasCompleto = has("pdv");

  if (hasCompleto) return null;

  // Todos os 3 avulsos → sugerir completo
  if (has("tarefas") && has("avaliacoes") && has("compras")) {
    return {
      key: "suggest_completo",
      title: "Você já tem 3 módulos!",
      description: "Por R$ 599/mês, o PDV Completo inclui tudo isso + PDV Core. Pode ser mais vantajoso.",
    };
  }

  if (!has("tarefas") && (has("avaliacoes") || has("compras"))) {
    return {
      key: "suggest_tarefas",
      title: "Conheça o módulo Tarefas",
      description: "Gerencie tarefas e checklists operacionais por apenas R$ 149/mês.",
    };
  }

  if (!has("avaliacoes") && (has("tarefas") || has("compras"))) {
    return {
      key: "suggest_avaliacoes",
      title: "Colete avaliações dos seus clientes",
      description: "Módulo de Avaliações: NPS, campanhas e integração Google Reviews por R$ 149/mês.",
    };
  }

  if (!has("compras") && (has("tarefas") || has("avaliacoes"))) {
    return {
      key: "suggest_compras",
      title: "Otimize suas compras",
      description: "Cotações com fornecedores, lista de compras e pedidos por R$ 149/mês.",
    };
  }

  return null;
}

export function UpsellPopup() {
  const { role } = useUserRole();
  const { activeModules, tenantId, isStripeManaged } = useUserModules();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shownThisSession = useRef(false);
  const [offer, setOffer] = useState<Offer | null>(null);

  const pathname = location.pathname;
  const shouldSuppress = SUPPRESS_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.includes("assinatura") ||
    pathname.includes("onboarding");

  useEffect(() => {
    if (role !== "proprietario" || !isStripeManaged || shouldSuppress || shownThisSession.current) {
      return;
    }

    const mods = activeModules();
    const o = getOffer(mods);
    if (!o) return;

    // Checar se foi dispensado recentemente
    const checkDismissal = async () => {
      if (!tenantId || !user) return;
      const { data } = await (supabase.from("upsell_dismissals" as any) as any)
        .select("dismissed_until")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .eq("offer_key", o.key)
        .maybeSingle();

      if (data && new Date(data.dismissed_until) > new Date()) return;

      // Mostrar após 8 segundos
      setTimeout(() => {
        setOffer(o);
        setVisible(true);
        shownThisSession.current = true;
      }, 8000);
    };

    checkDismissal();
  }, [role, isStripeManaged, shouldSuppress]);

  const handleDismiss = async () => {
    setVisible(false);
    setDismissed(true);

    if (!tenantId || !user || !offer) return;
    const dismissedUntil = new Date();
    dismissedUntil.setDate(dismissedUntil.getDate() + 7);

    await (supabase.from("upsell_dismissals" as any) as any).upsert({
      tenant_id: tenantId,
      user_id: user.id,
      offer_key: offer.key,
      dismissed_until: dismissedUntil.toISOString(),
    }, { onConflict: "tenant_id,user_id,offer_key" });
  };

  const handleSeePlans = () => {
    setVisible(false);
    navigate("/pdv/assinatura");
  };

  if (!visible || dismissed || !offer) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-border bg-card shadow-lg animate-in slide-in-from-bottom-3">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <p className="font-semibold text-sm">{offer.title}</p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground pl-9">{offer.description}</p>
        <div className="flex gap-2 pl-9">
          <Button size="sm" onClick={handleSeePlans} className="flex-1">
            Ver planos
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss} className="flex-1">
            Agora não
          </Button>
        </div>
      </div>
    </div>
  );
}
