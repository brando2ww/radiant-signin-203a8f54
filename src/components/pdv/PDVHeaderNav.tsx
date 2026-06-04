import { NavLink, useLocation } from "react-router-dom";
import { useState, useMemo } from "react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Armchair,
  ShoppingBag,
  
  Package,
  Warehouse,
  Truck,
  BarChart3,
  Settings,
  FileText,
  TrendingDown,
  TrendingUp,
  ArrowLeftRight,
  FolderTree,
  Target,
  FileBarChart,
  PackageSearch,
  PieChart,
  Receipt,
  DollarSign,
  UtensilsCrossed,
  Tag,
  Palette,
  MapPin,
  Store,
  Megaphone,
  Plug,
  Users,
  UserCheck,
  Star,
  GitBranch,
  ClipboardCheck,
  Factory,
  Bike,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import { useUserModules } from "@/hooks/use-user-modules";
import { isAlwaysAllowed, moduleForRoute } from "@/lib/access/module-routes";

interface Announcement {
  id: string;
  title: string;
  message: string;
  date: string;
}

const announcements: Announcement[] = [
  {
    id: "1",
    title: "Bem-vindo ao Velara PDV!",
    message: "Configure suas mesas e produtos para começar.",
    date: "13/01/2026",
  },
];

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

interface Section {
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

const sectionItems: Section[] = [
  {
    title: "Frente de Caixa",
    icon: Store,
    items: [
      { title: "Salão", url: "/pdv/salao", icon: Armchair },
      
      { title: "Caixa", url: "/pdv/caixa", icon: DollarSign },
      
    ],
  },
  {
    title: "Delivery",
    icon: Truck,
    items: [
      { title: "Pedidos", url: "/pdv/delivery/pedidos", icon: ShoppingBag },
      { title: "Entregadores", url: "/pdv/delivery/entregadores", icon: Bike },
      { title: "Cardápio", url: "/pdv/delivery/cardapio", icon: UtensilsCrossed },
      { title: "Personalização", url: "/pdv/delivery/personalizacao", icon: Palette },
      { title: "Cupons", url: "/pdv/delivery/cupons", icon: Tag },
      { title: "Configurações", url: "/pdv/delivery/configuracoes", icon: Settings },
      { title: "Relatórios", url: "/pdv/delivery/relatorios", icon: BarChart3 },
      { title: "Mapa de Calor", url: "/pdv/delivery/mapa-calor", icon: MapPin },
      { title: "Fidelidade", url: "/pdv/delivery/fidelidade", icon: Star },
    ],
  },
  {
    title: "Administrador",
    icon: LayoutDashboard,
    items: [
      { title: "Dashboard", url: "/pdv/dashboard", icon: LayoutDashboard },
      { title: "Produtos", url: "/pdv/produtos", icon: Package },
      { title: "Centros de Produção", url: "/pdv/centros-producao", icon: Factory },
      { title: "Estoque", url: "/pdv/estoque", icon: Warehouse },
      { title: "Fornecedores", url: "/pdv/fornecedores", icon: Truck },
      { title: "Cotações", url: "/pdv/compras/cotacoes", icon: FileText },
      { title: "Pedidos de Compra", url: "/pdv/compras/pedidos", icon: ShoppingBag },
      { title: "Lista de Compras", url: "/pdv/compras/lista", icon: PackageSearch },
      { title: "Notas Fiscais", url: "/pdv/notas-fiscais", icon: Receipt },
      { title: "Cupons Fiscais", url: "/pdv/cupons-fiscais", icon: Receipt },
      { title: "Relatórios", url: "/pdv/relatorios", icon: BarChart3 },
      { title: "Configurações", url: "/pdv/configuracoes", icon: Settings },
      { title: "Clientes", url: "/pdv/clientes", icon: UserCheck },
      { title: "Usuários", url: "/pdv/usuarios", icon: Users },
      { title: "Venda a Prazo", url: "/pdv/venda-a-prazo", icon: UserCheck },
      { title: "Franquia", url: "/pdv/franquia", icon: GitBranch },
      { title: "Integrações", url: "/pdv/integracoes", icon: Plug },
    ],
  },
  {
    title: "Avaliações",
    icon: Star,
    items: [
      { title: "Avaliações", url: "/pdv/avaliacoes", icon: Star },
    ],
  },
  {
    title: "Tarefas",
    icon: ClipboardCheck,
    items: [
      { title: "Tarefas", url: "/pdv/tarefas", icon: ClipboardCheck },
    ],
  },
  {
    title: "Financeiro",
    icon: DollarSign,
    items: [
      { title: "Lançamentos", url: "/pdv/financeiro/lancamentos", icon: FileText },
      { title: "Contas a Pagar", url: "/pdv/financeiro/contas-pagar", icon: TrendingDown },
      { title: "Contas a Receber", url: "/pdv/financeiro/contas-receber", icon: TrendingUp },
      { title: "Fluxo de Caixa", url: "/pdv/financeiro/fluxo-caixa", icon: ArrowLeftRight },
      { title: "Plano de Contas", url: "/pdv/financeiro/plano-contas", icon: FolderTree },
      { title: "Centros de Custo", url: "/pdv/financeiro/centros-custo", icon: Target },
      { title: "DRE", url: "/pdv/financeiro/dre", icon: FileBarChart },
      { title: "CMV Produtos", url: "/pdv/financeiro/cmv-produtos", icon: PackageSearch },
      { title: "Análise de Produtos", url: "/pdv/relatorios?tab=sales-by-product", icon: BarChart3 },
      { title: "CMV Geral", url: "/pdv/financeiro/cmv-geral", icon: PieChart },
      { title: "Demo. Caixa", url: "/pdv/financeiro/demonstrativo-caixa", icon: Receipt },
    ],
  },
  {
    title: "Integrações",
    icon: Plug,
    items: [
      { title: "Gerenciar Integrações", url: "/pdv/integracoes", icon: Plug },
    ],
  },
];

export function PDVHeaderNav() {
  const location = useLocation();
  const pathname = location.pathname;
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);
  const { canAccess } = useUserRole();
  const { hasModule, tenantId } = useUserModules();

  const itemAllowed = (url: string) => {
    if (!canAccess(url)) return false;
    if (isAlwaysAllowed(url)) return true;
    const mod = moduleForRoute(url);
    // Allowlist estrita: rotas sem módulo mapeado ficam ocultas
    if (!mod) return false;
    return hasModule(mod);
  };

  const filteredSections = useMemo(() => {
    return sectionItems
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => itemAllowed(item.url)),
      }))
      .filter((section) => section.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, hasModule, tenantId]);

  const visibleAnnouncements = announcements.filter(
    (a) => !dismissedAnnouncements.includes(a.id)
  );

  const renderNavLinks = (items: NavItem[]) => (
    <ul className="grid gap-1 p-2 md:grid-cols-2">
      {items.map((item) => {
        const ItemIcon = item.icon;
        const isActive = pathname === item.url;

        return (
          <li key={item.url}>
            <NavigationMenuLink asChild>
              <NavLink
                to={item.url}
                className={cn(
                  "flex items-center gap-3 select-none rounded-md p-3",
                  "text-sm leading-none no-underline outline-none transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus:bg-accent focus:text-accent-foreground",
                  isActive && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <ItemIcon className="h-4 w-4 shrink-0" />
                <span>{item.title}</span>
              </NavLink>
            </NavigationMenuLink>
          </li>
        );
      })}
    </ul>
  );

  return (
    <NavigationMenu>
      <NavigationMenuList>
        {filteredSections.map((section, index) => {
          const isSectionActive = section.items.some(
            (item) => pathname === item.url || pathname.startsWith(item.url + "/")
          );
          const SectionIcon = section.icon;
          const isAdminSection = section.title === "Administrador";
          const isRightAligned = index >= filteredSections.length - 2;

          // Se a seção tem só 1 item após filtro de módulos, renderiza como link direto
          if (section.items.length === 1) {
            const only = section.items[0];
            const OnlyIcon = only.icon;
            const isActive = pathname === only.url || pathname.startsWith(only.url + "/");
            return (
              <NavigationMenuItem key={section.title} className="relative">
                <NavigationMenuLink asChild>
                  <NavLink
                    to={only.url}
                    className={cn(
                      "inline-flex h-10 w-max items-center justify-center gap-2 rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors",
                      "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                      isActive && "bg-accent text-accent-foreground"
                    )}
                  >
                    <OnlyIcon className="h-4 w-4" />
                    <span className="hidden xl:inline">{only.title}</span>
                  </NavLink>
                </NavigationMenuLink>
              </NavigationMenuItem>
            );
          }

          return (
            <NavigationMenuItem key={section.title} className="relative">
              <NavigationMenuTrigger
                className={cn(
                  "gap-2",
                  isSectionActive && "bg-accent text-accent-foreground"
                )}
              >
                <SectionIcon className="h-4 w-4" />
                <span className="hidden xl:inline">{section.title}</span>
              </NavigationMenuTrigger>
              <NavigationMenuContent
                className={cn(
                  "!absolute !top-full mt-1.5 rounded-md border bg-popover text-popover-foreground shadow-lg",
                  "data-[motion^=from-]:!animate-none data-[motion^=to-]:!animate-none",
                  isRightAligned ? "right-0 left-auto" : "left-0"
                )}
              >
                {isAdminSection && visibleAnnouncements.length > 0 ? (
                  <div className="flex w-[280px] md:w-[550px]">
                    <div className="w-[180px] border-r border-border p-3 bg-primary/5">
                      <div className="flex items-center gap-2 mb-3">
                        <Megaphone className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">Comunicados</span>
                      </div>
                      <div className="space-y-2">
                        {visibleAnnouncements.map((announcement) => (
                          <div
                            key={announcement.id}
                            className="rounded-md bg-background p-2 text-xs"
                          >
                            <p className="font-medium text-foreground">{announcement.title}</p>
                            <p className="text-muted-foreground mt-1">
                              {announcement.message}
                            </p>
                            <span className="text-muted-foreground/70 text-[10px]">
                              {announcement.date}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1">
                      {renderNavLinks(section.items)}
                    </div>
                  </div>
                ) : (
                  <div className="w-[280px] md:w-[400px]">
                    {renderNavLinks(section.items)}
                  </div>
                )}
              </NavigationMenuContent>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
