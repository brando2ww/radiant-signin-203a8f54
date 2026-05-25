"use client";

import React, { useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search as SearchIcon,
  Dashboard,
  Folder,
  UserMultiple,
  Settings as SettingsIcon,
  User as UserIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  AddLarge,
  View,
  OverflowMenuVertical,
} from "@carbon/icons-react";
import velaraLogo from "@/assets/logo_velara_preto.png";
import velaraSymbol from "@/assets/velara-symbol.png";

const softSpringEasing = "cubic-bezier(0.25, 1.1, 0.4, 1)";

/* ----------------------------- Brand / Logos ----------------------------- */

function InterfacesLogoSquare({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-md bg-neutral-900"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.6} height={size * 0.45} viewBox="0 0 33 22" fill="none">
        <rect x="0" y="0" width="33" height="5.5" rx="0.5" fill="#ffffff" />
        <rect x="6" y="8.25" width="21" height="5.5" rx="0.5" fill="#ffffff" />
        <rect x="0" y="16.5" width="33" height="5.5" rx="0.5" fill="#ffffff" />
      </svg>
    </div>
  );
}

function BrandBadge() {
  return (
    <div className="flex items-center px-4 pt-4">
      <img src={velaraLogo} alt="Velara" className="h-18 w-auto object-contain" />
    </div>
  );
}

/* --------------------------------- Avatar -------------------------------- */

function AvatarCircle({ size = 32 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-400"
      style={{ width: size, height: size }}
    >
      <UserIcon size={size * 0.5} />
    </div>
  );
}

/* ------------------------------ Search Input ----------------------------- */

function SearchContainer({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const [searchValue, setSearchValue] = useState("");

  return (
    <div className="px-3 pb-3 pt-1">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-transparent px-3 py-2">
        <span className="text-neutral-400">
          <SearchIcon size={16} />
        </span>
        <input
          type="text"
          placeholder="Search..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="w-full bg-transparent border-none outline-none font-['Lexend:Regular',_sans-serif] text-[14px] text-neutral-900 placeholder:text-neutral-400 leading-[20px]"
          tabIndex={isCollapsed ? -1 : 0}
        />
      </div>
    </div>
  );
}

/* --------------------------- Types / Content Map -------------------------- */

interface MenuItemT {
  icon?: React.ReactNode;
  label: string;
  path?: string;
  hasDropdown?: boolean;
  isActive?: boolean;
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

const itemIconSize = 16;

function getSidebarContent(activeSection: string, pathname: string): SidebarContent {
  const isActive = (path: string) =>
    path === "/admin" ? pathname === "/admin" : pathname.startsWith(path);

  const contentMap: Record<string, SidebarContent> = {
    dashboard: {
      title: "Dashboard",
      sections: [
        {
          title: "Visão geral",
          items: [
            {
              icon: <View size={itemIconSize} />,
              label: "Resumo",
              path: "/admin",
              isActive: isActive("/admin") && pathname === "/admin",
            },
          ],
        },
      ],
    },
    tenants: {
      title: "Tenants",
      sections: [
        {
          title: "Gestão",
          items: [
            {
              icon: <UserMultiple size={itemIconSize} />,
              label: "Todos os tenants",
              path: "/admin/tenants",
              isActive: pathname === "/admin/tenants",
            },
            {
              icon: <AddLarge size={itemIconSize} />,
              label: "Novo tenant",
              path: "/admin/tenants/novo",
              isActive: pathname === "/admin/tenants/novo",
            },
          ],
        },
      ],
    },
    planos: {
      title: "Planos",
      sections: [
        {
          title: "Gestão",
          items: [
            {
              icon: <Folder size={itemIconSize} />,
              label: "Listar planos",
              path: "/admin/planos",
              isActive: pathname.startsWith("/admin/planos"),
            },
          ],
        },
      ],
    },
    configuracoes: {
      title: "Configurações",
      sections: [
        {
          title: "Conta",
          items: [
            {
              icon: <SettingsIcon size={itemIconSize} />,
              label: "Configurações gerais",
              path: "/admin/configuracoes",
              isActive: pathname.startsWith("/admin/configuracoes"),
            },
          ],
        },
      ],
    },
  };

  return contentMap[activeSection] || contentMap.dashboard;
}

/* ---------------------------- Left Icon Nav Rail -------------------------- */

function IconNavButton({
  children,
  isActive = false,
  onClick,
  title,
}: {
  children: ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={
        "flex h-10 w-10 items-center justify-center rounded-md text-neutral-9000 transition-colors " +
        (isActive
          ? "bg-neutral-200 text-neutral-900"
          : "hover:bg-neutral-100 hover:text-neutral-200")
      }
      style={{
        transitionTimingFunction: softSpringEasing,
        transitionDuration: "200ms",
      }}
    >
      {children}
    </button>
  );
}

const railItems = [
  { id: "dashboard", icon: <Dashboard size={18} />, label: "Dashboard", path: "/admin" },
  { id: "tenants", icon: <UserMultiple size={18} />, label: "Tenants", path: "/admin/tenants" },
  { id: "planos", icon: <Folder size={18} />, label: "Planos", path: "/admin/planos" },
  {
    id: "configuracoes",
    icon: <SettingsIcon size={18} />,
    label: "Configurações",
    path: "/admin/configuracoes",
  },
];

function getActiveSectionFromPath(pathname: string): string {
  if (pathname.startsWith("/admin/tenants")) return "tenants";
  if (pathname.startsWith("/admin/planos")) return "planos";
  if (pathname.startsWith("/admin/configuracoes")) return "configuracoes";
  return "dashboard";
}

function IconNavigation({
  activeSection,
  onNavigate,
}: {
  activeSection: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center gap-1 py-4">
      <div className="mb-2 flex h-10 w-10 items-center justify-center">
        <img src={velaraSymbol} alt="Velara" className="h-7 w-7 object-contain" />
      </div>

      <div className="flex flex-col items-center gap-1">
        {railItems.map((item) => (
          <IconNavButton
            key={item.id}
            title={item.label}
            isActive={activeSection === item.id}
            onClick={() => onNavigate(item.path)}
          >
            {item.icon}
          </IconNavButton>
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-2 pb-1">
        <AvatarCircle size={32} />
      </div>
    </div>
  );
}

/* ------------------------------ Right Sidebar ----------------------------- */

function SectionTitle({
  title,
  onToggleCollapse,
  isCollapsed,
}: {
  title: string;
  onToggleCollapse: () => void;
  isCollapsed: boolean;
}) {
  if (isCollapsed) {
    return (
      <div className="flex justify-center px-2 py-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand panel"
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2">
      <h2 className="font-['Lexend:Medium',_sans-serif] text-[22px] font-medium text-neutral-900 leading-tight">
        {title}
      </h2>
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label="Collapse panel"
        className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <ChevronRightIcon size={16} />
      </button>
    </div>
  );
}

/* ------------------------------ Menu Elements ---------------------------- */

function MenuItem({
  item,
  isExpanded,
  onToggle,
  onItemClick,
  isCollapsed,
}: {
  item: MenuItemT;
  isExpanded?: boolean;
  onToggle?: () => void;
  onItemClick?: () => void;
  isCollapsed?: boolean;
}) {
  const handleClick = () => {
    if (item.hasDropdown && onToggle) onToggle();
    else onItemClick?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      tabIndex={isCollapsed ? -1 : 0}
      className={
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors " +
        (item.isActive
          ? "bg-neutral-200 text-neutral-900"
          : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900")
      }
      style={{
        transitionTimingFunction: softSpringEasing,
        transitionDuration: "180ms",
      }}
    >
      <span className="flex h-4 w-4 items-center justify-center text-neutral-700">
        {item.icon}
      </span>
      <span className="flex-1 font-['Lexend:Regular',_sans-serif] text-[14px] leading-[20px] truncate">
        {item.label}
      </span>
      {item.hasDropdown && (
        <span
          className="text-neutral-400 transition-transform"
          style={{
            transitionTimingFunction: softSpringEasing,
            transitionDuration: "200ms",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <ChevronDownIcon size={14} />
        </span>
      )}
    </button>
  );
}

function SubMenuItem({ item, onItemClick }: { item: MenuItemT; onItemClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onItemClick}
      className="flex w-full items-center gap-2 rounded-md py-1.5 pl-10 pr-3 text-left text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-200"
    >
      {item.icon && <span className="flex h-3 w-3 items-center justify-center">{item.icon}</span>}
      <span className="flex-1 font-['Lexend:Regular',_sans-serif] text-[13px] leading-[18px] truncate">
        {item.label}
      </span>
    </button>
  );
}

function MenuSection({
  section,
  expandedItems,
  onToggleExpanded,
  onNavigate,
  isCollapsed,
}: {
  section: MenuSectionT;
  expandedItems: Set<string>;
  onToggleExpanded: (itemKey: string) => void;
  onNavigate: (path: string) => void;
  isCollapsed?: boolean;
}) {
  return (
    <div className="px-2 py-2">
      <div className="px-3 pb-1.5 pt-2 font-['Lexend:Regular',_sans-serif] text-[12px] text-neutral-9000 leading-[16px]">
        {section.title}
      </div>

      {section.items.map((item, index) => {
        const itemKey = `${section.title}-${index}`;
        const isExpanded = expandedItems.has(itemKey);
        return (
          <div key={itemKey} className="flex flex-col">
            <MenuItem
              item={item}
              isExpanded={isExpanded}
              onToggle={() => onToggleExpanded(itemKey)}
              onItemClick={() => item.path && onNavigate(item.path)}
              isCollapsed={isCollapsed}
            />
            {isExpanded && item.children && !isCollapsed && (
              <div className="mt-0.5 flex flex-col">
                {item.children.map((child, childIndex) => (
                  <SubMenuItem
                    key={childIndex}
                    item={child}
                    onItemClick={() => child.path && onNavigate(child.path)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CollapsedRail({
  content,
  onExpand,
}: {
  content: SidebarContent;
  onExpand: () => void;
}) {
  const allItems = content.sections.flatMap((s) => s.items);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand panel"
        className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <ChevronRightIcon size={16} />
      </button>

      <button
        type="button"
        onClick={onExpand}
        aria-label="Search"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 hover:text-neutral-200"
      >
        <SearchIcon size={16} />
      </button>

      <div className="mt-1 flex flex-col items-center gap-2">
        {allItems.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={onExpand}
            aria-label={item.label}
            title={item.label}
            className={
              "flex h-9 w-9 items-center justify-center rounded-lg transition-colors " +
              (item.isActive
                ? "bg-neutral-200 text-neutral-900"
                : "text-neutral-9000 hover:bg-neutral-100 hover:text-neutral-200")
            }
          >
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailSidebar({
  activeSection,
  onNavigate,
}: {
  activeSection: string;
  onNavigate: (path: string) => void;
}) {
  const { pathname } = useLocation();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const content = getSidebarContent(activeSection, pathname);

  const toggleExpanded = (itemKey: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  };

  const toggleCollapse = () => setIsCollapsed((s) => !s);

  return (
    <div
      className="flex h-full shrink-0 flex-col overflow-hidden border-l border-neutral-200"
      style={{
        width: isCollapsed ? 60 : 300,
        transitionProperty: "width",
        transitionDuration: "280ms",
        transitionTimingFunction: softSpringEasing,
      }}
    >
      {isCollapsed ? (
        <CollapsedRail content={content} onExpand={() => setIsCollapsed(false)} />
      ) : (
        <>
          <BrandBadge />
          <SectionTitle
            title={content.title}
            isCollapsed={false}
            onToggleCollapse={toggleCollapse}
          />
          <SearchContainer isCollapsed={false} />
          <div className="flex-1 overflow-y-auto">
            {content.sections.map((section, index) => (
              <MenuSection
                key={`${activeSection}-${index}`}
                section={section}
                expandedItems={expandedItems}
                onToggleExpanded={toggleExpanded}
                onNavigate={onNavigate}
                isCollapsed={false}
              />
            ))}
          </div>
          <div className="border-t border-neutral-200 p-3">
            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
              <AvatarCircle size={36} />
              <span className="flex-1 font-['Lexend:Regular',_sans-serif] text-[14px] text-neutral-900 leading-[20px]">
                Text content
              </span>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-200"
                aria-label="More"
              >
                <OverflowMenuVertical size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------- Layout -------------------------------- */

function TwoLevelSidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeSection = getActiveSectionFromPath(pathname);

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <IconNavigation activeSection={activeSection} onNavigate={(p) => navigate(p)} />
      <DetailSidebar activeSection={activeSection} onNavigate={(p) => navigate(p)} />
    </div>
  );
}

/* ------------------------------- Root Frame ------------------------------ */

export function Frame760() {
  return (
    <div className="flex h-screen items-stretch bg-neutral-100 p-3">
      <TwoLevelSidebar />
    </div>
  );
}

export const AdminSidebar = Frame760;
export default Frame760;
