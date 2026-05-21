import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ModuleGuard } from "@/components/ModuleGuard";
import { PDVHeaderNav } from "@/components/pdv/PDVHeaderNav";
import { PDVUserMenu } from "@/components/pdv/PDVUserMenu";
import { PDVNotifications } from "@/components/pdv/PDVNotifications";
import { CashierStatus } from "@/components/pdv/CashierStatus";
import { Logo } from "@/components/ui/logo";
import { useUserRole } from "@/hooks/use-user-role";
import { useDeliveryOrdersWatcher } from "@/hooks/use-delivery-orders-watcher";
import PDVDashboard from "./pdv/Dashboard";
import PDVSalon from "./pdv/Salon";

import PDVCashier from "./pdv/Cashier";

import PDVProducts from "./pdv/Products";
import PDVStock from "./pdv/Stock";
import PDVSuppliers from "./pdv/Suppliers";
import PDVReports from "./pdv/Reports";
import PDVSettings from "./pdv/Settings";
import Invoices from "./pdv/Invoices";
import FiscalCoupons from "./pdv/FiscalCoupons";
import FinancialTransactions from "./pdv/financial/FinancialTransactions";
import AccountsPayable from "./pdv/financial/AccountsPayable";
import AccountsReceivable from "./pdv/financial/AccountsReceivable";
import CashFlow from "./pdv/financial/CashFlow";
import ChartOfAccounts from "./pdv/financial/ChartOfAccounts";
import CostCenters from "./pdv/financial/CostCenters";
import DRE from "./pdv/financial/DRE";
import ProductCMV from "./pdv/financial/ProductCMV";
import GeneralCMV from "./pdv/financial/GeneralCMV";
import CashierStatement from "./pdv/financial/CashierStatement";
import DeliveryOrders from "./pdv/delivery/Orders";
import DeliveryMenu from "./pdv/delivery/Menu";
import DeliveryPersonalization from "./pdv/delivery/Personalization";
import DeliveryCoupons from "./pdv/delivery/Coupons";
import DeliverySettings from "./pdv/delivery/Settings";
import DeliveryReports from "./pdv/delivery/Reports";
import DeliveryHeatMap from "./pdv/delivery/HeatMap";
import DeliveryLoyalty from "./pdv/delivery/Loyalty";
import DeliveryDrivers from "./pdv/delivery/Drivers";
import ComandasPage from "./pdv/Comandas";
import Quotations from "./pdv/purchases/Quotations";
import PurchaseOrders from "./pdv/purchases/PurchaseOrders";
import ShoppingList from "./pdv/purchases/ShoppingList";
import Integrations from "./pdv/Integrations";
import Users from "./pdv/Users";
import UserForm from "./pdv/UserForm";
import EvaluationsLayout from "./pdv/EvaluationsLayout";
import FranchiseImport from "./pdv/FranchiseImport";
import Tasks from "./pdv/Tasks";
import ChecklistEditor from "./pdv/ChecklistEditor";
import Customers from "./pdv/Customers";
import CustomerDetail from "./pdv/CustomerDetail";
import ProductionCenters from "./pdv/ProductionCenters";
import EmployeeConsumptionAdmin from "./pdv/EmployeeConsumptionAdmin";

function RoleRoute({ path, children, canAccess, defaultRoute }: { path: string; children: React.ReactNode; canAccess: (p: string) => boolean; defaultRoute: string }) {
  if (!canAccess(path)) {
    return <Navigate to={defaultRoute} replace />;
  }
  return <>{children}</>;
}

export default function PDV() {
  const { canAccess, defaultRoute, isLoading } = useUserRole();
  useDeliveryOrdersWatcher();
  const { pathname } = useLocation();
  const isFixedHeight =
    pathname.startsWith("/pdv/avaliacoes") ||
    pathname === "/pdv/tarefas" ||
    pathname === "/pdv/tarefas/";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <ModuleGuard module="pdv">
      <div className="flex flex-col min-h-screen w-full">
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center px-4 gap-4">
            <Logo size="lg" className="shrink-0" />
            <PDVHeaderNav />
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <CashierStatus />
              <PDVNotifications />
              <PDVUserMenu />
            </div>
          </div>
        </header>

        <main className={isFixedHeight ? "flex-1 h-[calc(100vh-3.5rem)] overflow-hidden" : "flex-1 overflow-auto"}>
          <Routes>
              <Route index element={<Navigate to={defaultRoute} replace />} />
              
              {/* Financeiro */}
              <Route path="financeiro/lancamentos" element={<RoleRoute path="/pdv/financeiro/lancamentos" canAccess={canAccess} defaultRoute={defaultRoute}><FinancialTransactions /></RoleRoute>} />
              <Route path="financeiro/contas-pagar" element={<RoleRoute path="/pdv/financeiro/contas-pagar" canAccess={canAccess} defaultRoute={defaultRoute}><AccountsPayable /></RoleRoute>} />
              <Route path="financeiro/contas-receber" element={<RoleRoute path="/pdv/financeiro/contas-receber" canAccess={canAccess} defaultRoute={defaultRoute}><AccountsReceivable /></RoleRoute>} />
              <Route path="financeiro/fluxo-caixa" element={<RoleRoute path="/pdv/financeiro/fluxo-caixa" canAccess={canAccess} defaultRoute={defaultRoute}><CashFlow /></RoleRoute>} />
              <Route path="financeiro/plano-contas" element={<RoleRoute path="/pdv/financeiro/plano-contas" canAccess={canAccess} defaultRoute={defaultRoute}><ChartOfAccounts /></RoleRoute>} />
              <Route path="financeiro/centros-custo" element={<RoleRoute path="/pdv/financeiro/centros-custo" canAccess={canAccess} defaultRoute={defaultRoute}><CostCenters /></RoleRoute>} />
              <Route path="financeiro/dre" element={<RoleRoute path="/pdv/financeiro/dre" canAccess={canAccess} defaultRoute={defaultRoute}><DRE /></RoleRoute>} />
              <Route path="financeiro/cmv-produtos" element={<RoleRoute path="/pdv/financeiro/cmv-produtos" canAccess={canAccess} defaultRoute={defaultRoute}><ProductCMV /></RoleRoute>} />
              <Route path="financeiro/cmv-geral" element={<RoleRoute path="/pdv/financeiro/cmv-geral" canAccess={canAccess} defaultRoute={defaultRoute}><GeneralCMV /></RoleRoute>} />
              <Route path="financeiro/demonstrativo-caixa" element={<RoleRoute path="/pdv/financeiro/demonstrativo-caixa" canAccess={canAccess} defaultRoute={defaultRoute}><CashierStatement /></RoleRoute>} />
              
              {/* Frente de Caixa */}
              <Route path="salao" element={<RoleRoute path="/pdv/salao" canAccess={canAccess} defaultRoute={defaultRoute}><PDVSalon /></RoleRoute>} />
              
              <Route path="caixa" element={<RoleRoute path="/pdv/caixa" canAccess={canAccess} defaultRoute={defaultRoute}><PDVCashier /></RoleRoute>} />
              
              <Route path="comandas" element={<RoleRoute path="/pdv/comandas" canAccess={canAccess} defaultRoute={defaultRoute}><ComandasPage /></RoleRoute>} />
              
              {/* Delivery */}
              <Route path="delivery/pedidos" element={<RoleRoute path="/pdv/delivery/pedidos" canAccess={canAccess} defaultRoute={defaultRoute}><DeliveryOrders /></RoleRoute>} />
              <Route path="delivery/cardapio" element={<RoleRoute path="/pdv/delivery/cardapio" canAccess={canAccess} defaultRoute={defaultRoute}><DeliveryMenu /></RoleRoute>} />
              <Route path="delivery/personalizacao" element={<RoleRoute path="/pdv/delivery/personalizacao" canAccess={canAccess} defaultRoute={defaultRoute}><DeliveryPersonalization /></RoleRoute>} />
              <Route path="delivery/cupons" element={<RoleRoute path="/pdv/delivery/cupons" canAccess={canAccess} defaultRoute={defaultRoute}><DeliveryCoupons /></RoleRoute>} />
              <Route path="delivery/configuracoes" element={<RoleRoute path="/pdv/delivery/configuracoes" canAccess={canAccess} defaultRoute={defaultRoute}><DeliverySettings /></RoleRoute>} />
              <Route path="delivery/relatorios" element={<RoleRoute path="/pdv/delivery/relatorios" canAccess={canAccess} defaultRoute={defaultRoute}><DeliveryReports /></RoleRoute>} />
              <Route path="delivery/mapa-calor" element={<RoleRoute path="/pdv/delivery/mapa-calor" canAccess={canAccess} defaultRoute={defaultRoute}><DeliveryHeatMap /></RoleRoute>} />
              <Route path="delivery/fidelidade" element={<RoleRoute path="/pdv/delivery/fidelidade" canAccess={canAccess} defaultRoute={defaultRoute}><DeliveryLoyalty /></RoleRoute>} />
              <Route path="delivery/entregadores" element={<RoleRoute path="/pdv/delivery/entregadores" canAccess={canAccess} defaultRoute={defaultRoute}><DeliveryDrivers /></RoleRoute>} />
              
              {/* Administrador */}
              <Route path="dashboard" element={<RoleRoute path="/pdv/dashboard" canAccess={canAccess} defaultRoute={defaultRoute}><PDVDashboard /></RoleRoute>} />
              <Route path="produtos" element={<RoleRoute path="/pdv/produtos" canAccess={canAccess} defaultRoute={defaultRoute}><PDVProducts /></RoleRoute>} />
              <Route path="centros-producao" element={<RoleRoute path="/pdv/centros-producao" canAccess={canAccess} defaultRoute={defaultRoute}><ProductionCenters /></RoleRoute>} />
              <Route path="estoque" element={<RoleRoute path="/pdv/estoque" canAccess={canAccess} defaultRoute={defaultRoute}><PDVStock /></RoleRoute>} />
              <Route path="fornecedores" element={<RoleRoute path="/pdv/fornecedores" canAccess={canAccess} defaultRoute={defaultRoute}><PDVSuppliers /></RoleRoute>} />
              <Route path="notas-fiscais" element={<RoleRoute path="/pdv/notas-fiscais" canAccess={canAccess} defaultRoute={defaultRoute}><Invoices /></RoleRoute>} />
              <Route path="cupons-fiscais" element={<RoleRoute path="/pdv/cupons-fiscais" canAccess={canAccess} defaultRoute={defaultRoute}><FiscalCoupons /></RoleRoute>} />
              <Route path="relatorios" element={<RoleRoute path="/pdv/relatorios" canAccess={canAccess} defaultRoute={defaultRoute}><PDVReports /></RoleRoute>} />
              <Route path="configuracoes" element={<RoleRoute path="/pdv/configuracoes" canAccess={canAccess} defaultRoute={defaultRoute}><PDVSettings /></RoleRoute>} />
              <Route path="usuarios" element={<RoleRoute path="/pdv/usuarios" canAccess={canAccess} defaultRoute={defaultRoute}><Users /></RoleRoute>} />
              <Route path="usuarios/novo" element={<RoleRoute path="/pdv/usuarios" canAccess={canAccess} defaultRoute={defaultRoute}><UserForm /></RoleRoute>} />
              <Route path="usuarios/:id/editar" element={<RoleRoute path="/pdv/usuarios" canAccess={canAccess} defaultRoute={defaultRoute}><UserForm /></RoleRoute>} />
              
              {/* Compras */}
              <Route path="compras/cotacoes" element={<RoleRoute path="/pdv/compras/cotacoes" canAccess={canAccess} defaultRoute={defaultRoute}><Quotations /></RoleRoute>} />
              <Route path="compras/pedidos" element={<RoleRoute path="/pdv/compras/pedidos" canAccess={canAccess} defaultRoute={defaultRoute}><PurchaseOrders /></RoleRoute>} />
              <Route path="compras/lista" element={<RoleRoute path="/pdv/compras/lista" canAccess={canAccess} defaultRoute={defaultRoute}><ShoppingList /></RoleRoute>} />
              
              {/* Integrações */}
              <Route path="integracoes/*" element={<RoleRoute path="/pdv/integracoes" canAccess={canAccess} defaultRoute={defaultRoute}><Integrations /></RoleRoute>} />
              
              {/* Avaliações */}
              <Route path="avaliacoes/*" element={<RoleRoute path="/pdv/avaliacoes" canAccess={canAccess} defaultRoute={defaultRoute}><EvaluationsLayout /></RoleRoute>} />
              
              {/* Franquia */}
              <Route path="franquia" element={<RoleRoute path="/pdv/franquia" canAccess={canAccess} defaultRoute={defaultRoute}><FranchiseImport /></RoleRoute>} />
              
              {/* Tarefas */}
              <Route path="tarefas" element={<RoleRoute path="/pdv/tarefas" canAccess={canAccess} defaultRoute={defaultRoute}><Tasks /></RoleRoute>} />
              <Route path="tarefas/checklists/novo" element={<RoleRoute path="/pdv/tarefas" canAccess={canAccess} defaultRoute={defaultRoute}><ChecklistEditor /></RoleRoute>} />
              <Route path="tarefas/checklists/:id" element={<RoleRoute path="/pdv/tarefas" canAccess={canAccess} defaultRoute={defaultRoute}><ChecklistEditor /></RoleRoute>} />
              
              {/* Clientes */}
              <Route path="clientes" element={<RoleRoute path="/pdv/clientes" canAccess={canAccess} defaultRoute={defaultRoute}><Customers /></RoleRoute>} />
              <Route path="clientes/:id" element={<RoleRoute path="/pdv/clientes" canAccess={canAccess} defaultRoute={defaultRoute}><CustomerDetail /></RoleRoute>} />

              {/* Consumo de Funcionários (fiado interno) */}
              <Route path="venda-a-prazo" element={<RoleRoute path="/pdv/venda-a-prazo" canAccess={canAccess} defaultRoute={defaultRoute}><EmployeeConsumptionAdmin /></RoleRoute>} />
              <Route path="funcionarios-consumo" element={<Navigate to="/pdv/venda-a-prazo" replace />} />
            </Routes>
          </main>
      </div>
    </ModuleGuard>
  );
}
