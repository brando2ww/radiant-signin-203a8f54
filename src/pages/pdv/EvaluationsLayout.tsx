import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";

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

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export default function EvaluationsLayout() {
  return (
    <div className="flex flex-col">
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
  );
}
