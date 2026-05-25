import { useState, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Dashboard,
  UserMultiple,
  Document,
  TaskView,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search as SearchIcon,
  Logout,
  AddLarge,
  Filter,
  Notification,
  Security,
  User as UserIcon,
  ChartBar,
  Time,
  CheckmarkOutline,
  View,
  Flag,
} from "@carbon/icons-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import velaraSymbol from "@/assets/velara-symbol.png";

const EASING = "cubic-bezier(0.25, 1.1, 0.4, 1)";

type IconCmp = React.ComponentType<{ size?: number | string }>;

interface MenuItemT {
  icon?: IconCmp;
  label: string;
  to?: string;
  hasDropdown?: boolean;
  children?: MenuItemT[];
}

interface MenuSectionT {
  title: string;
  items: MenuItemT[];
}

interface SidebarContent {
  title: string;
  sections: MenuSectionT[];
}

interface RailItem {
  id: string;
  icon: IconCmp;
  label: string;
  defaultRoute: string;
  matchPaths: string[];
}

const railItems: RailItem[] = [
  { id: "dashboard", icon: Dashboard, label: "Dashboard", defaultRoute: "/admin", matchPaths: ["/admin"] },
  { id: "tenants", icon: UserMultiple, label: "Tenants", defaultRoute: "/admin/tenants", matchPaths: ["/admin/tenants"] },
  { id: "planos", icon: Document, label: "Planos", defaultRoute: "/admin/planos", matchPaths: ["/admin/planos"] },
  { id: "checklists", icon: TaskView, label: "Checklists", defaultRoute: "/admin/checklists", matchPaths: ["/admin/checklists"] },
];

function getSidebarContent(activeSection: string): SidebarContent {
  const map: Record<string, SidebarContent> = {
    dashboard: {
      title: "Dashboard",
      sections: [
        {
          title: "Visão geral",
          items: [
            { icon: View, label: "Painel principal", to: "/admin" },
            {
              icon: ChartBar,
              label: "Métricas rápidas",
              hasDropdown: true,
              children: [
                { label: "Tenants ativos" },
                { label: "Receita do mês" },
                { label: "Novos cadastros" },
              ],
            },
            {
              icon: Time,
              label: "Atividade recente",
              hasDropdown: true,
              children: [
                { label: "Últimos logins" },
                { label: "Tenants criados" },
                { label: "Planos atualizados" },
              ],
            },
          ],
        },
      ],
    },
    tenants: {
      title: "Tenants",
      sections: [
        {
          title: "Ações rápidas",
          items: [
            { icon: AddLarge, label: "Novo tenant", to: "/admin/tenants/novo" },
            {
              icon: Filter,
              label: "Filtrar",
              hasDropdown: true,
              children: [
                { label: "Ativos" },
                { label: "Inativos" },
                { label: "Pendentes" },
              ],
            },
          ],
        },
        {
          title: "Gerenciar",
          items: [
            { icon: UserMultiple, label: "Todos os tenants", to: "/admin/tenants" },
          ],
        },
      ],
    },
    planos: {
      title: "Planos",
      sections: [
        {
          title: "Catálogo",
          items: [
            { icon: Document, label: "Gerenciar planos", to: "/admin/planos" },
            { icon: AddLarge, label: "Novo plano", to: "/admin/planos" },
          ],
        },
      ],
    },
    checklists: {
      title: "Checklists",
      sections: [
        {
          title: "Modelos",
          items: [
            {
              icon: TaskView,
              label: "Todos os checklists",
              hasDropdown: true,
              children: [
                { icon: CheckmarkOutline, label: "Abertura de loja" },
                { icon: CheckmarkOutline, label: "Fechamento de caixa" },
                { icon: CheckmarkOutline, label: "Limpeza diária" },
              ],
            },
            { icon: AddLarge, label: "Novo checklist" },
          ],
        },
        {
          title: "Acompanhamento",
          items: [
            {
              icon: Flag,
              label: "Pendentes hoje",
              hasDropdown: true,
              children: [
                { label: "Manhã" },
                { label: "Tarde" },
                { label: "Noite" },
              ],
            },
          ],
        },
      ],
    },
    settings: {
      title: "Configurações",
      sections: [
        {
          title: "Conta",
          items: [
            { icon: UserIcon, label: "Perfil", to: "/admin/configuracoes" },
            { icon: Security, label: "Segurança", to: "/admin/configuracoes" },
            { icon: Notification, label: "Notificações", to: "/admin/configuracoes" },
          ],
        },
        {
          title: "Preferências",
          items: [
            {
              icon: SettingsIcon,
              label: "Preferências",
              hasDropdown: true,
              children: [
                { label: "Tema" },
                { label: "Idioma" },
                { label: "Fuso horário" },
              ],
            },
          ],
        },
      ],
    },
  };

  return map[activeSection] ?? map.dashboard;
}

/* ------------------------------ Rail ------------------------------ */

function RailButton({
  isActive,
  onClick,
  title,
  children,
}: {
  isActive?: boolean;
  onClick?: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        isActive && "bg-muted text-foreground ring-1 ring-border",
      )}
      style={{ transitionTimingFunction: EASING, transitionDuration: "200ms" }}
    >
      {children}
    </button>
  );
}

function IconRail({
  activeSection,
  onSectionChange,
  onLogout,
}: {
  activeSection: string;
  onSectionChange: (id: string) => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center gap-2 border-r border-border bg-card py-3">
      <div className="flex h-10 w-10 items-center justify-center">
        <img src={velaraSymbol} alt="Velara" className="h-7 w-7 object-contain" />
      </div>

      <div className="mt-2 flex flex-col items-center gap-1">
        {railItems.map((item) => {
          const Icon = item.icon;
          return (
            <RailButton
              key={item.id}
              title={item.label}
              isActive={activeSection === item.id}
              onClick={() => onSectionChange(item.id)}
            >
              <Icon size={18} />
            </RailButton>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1">
        <div className="my-2 h-px w-6 bg-border" />
        <RailButton
          title="Configurações"
          isActive={activeSection === "settings"}
          onClick={() => onSectionChange("settings")}
        >
          <SettingsIcon size={18} />
        </RailButton>
        <RailButton title="Sair" onClick={onLogout}>
          <Logout size={18} />
        </RailButton>
      </div>
    </div>
  );
}

/* --------------------------- Detail Panel --------------------------- */

function SectionHeader({
  title,
  isCollapsed,
  onToggle,
}: {
  title: string;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  if (isCollapsed) {
    return (
      <div className="flex justify-center px-2 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expandir painel"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Recolher painel"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft size={14} />
      </button>
    </div>
  );
}

function SearchField() {
  return (
    <div className="px-3 pb-3">
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
        <SearchIcon size={14} />
        <input
          type="text"
          placeholder="Buscar..."
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
      </div>
    </div>
  );
}

function MenuItemRow({
  item,
  isExpanded,
  onToggle,
  onNavigate,
}: {
  item: MenuItemT;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: (to: string) => void;
}) {
  const Icon = item.icon;
  const handleClick = () => {
    if (item.hasDropdown) onToggle();
    else if (item.to) onNavigate(item.to);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
    >
      {Icon ? (
        <span className="text-muted-foreground">
          <Icon size={16} />
        </span>
      ) : (
        <span className="w-4" />
      )}
      <span className="flex-1 truncate">{item.label}</span>
      {item.hasDropdown && (
        <span
          className="text-muted-foreground transition-transform"
          style={{
            transitionTimingFunction: EASING,
            transitionDuration: "200ms",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <ChevronDown size={14} />
        </span>
      )}
    </button>
  );
}

function SubMenuItemRow({ item }: { item: MenuItemT }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => console.log(`Clicked ${item.label}`)}
      className="flex w-full items-center gap-2 rounded-md py-1 pl-9 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {Icon && (
        <span>
          <Icon size={12} />
        </span>
      )}
      <span className="flex-1 truncate">{item.label}</span>
    </button>
  );
}

function MenuSectionBlock({
  section,
  sectionIndex,
  expandedItems,
  onToggleExpanded,
  onNavigate,
}: {
  section: MenuSectionT;
  sectionIndex: number;
  expandedItems: Set<string>;
  onToggleExpanded: (key: string) => void;
  onNavigate: (to: string) => void;
}) {
  return (
    <div className="px-2 py-2">
      <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {section.title}
      </div>
      <div className="flex flex-col gap-0.5">
        {section.items.map((item, idx) => {
          const key = `${sectionIndex}-${idx}`;
          const isExpanded = expandedItems.has(key);
          return (
            <div key={key}>
              <MenuItemRow
                item={item}
                isExpanded={isExpanded}
                onToggle={() => onToggleExpanded(key)}
                onNavigate={onNavigate}
              />
              {isExpanded && item.children && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {item.children.map((child, ci) => (
                    <SubMenuItemRow key={ci} item={child} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailPanel({
  activeSection,
  isCollapsed,
  onToggleCollapse,
  onNavigate,
}: {
  activeSection: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate: (to: string) => void;
}) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const content = getSidebarContent(activeSection);

  const toggleExpanded = (key: string) =>
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div
      className="flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-card"
      style={{
        width: isCollapsed ? 0 : 260,
        transitionProperty: "width",
        transitionDuration: "250ms",
        transitionTimingFunction: EASING,
      }}
    >
      {!isCollapsed && (
        <>
          <SectionHeader title={content.title} isCollapsed={false} onToggle={onToggleCollapse} />
          <SearchField />
          <div className="flex-1 overflow-y-auto">
            {content.sections.map((section, i) => (
              <MenuSectionBlock
                key={`${activeSection}-${i}`}
                section={section}
                sectionIndex={i}
                expandedItems={expandedItems}
                onToggleExpanded={toggleExpanded}
                onNavigate={onNavigate}
              />
            ))}
          </div>
          <div className="border-t border-border p-3">
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs font-semibold text-foreground">Painel super-admin</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Gerencie tenants, planos e configurações da plataforma.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ Root ------------------------------ */

export function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [manualSection, setManualSection] = useState<string | null>(null);

  const routeSection = useMemo(() => {
    const path = location.pathname;
    // sort by length desc to prefer most specific match
    const sorted = [...railItems].sort((a, b) => b.defaultRoute.length - a.defaultRoute.length);
    for (const item of sorted) {
      if (item.matchPaths.some((p) => path === p || path.startsWith(p + "/"))) {
        return item.id;
      }
    }
    if (path.startsWith("/admin/configuracoes")) return "settings";
    return "dashboard";
  }, [location.pathname]);

  const activeSection = manualSection ?? routeSection;

  const handleSectionChange = (id: string) => {
    setManualSection(id);
    if (id === "settings") {
      navigate("/admin/configuracoes");
      return;
    }
    const item = railItems.find((r) => r.id === id);
    if (item) navigate(item.defaultRoute);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  // When the user navigates via routes, sync manual selection with route
  useMemo(() => setManualSection(null), [location.pathname]);

  return (
    <div className="flex h-screen">
      <IconRail
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        onLogout={handleLogout}
      />
      <DetailPanel
        activeSection={activeSection}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((s) => !s)}
        onNavigate={(to) => navigate(to)}
      />
      {isCollapsed && (
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          aria-label="Expandir painel"
          className="flex h-screen w-6 items-center justify-center border-r border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

export default AdminSidebar;
