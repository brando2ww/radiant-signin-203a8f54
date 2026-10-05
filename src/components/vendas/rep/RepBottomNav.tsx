import { useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PiggyBank,
  ShoppingBag,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useRepContext } from "./RepContext";
import { SHEET_CLOSE_GRANDE, initials } from "./rep-utils";

type Tab = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean };

const TABS: Tab[] = [
  { to: "/representante", label: "Hoje", icon: Home, end: true },
  { to: "/representante/clientes", label: "Clientes", icon: Users },
  { to: "/representante/catalogo", label: "Catálogo", icon: Package },
  { to: "/representante/propostas", label: "Propostas", icon: FileText },
];

const MORE_ITEMS: { to: string; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { to: "/representante/pedidos", label: "Pedidos", hint: "Pedidos fechados e a situação de cada um", icon: ShoppingBag },
  { to: "/representante/agenda", label: "Agenda", hint: "Visitas, ligações e tarefas", icon: CalendarDays },
  { to: "/representante/comissoes", label: "Comissões", hint: "O que você já recebeu e o que vem por aí", icon: PiggyBank },
];

function isActive(pathname: string, to: string, end?: boolean) {
  const p = pathname.replace(/\/+$/, "") || "/";
  return end ? p === to : p === to || p.startsWith(to + "/");
}

/** Barra de abas fixa no rodapé (largura do celular, também no computador). */
export function RepBottomNav({ onOpenMore, moreOpen }: { onOpenMore: () => void; moreOpen: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const moreActive = moreOpen || MORE_ITEMS.some((i) => isActive(pathname, i.to));

  const item = (key: string, label: string, Icon: Tab["icon"], active: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-12 items-center justify-center rounded-full transition-colors",
          active && "bg-primary/10",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="leading-none">{label}</span>
    </button>
  );

  return (
    <nav
      aria-label="Navegação do representante"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[440px] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:border-x"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5">
        {TABS.map((t) =>
          item(t.to, t.label, t.icon, !moreOpen && isActive(pathname, t.to, t.end), () => navigate(t.to)),
        )}
        {item("mais", "Mais", Menu, moreActive, onOpenMore)}
      </div>
    </nav>
  );
}

/** Menu "Mais": pedidos, agenda, comissões e sair. */
export function RepMoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { signOut, user } = useAuth();
  const { rep, isPreview, brand } = useRepContext();

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  const sair = async () => {
    onOpenChange(false);
    await signOut();
    navigate("/", { replace: true });
  };

  const rowClass =
    "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted active:bg-muted";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn("mx-auto max-h-[85dvh] max-w-[440px] overflow-y-auto rounded-t-2xl p-0", SHEET_CLOSE_GRANDE)}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <SheetHeader className="border-b py-4 pl-5 pr-16 text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initials(rep?.name || (isPreview ? "Prévia" : user?.email))}
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-base">
                {rep?.name || (isPreview ? "Pré-visualização" : "Representante")}
              </SheetTitle>
              <SheetDescription className="truncate text-xs">
                {isPreview ? "Você está vendo o app como o representante" : user?.email}
                {brand.name ? ` · ${brand.name}` : ""}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-1 px-2 py-2">
          {MORE_ITEMS.map((i) => {
            const active = isActive(pathname, i.to);
            return (
              <button key={i.to} type="button" onClick={() => go(i.to)} className={cn(rowClass, active && "bg-muted")}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <i.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{i.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{i.hint}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>

        <div className="space-y-1 border-t px-2 pt-2">
          {isPreview && (
            <button type="button" onClick={() => go("/pdv/vendas")} className={rowClass}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <LayoutDashboard className="h-5 w-5" />
              </span>
              <span className="flex-1 text-sm font-medium">Voltar ao painel de vendas</span>
            </button>
          )}
          <button type="button" onClick={sair} className={cn(rowClass, "text-destructive")}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <LogOut className="h-5 w-5" />
            </span>
            <span className="flex-1 text-sm font-medium">Sair</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
