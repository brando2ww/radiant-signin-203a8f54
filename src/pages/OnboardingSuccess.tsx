import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserModules } from "@/hooks/use-user-modules";

export default function OnboardingSuccess() {
  const navigate = useNavigate();
  const { tenantId, activeModules, getDefaultModuleRoute } = useUserModules();
  const [attempts, setAttempts] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const MAX_ATTEMPTS = 10;

  useEffect(() => {
    if (attempts >= MAX_ATTEMPTS) {
      setTimedOut(true);
      return;
    }

    const active = activeModules();
    if (active.length > 0) {
      // Módulos ativos — redirecionar
      setTimeout(() => navigate(getDefaultModuleRoute()), 1500);
      return;
    }

    // Aguardar webhook processar
    const timer = setTimeout(async () => {
      if (tenantId) {
        // Invalidar cache de módulos para re-buscar
        await supabase
          .from("tenant_modules")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("is_active", true);
      }
      setAttempts((a) => a + 1);
    }, 3000);

    return () => clearTimeout(timer);
  }, [attempts, tenantId]);

  const active = activeModules();
  const isReady = active.length > 0;

  if (isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="text-center space-y-4 p-8">
          <CheckCircle className="h-16 w-16 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">Assinatura ativada!</h1>
          <p className="text-muted-foreground">Redirecionando para o sistema...</p>
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="text-center space-y-4 p-8 max-w-md">
          <AlertCircle className="h-16 w-16 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-bold">Pagamento recebido</h1>
          <p className="text-muted-foreground text-sm">
            Seu pagamento foi processado. A liberação dos módulos pode levar alguns minutos.
            Verifique seu email de confirmação e tente acessar o sistema em instantes.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setAttempts(0)}>
              Verificar novamente
            </Button>
            <Button onClick={() => navigate("/")}>
              Ir para o login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
      <div className="text-center space-y-4 p-8">
        <div className="relative mx-auto w-16 h-16">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <CheckCircle className="h-7 w-7 text-primary absolute inset-0 m-auto" />
        </div>
        <h1 className="text-2xl font-bold">Pagamento processado!</h1>
        <p className="text-muted-foreground">
          Aguardando confirmação e liberação dos módulos...
        </p>
        <p className="text-xs text-muted-foreground">
          Tentativa {attempts + 1}/{MAX_ATTEMPTS}
        </p>
      </div>
    </div>
  );
}
