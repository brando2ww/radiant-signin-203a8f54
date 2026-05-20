import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutGrid, ClipboardList, Plus, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  end?: boolean;
};

const leftTabs: Tab[] = [
  { to: "/garcom", icon: LayoutGrid, label: "Mesas", end: true },
  { to: "/garcom/comandas", icon: ClipboardList, label: "Comandas" },
];

const rightTabs: Tab[] = [
  { to: "/garcom/itens", icon: UtensilsCrossed, label: "Itens" },
];

const navTabs: Tab[] = [...leftTabs, ...rightTabs];

export function BottomTabBar({ onNewComanda }: { onNewComanda?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  const activeIndex = navTabs.findIndex((tab) =>
    tab.end ? location.pathname === tab.to : location.pathname.startsWith(tab.to)
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0 });

  useEffect(() => {
    const updateIndicator = () => {
      const idx = activeIndex;
      if (idx < 0) {
        setIndicatorStyle({ width: 0, left: 0 });
        return;
      }
      const btn = btnRefs.current[idx];
      const container = containerRef.current;
      if (!btn || !container) return;
      const btnRect = btn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setIndicatorStyle({
        width: btnRect.width,
        left: btnRect.left - containerRect.left,
      });
    };

    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [activeIndex]);

  const renderTab = (tab: Tab, index: number) => {
    const isActive = index === activeIndex;
    return (
      <button
        key={tab.to}
        ref={(el) => (btnRefs.current[index] = el)}
        onClick={() => navigate(tab.to)}
        className={cn(
          "relative z-10 flex flex-col items-center justify-center flex-1 px-3 py-2 text-xs font-medium transition-colors",
          isActive
            ? "text-primary"
            : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        )}
      >
        <tab.icon className="h-5 w-5" />
        <span className="hidden sm:inline mt-0.5">{tab.label}</span>
      </button>
    );
  };

  return (
    <nav
      className="fixed left-2 right-[4.5rem] z-50 flex justify-start pointer-events-none"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div
        ref={containerRef}
        className="pointer-events-auto relative flex w-full items-center gap-2 rounded-full border border-white/40 dark:border-white/10 bg-white/80 dark:bg-gray-900/80 px-3 py-2 shadow-2xl backdrop-blur-md"
      >
        {/* Sliding active indicator */}
        <motion.div
          className="absolute top-2 bottom-2 rounded-full bg-gray-100 dark:bg-gray-800 shadow-inner"
          animate={{ width: indicatorStyle.width, x: indicatorStyle.left }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          style={{ left: 0 }}
        />

        {leftTabs.map((tab, i) => renderTab(tab, i))}

        {/* Central FAB */}
        <button
          type="button"
          onClick={onNewComanda}
          aria-label="Novo pedido"
          className="relative z-10 mx-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
        >
          <Plus className="h-6 w-6" />
        </button>

        {rightTabs.map((tab, i) => renderTab(tab, leftTabs.length + i))}
      </div>
    </nav>
  );
}
