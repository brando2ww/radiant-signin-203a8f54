import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, ShieldAlert, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import type { RepBrand } from "@/hooks/use-vendas-rep";
import { RepBrandMark } from "./RepBrandMark";

export function RepLoading({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

const TEXTS = {
  inactive: {
    icon: UserX,
    title: "Seu acesso está pausado",
    body: "O seu cadastro de representante foi desativado pela empresa. Fale com o responsável para voltar a usar o app.",
  },
  missing: {
    icon: ShieldAlert,
    title: "Seu acesso ainda não foi liberado",
    body: "Não encontramos um cadastro de representante ligado ao seu login, ou a força de vendas não está ativa nesta empresa. Peça ao responsável para conferir o seu cadastro.",
  },
  error: {
    icon: ShieldAlert,
    title: "Não foi possível abrir o app",
    body: "Algo falhou ao carregar o seu cadastro. Confira a internet e tente de novo.",
  },
} as const;

/** Tela amigável para o representante sem cadastro ativo. */
export function RepBlocked({ reason, brand }: { reason: keyof typeof TEXTS; brand: RepBrand }) {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const t = TEXTS[reason];
  const Icon = t.icon;

  const sair = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-[100dvh] bg-muted/40">
      <div
        className="mx-auto flex min-h-[100dvh] max-w-[440px] flex-col bg-background px-6 sm:border-x"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-3 py-4">
          <RepBrandMark brand={brand} className="h-9 w-9" />
          <p className="truncate text-sm font-semibold">{brand.name || "Força de vendas"}</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </span>
          <h1 className="text-xl font-semibold">{t.title}</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{t.body}</p>
          {user?.email && <p className="text-xs text-muted-foreground">Entrou como {user.email}</p>}
          <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
            {reason === "error" && (
              <Button size="lg" onClick={() => window.location.reload()}>
                Tentar de novo
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={sair}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
