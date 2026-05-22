import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BarChart3, CalendarRange, Layers, Users, Ban, BadgePercent, ShoppingCart, Package, Menu } from "lucide-react";
import OverviewReport from "./reports/OverviewReport";
import MonthlyReport from "./reports/MonthlyReport";
import ByCategoryReport from "./reports/ByCategoryReport";
import ByUserReport from "./reports/ByUserReport";
import CancellationsReport from "./reports/CancellationsReport";
import DiscountsReport from "./reports/DiscountsReport";
import PurchasesReport from "./reports/PurchasesReport";
import ProductsAnalyticsReport from "./reports/ProductsAnalyticsReport";

type ReportKey =
  | "overview" | "monthly" | "category" | "user"
  | "cancellations" | "discounts" | "purchases" | "sales-by-product";

const NAV: Array<{ key: ReportKey; label: string; icon: any; group: string }> = [
  { key: "overview", label: "Visão Geral", icon: BarChart3, group: "Resumo" },
  { key: "monthly", label: "Mensal / YoY", icon: CalendarRange, group: "Resumo" },
  { key: "sales-by-product", label: "Produtos", icon: Package, group: "Produtos" },
  { key: "category", label: "Categorias", icon: Layers, group: "Produtos" },
  { key: "user", label: "Por Usuário", icon: Users, group: "Operações" },
  { key: "cancellations", label: "Cancelamentos", icon: Ban, group: "Operações" },
  { key: "discounts", label: "Descontos e Cupons", icon: BadgePercent, group: "Operações" },
  { key: "purchases", label: "Compras", icon: ShoppingCart, group: "Estoque" },
];

function renderReport(key: ReportKey) {
  switch (key) {
    case "overview": return <OverviewReport />;
    case "monthly": return <MonthlyReport />;
    case "sales-by-product": return <ProductsAnalyticsReport />;
    case "category": return <ByCategoryReport />;
    case "user": return <ByUserReport />;
    case "cancellations": return <CancellationsReport />;
    case "discounts": return <DiscountsReport />;
    case "purchases": return <PurchasesReport />;
  }
}


export default function PDVReports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const validKeys: ReportKey[] = ["overview", "monthly", "category", "user", "cancellations", "discounts", "purchases", "sales-by-product"];
  const initial = (searchParams.get("tab") as ReportKey);
  const [active, setActive] = useState<ReportKey>(validKeys.includes(initial) ? initial : "overview");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const t = searchParams.get("tab") as ReportKey;
    if (validKeys.includes(t) && t !== active) setActive(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectTab = (key: ReportKey) => {
    setActive(key);
    setMobileOpen(false);
    setSearchParams({ tab: key }, { replace: true });
  };


  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className={cn(
        "w-60 shrink-0 border-r bg-card flex-col gap-1 p-3",
        mobileOpen ? "flex absolute inset-y-0 left-0 z-40 md:relative" : "hidden md:flex",
      )}>
        <div className="px-2 py-2 mb-2">
          <h2 className="text-sm font-semibold">Relatórios</h2>
          <p className="text-xs text-muted-foreground">Análises e exportação</p>
        </div>
        {groups.map((g) => (
          <div key={g} className="mb-2">
            <p className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{g}</p>
            <div className="flex flex-col gap-0.5">
              {NAV.filter((n) => n.group === g).map((n) => {
                const Icon = n.icon;
                const isActive = active === n.key;
                return (
                  <button
                    key={n.key}
                    onClick={() => { setActive(n.key); setMobileOpen(false); }}
                    className={cn(
                      "flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left transition-colors",
                      isActive ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{n.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden border-b p-2">
          <Button variant="outline" size="sm" onClick={() => setMobileOpen((v) => !v)}>
            <Menu className="h-4 w-4 mr-2" /> Relatórios
          </Button>
        </div>
        <div className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {renderReport(active)}
        </div>
      </div>
    </div>
  );
}
