import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface SidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  type: "switch" | "anchor";
}

interface CategoryLayoutProps {
  title: string;
  description: string;
  categoryPath: string;
  badge?: string;
  sidebar?: SidebarItem[];
  children: React.ReactNode;
}

export function CategoryLayout({ title, description, categoryPath, badge, sidebar, children }: CategoryLayoutProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);

  const currentSection = searchParams.get("section");
  const hasSidebar = sidebar && sidebar.length > 0;

  const handleSidebarClick = (item: SidebarItem) => {
    if (item.type === "switch") {
      setSearchParams({ section: item.id });
    } else {
      setActiveAnchor(item.id);
      setTimeout(() => {
        document.getElementById(`section-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  const isActive = (item: SidebarItem) => {
    if (!hasSidebar) return false;
    if (item.type === "switch") {
      const activeId = currentSection || sidebar[0]?.id;
      return item.id === activeId;
    }
    const activeId = activeAnchor || sidebar[0]?.id;
    return item.id === activeId;
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-background px-4 md:px-6 py-4 shrink-0">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
          <button
            onClick={() => navigate("/pdv/configuracoes-gerais")}
            className="hover:text-foreground transition-colors"
          >
            Configurações
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">{categoryPath}</span>
        </nav>

        <div className="flex items-start gap-3">
          {/* Back button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/pdv/configuracoes-gerais")}
            className="h-8 shrink-0 gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Central de configurações</span>
            <span className="sm:hidden">Voltar</span>
          </Button>

          {/* Title block */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold leading-tight">{title}</h1>
              {badge && (
                <Badge variant="outline" className="text-xs font-normal">
                  {badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
      </div>

      {/* Mobile pill nav */}
      {hasSidebar && (
        <div className="md:hidden flex overflow-x-auto gap-2 px-4 py-2.5 border-b shrink-0 scrollbar-none">
          {sidebar.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <button
                key={item.id}
                onClick={() => handleSidebarClick(item)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors font-medium",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        {hasSidebar && (
          <aside className="hidden md:flex flex-col w-56 shrink-0 border-r py-4 px-2 gap-0.5">
            {sidebar.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <button
                  key={item.id}
                  onClick={() => handleSidebarClick(item)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm text-left w-full transition-colors",
                    active
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="leading-tight">{item.label}</span>
                </button>
              );
            })}
          </aside>
        )}

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
