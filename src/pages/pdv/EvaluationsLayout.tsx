import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import {
  LayoutDashboard, Megaphone, Printer, Settings,
  BarChart3, CalendarDays, CalendarRange, CalendarClock,
  Users, UserCog, Cake,
  Gift, ListChecks, ShieldCheck, Ticket, Disc3,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EvaluationsDashboard = lazy(() => import("@/pages/evaluations/EvaluationsDashboard"));
const EvaluationsCampaigns = lazy(() => import("@/pages/evaluations/EvaluationsCampaigns"));
const EvaluationsSettings = lazy(() => import("@/pages/evaluations/EvaluationsSettings"));
const EvaluationsArte = lazy(() => import("@/pages/pdv/evaluations/EvaluationsArte"));

// Relatórios
const ReportDaily = lazy(() => import("@/pages/pdv/evaluations/reports/ReportDaily"));
const ReportWeekly = lazy(() => import("@/pages/pdv/evaluations/reports/ReportWeekly"));
const ReportMonthly = lazy(() => import("@/pages/pdv/evaluations/reports/ReportMonthly"));

// Clientes
const ClientsPanel = lazy(() => import("@/pages/pdv/evaluations/clients/ClientsPanel"));
const ClientsManagement = lazy(() => import("@/pages/pdv/evaluations/clients/ClientsManagement"));
const ClientsBirthdays = lazy(() => import("@/pages/pdv/evaluations/clients/ClientsBirthdays"));

// Cupons
const CouponsPanel = lazy(() => import("@/pages/pdv/evaluations/coupons/CouponsPanel"));
const CouponsManagement = lazy(() => import("@/pages/pdv/evaluations/coupons/CouponsManagement"));
const CouponsValidation = lazy(() => import("@/pages/pdv/evaluations/coupons/CouponsValidation"));
const CouponsDraw = lazy(() => import("@/pages/pdv/evaluations/coupons/CouponsDraw"));
const CouponsRoulettes = lazy(() => import("@/pages/pdv/evaluations/coupons/CouponsRoulettes"));

const basePath = "/pdv/avaliacoes";
const fullPath = (to: string) => (to ? `${basePath}/${to}` : basePath);

type Item = { to: string; label: string; icon: React.ElementType; exact?: boolean };
type Section = { title?: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    items: [
      { to: "", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "campanhas", label: "Campanhas", icon: Megaphone },
      { to: "arte", label: "Arte para o caixa", icon: Printer },
      { to: "configuracoes", label: "Configurações", icon: Settings },
    ],
  },
  {
    title: "Relatórios",
    items: [
      { to: "relatorios/diario", label: "Diário", icon: CalendarDays },
      { to: "relatorios/semanal", label: "Semanal", icon: CalendarRange },
      { to: "relatorios/mensal", label: "Mensal", icon: CalendarClock },
    ],
  },
  {
    title: "Clientes",
    items: [
      { to: "clientes/painel", label: "Painel", icon: BarChart3 },
      { to: "clientes/gestao", label: "Gestão", icon: UserCog },
      { to: "clientes/aniversariantes", label: "Aniversariantes", icon: Cake },
    ],
  },
  {
    title: "Cupons",
    items: [
      { to: "cupons/painel", label: "Painel", icon: Gift },
      { to: "cupons/gestao", label: "Gestão", icon: ListChecks },
      { to: "cupons/validacao", label: "Validação", icon: ShieldCheck },
      { to: "cupons/sorteio", label: "Sorteio", icon: Ticket },
      { to: "cupons/roletas", label: "Roletas", icon: Disc3 },
    ],
  },
];

const FLAT_ITEMS = SECTIONS.flatMap((s) => s.items);

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function useIsActive() {
  const { pathname } = useLocation();
  return (item: Item) => {
    const fp = fullPath(item.to);
    if (item.exact) return pathname === fp || pathname === `${fp}/`;
    return pathname === fp || pathname.startsWith(`${fp}/`);
  };
}

export default function EvaluationsLayout() {
  const navigate = useNavigate();
  const isActive = useIsActive();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-52 shrink-0 border-r border-border bg-card p-3 gap-3 overflow-y-auto">
        {SECTIONS.map((section, idx) => (
          <div key={idx} className="flex flex-col gap-1">
            {section.title && (
              <div className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </div>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <button
                  key={item.to || "index"}
                  onClick={() => navigate(fullPath(item.to))}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-colors text-left",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-card-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {/* Mobile nav */}
        <nav className="flex md:hidden gap-2 overflow-x-auto p-3 scrollbar-hide border-b border-border bg-card">
          {FLAT_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <button
                key={item.to || "index"}
                onClick={() => navigate(fullPath(item.to))}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors shrink-0",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-card-foreground border-border hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route index element={<EvaluationsDashboard />} />
            <Route path="campanhas" element={<EvaluationsCampaigns />} />

            {/* Relatórios */}
            <Route path="relatorios" element={<Navigate to="diario" replace />} />
            <Route path="relatorios/diario" element={<ReportDaily />} />
            <Route path="relatorios/semanal" element={<ReportWeekly />} />
            <Route path="relatorios/mensal" element={<ReportMonthly />} />

            {/* Clientes */}
            <Route path="clientes" element={<Navigate to="painel" replace />} />
            <Route path="clientes/painel" element={<ClientsPanel />} />
            <Route path="clientes/gestao" element={<ClientsManagement />} />
            <Route path="clientes/aniversariantes" element={<ClientsBirthdays />} />

            {/* Cupons */}
            <Route path="cupons" element={<Navigate to="painel" replace />} />
            <Route path="cupons/painel" element={<CouponsPanel />} />
            <Route path="cupons/gestao" element={<CouponsManagement />} />
            <Route path="cupons/validacao" element={<CouponsValidation />} />
            <Route path="cupons/sorteio" element={<CouponsDraw />} />
            <Route path="cupons/roletas" element={<CouponsRoulettes />} />

            <Route path="arte" element={<EvaluationsArte />} />
            <Route path="configuracoes" element={<EvaluationsSettings />} />
            <Route path="*" element={<Navigate to="" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
