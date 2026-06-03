import { useNavigate } from "react-router-dom";
import { Lock, MessageCircle, LogOut, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserModules, type UserModule } from "@/hooks/use-user-modules";
import { MODULE_LABELS } from "@/lib/access/module-routes";

interface ModuleUnavailableProps {
  module?: UserModule | null;
}

const SUPPORT_WHATSAPP =
  (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined) ?? "";

export default function ModuleUnavailable({ module }: ModuleUnavailableProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { activeModules } = useUserModules();

  const label = module ? MODULE_LABELS[module] ?? module : "este módulo";
  const ativos = activeModules()
    .map((m) => MODULE_LABELS[m] ?? m)
    .join(", ");

  const handleSupport = () => {
    if (SUPPORT_WHATSAPP) {
      const msg = encodeURIComponent(
        `Olá! Gostaria de habilitar o módulo "${label}" no meu plano.`,
      );
      window.open(
        `https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, "")}?text=${msg}`,
        "_blank",
      );
    } else {
      window.location.href = `mailto:suporte@velaraia.app?subject=${encodeURIComponent(
        `Habilitar módulo ${label}`,
      )}`;
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Módulo não disponível</CardTitle>
          <CardDescription>
            O módulo <strong>{label}</strong> não está incluído no seu plano atual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ativos && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Módulos ativos:</span> {ativos}
            </div>
          )}
          <p className="text-sm text-muted-foreground text-center">
            Entre em contato com o suporte para habilitar este recurso.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={handleSupport} className="w-full">
              <MessageCircle className="h-4 w-4 mr-2" />
              Falar com suporte
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <Button variant="ghost" className="flex-1" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
