import { useState, useMemo } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Dashboard,
  UserMultiple,
  Document,
  Settings as SettingsIcon,
  ChevronDown,
  Search as SearchIcon,
  Logout,
  AddLarge,
  Notification,
  Security,
  User as UserIcon,
  ChartBar,
  Group,
} from "@carbon/icons-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import velaraSymbol from "@/assets/velara-symbol.png";

type IconCmp = React.ComponentType<{ size?: number | string }>;

type SubItem = {
  label: string;
  to?: string;
  icon?: IconCmp;
};

type Section = {
  id: string;
  title: string;
  icon: IconCmp;
  defaultRoute: string;
  matchPaths: string[];
  groups: { title: string; items: SubItem[] }[];
};

const sections: Section[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    icon: Dashboard,
    defaultRoute: "/admin",
    matchPaths: ["/admin"],
    groups: [
      {
        title: "Visão geral",
        items: [
          { label: "Painel principal", to: "/admin", icon: Dashboard },
          { label: "Métricas rápidas", icon: ChartBar },
        ],
      },
    ],
  },
  {
    id: "tenants",
    title: "Tenants",
    icon: UserMultiple,
    defaultRoute: "/admin/tenants",
    matchPaths: ["/admin/tenants"],
    groups: [
      {
        title: "Gerenciar",
        items: [
          { label: "Todos os tenants", to: "/admin/tenants", icon: Group },
          { label: "Novo tenant", to: "/admin/tenants/novo", icon: AddLarge },
        ],
      },
    ],
  },
  {
    id: "planos",
    title: "Planos",
    icon: Document,
    defaultRoute: "/admin/planos",
    matchPaths: ["/admin/planos"],
    groups: [
      {
        title: "Catálogo",
        items: [{ label: "Gerenciar planos", to: "/admin/planos", icon: Document }],
      },
    ],
  },
  {
    id: "configuracoes",
    title: "Configurações",
    icon: SettingsIcon,
    defaultRoute: "/admin/configuracoes",
    matchPaths: ["/admin/configuracoes"],
    groups: [
      {
        title: "Conta",
        items: [
          { label: "Perfil", icon: UserIcon },
          { label: "Segurança", icon: Security },
          { label: "Notificações", icon: Notification },
        ],
      },
    ],
  },
];

export function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(sections.flatMap((s) => s.groups.map((g) => `${s.id}-${g.title}`)))
  );

  const activeSection = useMemo(() => {
    const pathname = location.pathname;
    // most specific match wins
    const sorted = [...sections].sort(
      (a, b) =>
        Math.max(...b.matchPaths.map((p) => p.length)) -
        Math.max(...a.matchPaths.map((p) => p.length))
    );
    return (
      sorted.find((s) => s.matchPaths.some((p) => pathname.startsWith(p))) ??
      sections[0]
    );
  }, [location.pathname]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const initials = (user?.email ?? "A").slice(0, 2).toUpperCase();

  return (
    <aside className="flex h-screen border-r border-border bg-card">
      {/* Rail */}
      <div className="flex w-[60px] flex-col items-center justify-between border-r border-border py-3">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="mb-2 flex h-10 w-10 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Alternar painel"
          >
            <img
              src={velaraSymbol}
              alt="Velara"
              className="h-7 w-7 object-contain dark:invert"
            />
          </button>

          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = activeSection.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  navigate(s.defaultRoute);
                  if (collapsed) setCollapsed(false);
                }}
                title={s.title}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-md transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon size={20} />
              </button>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
            title={user?.email ?? ""}
          >
            {initials}
          </div>
          <button
            onClick={handleLogout}
            title="Sair"
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Logout size={20} />
          </button>
        </div>
      </div>

      {/* Detail panel */}
      <div
        className={cn(
          "overflow-hidden transition-[width] duration-200 ease-out",
          collapsed ? "w-0" : "w-[260px]"
        )}
      >
        <div className="flex h-full w-[260px] flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              {activeSection.title}
            </h2>
            <button
              onClick={() => setCollapsed(true)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Colapsar painel"
            >
              <ChevronDown size={16} className="rotate-90" />
            </button>
          </div>

          {/* Search (decorative) */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
              <SearchIcon size={14} className="text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar..."
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Sections */}
          <nav className="flex-1 overflow-y-auto px-2 pb-4">
            {activeSection.groups.map((group) => {
              const key = `${activeSection.id}-${group.title}`;
              const isOpen = expandedGroups.has(key);
              return (
                <div key={key} className="mb-2">
                  <button
                    onClick={() => toggleGroup(key)}
                    className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    <span>{group.title}</span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        "transition-transform duration-200",
                        isOpen ? "" : "-rotate-90"
                      )}
                    />
                  </button>

                  {isOpen && (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        const content = (
                          <>
                            {ItemIcon && (
                              <ItemIcon size={16} />
                            )}
                            <span className="flex-1 truncate text-left">
                              {item.label}
                            </span>
                          </>
                        );

                        if (item.to) {
                          return (
                            <NavLink
                              key={item.label}
                              to={item.to}
                              end={item.to === "/admin"}
                              className={({ isActive }) =>
                                cn(
                                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                                  isActive
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                )
                              }
                            >
                              {content}
                            </NavLink>
                          );
                        }

                        return (
                          <button
                            key={item.label}
                            type="button"
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          >
                            {content}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
}
