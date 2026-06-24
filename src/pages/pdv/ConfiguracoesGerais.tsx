import { Routes, Route, Navigate, NavLink, useSearchParams } from "react-router-dom";
import {
  Building2, Store, Truck, LayoutDashboard, ShoppingCart,
  DollarSign, FileText, Plug, Shield, Clock, Palette, CreditCard, Bell,
  Package, Warehouse, ChefHat, Users, UserCheck, BarChart3, GitBranch,
  ShoppingBag, Smartphone, TrendingUp, Hash, MessageSquare, ShieldCheck,
  Scale, Landmark, AlertCircle, MapPin, KeyRound, Receipt,
} from "lucide-react";
import { GeneralTab } from "@/components/pdv/settings/GeneralTab";
import { VisualTab } from "@/components/pdv/settings/VisualTab";
import { FinancialTab } from "@/components/pdv/settings/FinancialTab";
import { OrdersTab } from "@/components/pdv/settings/OrdersTab";
import { NotificationsTab } from "@/components/pdv/settings/NotificationsTab";
import { FiscalTab } from "@/components/pdv/settings/FiscalTab";
import { PermissionsTab } from "@/components/pdv/settings/PermissionsTab";
import { SettingsTab as DeliverySettingsTab } from "@/components/delivery/SettingsTab";
import IntegrationsHub from "@/pages/pdv/IntegrationsHub";
import { PurchaseSettingsContent } from "@/pages/pdv/purchases/PurchaseSettings";
import { FinancialSettingsContent } from "@/pages/pdv/financial/FinancialSettings";
import Assinatura from "@/pages/pdv/Assinatura";
import { usePDVSettings } from "@/hooks/use-pdv-settings";
import { CategoryLayout, type SidebarItem } from "@/pages/pdv/settings/CategoryLayout";
import { SettingsHome } from "@/pages/pdv/settings/SettingsHome";
import { cn } from "@/lib/utils";

// ── Admin quick links ────────────────────────────────────────────────────────
const ADMIN_LINKS = [
  { label: "Usuários",            icon: Users,     href: "/pdv/usuarios" },
  { label: "Produtos",            icon: Package,   href: "/pdv/produtos" },
  { label: "Estoque",             icon: Warehouse, href: "/pdv/estoque" },
  { label: "Centros de Produção", icon: ChefHat,   href: "/pdv/centros-producao" },
  { label: "Clientes",            icon: UserCheck, href: "/pdv/clientes" },
  { label: "Franquia",            icon: GitBranch, href: "/pdv/franquia" },
  { label: "Venda a Prazo",       icon: UserCheck, href: "/pdv/venda-a-prazo" },
  { label: "Relatórios",          icon: BarChart3, href: "/pdv/relatorios" },
];

// ── Category pages ───────────────────────────────────────────────────────────

function GeraisPage() {
  const { settings, isLoading, updateSettings, isUpdating } = usePDVSettings();
  const handleSave = (values: any) => updateSettings(values);

  const sidebar: SidebarItem[] = [
    { id: "dados",    label: "Dados do Estabelecimento", icon: Building2, type: "anchor" },
    { id: "horarios", label: "Horários",                 icon: Clock,     type: "anchor" },
  ];

  return (
    <CategoryLayout
      title="Geral"
      description="Dados do estabelecimento e horários de funcionamento"
      categoryPath="Geral"
      badge="Afeta todo o sistema"
      sidebar={sidebar}
    >
      {isLoading ? (
        <div className="p-6 flex justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="p-4 md:p-6">
          <GeneralTab defaultValues={settings || {}} onSave={handleSave} isSubmitting={isUpdating} />
        </div>
      )}
    </CategoryLayout>
  );
}

function FrenteCaixaPage() {
  const { settings, isLoading, updateSettings, isUpdating } = usePDVSettings();
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section") || "operacao";
  const handleSave = (values: any) => updateSettings(values);

  const sidebar: SidebarItem[] = [
    { id: "operacao",    label: "Operação",    icon: ShoppingBag, type: "switch" },
    { id: "visual",      label: "Visual",      icon: Palette,     type: "switch" },
    { id: "pagamentos",  label: "Pagamentos",  icon: CreditCard,  type: "switch" },
    { id: "notificacoes",label: "Notificações",icon: Bell,        type: "switch" },
  ];

  const commonProps = { defaultValues: settings || {}, onSave: handleSave, isSubmitting: isUpdating };

  return (
    <CategoryLayout
      title="Frente de Caixa"
      description="Operação, visual, pagamentos e notificações do PDV"
      categoryPath="Frente de Caixa"
      sidebar={sidebar}
    >
      {isLoading ? (
        <div className="p-6 flex justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="p-4 md:p-6">
          {section === "operacao"     && <OrdersTab {...commonProps} />}
          {section === "visual"       && <VisualTab />}
          {section === "pagamentos"   && <FinancialTab {...commonProps} />}
          {section === "notificacoes" && <NotificationsTab {...commonProps} />}
        </div>
      )}
    </CategoryLayout>
  );
}

function DeliveryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get("section") || "hours";

  const sidebar: SidebarItem[] = [
    { id: "hours",         label: "Horários",    icon: Clock,       type: "switch" },
    { id: "delivery",      label: "Entrega",     icon: Truck,       type: "switch" },
    { id: "payment",       label: "Pagamento",   icon: CreditCard,  type: "switch" },
    { id: "notifications", label: "Notificações",icon: Bell,        type: "switch" },
    { id: "app",           label: "App Mobile",  icon: Smartphone,  type: "switch" },
    { id: "marketing",     label: "Marketing",   icon: TrendingUp,  type: "switch" },
    { id: "fiscal",        label: "Fiscal",      icon: FileText,    type: "switch" },
  ];

  return (
    <CategoryLayout
      title="Delivery"
      description="Horários, entrega, pagamento, notificações, app mobile e marketing"
      categoryPath="Delivery"
      sidebar={sidebar}
    >
      <DeliverySettingsTab
        value={section}
        onValueChange={(v) => setSearchParams({ section: v })}
      />
    </CategoryLayout>
  );
}

function AdminPage() {
  return (
    <CategoryLayout
      title="Administrador"
      description="Usuários, produtos, clientes, plano e assinatura"
      categoryPath="Administrador"
    >
      <div className="p-4 md:p-6 space-y-8">
        <div>
          <h2 className="text-base font-semibold mb-3">Acesso Rápido</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {ADMIN_LINKS.map(({ label, icon: Icon, href }) => (
              <NavLink
                key={href}
                to={href}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-accent text-center",
                    isActive && "bg-accent"
                  )
                }
              >
                <Icon className="h-5 w-5 text-primary" />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
        <Assinatura />
      </div>
    </CategoryLayout>
  );
}

function ComprasPage() {
  const sidebar: SidebarItem[] = [
    { id: "numeracao", label: "Numeração",       icon: Hash,         type: "anchor" },
    { id: "cotacao",   label: "Fluxo de Cotação",icon: Users,        type: "anchor" },
    { id: "aprovacao", label: "Aprovação",        icon: ShieldCheck,  type: "anchor" },
    { id: "mensagem",  label: "Template",         icon: MessageSquare,type: "anchor" },
    { id: "whatsapp",  label: "WhatsApp",         icon: Smartphone,   type: "anchor" },
  ];

  return (
    <CategoryLayout
      title="Compras"
      description="Numeração, fluxo de cotação, aprovação e WhatsApp"
      categoryPath="Compras"
      sidebar={sidebar}
    >
      <PurchaseSettingsContent />
    </CategoryLayout>
  );
}

function FinanceiroPage() {
  const sidebar: SidebarItem[] = [
    { id: "regime",  label: "Regime Contábil",     icon: Scale,       type: "anchor" },
    { id: "padroes", label: "Padrões de Lançamento",icon: Landmark,   type: "anchor" },
    { id: "alertas", label: "Alertas de Vencimento",icon: AlertCircle,type: "anchor" },
  ];

  return (
    <CategoryLayout
      title="Financeiro"
      description="Regime contábil, padrões de lançamento e alertas de vencimento"
      categoryPath="Financeiro"
      sidebar={sidebar}
    >
      <FinancialSettingsContent />
    </CategoryLayout>
  );
}

function FiscalPage() {
  const sidebar: SidebarItem[] = [
    { id: "dados",       label: "Dados Cadastrais",  icon: Building2,  type: "anchor" },
    { id: "endereco",    label: "Endereço",           icon: MapPin,     type: "anchor" },
    { id: "certificado", label: "Certificado Digital",icon: KeyRound,   type: "anchor" },
    { id: "nfce",        label: "NFC-e CSC",          icon: Receipt,    type: "anchor" },
    { id: "habilitacao", label: "Habilitação",         icon: ShieldCheck,type: "anchor" },
  ];

  return (
    <CategoryLayout
      title="Fiscal"
      description="FocusNFe, certificado digital, NFC-e, NF-e, CSC e habilitação"
      categoryPath="Fiscal"
      badge="Configuração crítica"
      sidebar={sidebar}
    >
      <div className="p-4 md:p-6">
        <FiscalTab />
      </div>
    </CategoryLayout>
  );
}

function IntegracoesPage() {
  return (
    <CategoryLayout
      title="Integrações"
      description="iFood, WhatsApp Business, maquininhas e demais integrações"
      categoryPath="Integrações"
    >
      <div className="p-4 md:p-6">
        <IntegrationsHub />
      </div>
    </CategoryLayout>
  );
}

function PermissoesPage() {
  return (
    <CategoryLayout
      title="Permissões"
      description="Matriz de permissões por perfil de usuário"
      categoryPath="Permissões"
    >
      <div className="p-4 md:p-6">
        <PermissionsTab />
      </div>
    </CategoryLayout>
  );
}

// ── Root sub-router ──────────────────────────────────────────────────────────

export default function ConfiguracoesGerais() {
  return (
    <Routes>
      <Route index element={<SettingsHome />} />
      <Route path="geral"         element={<GeraisPage />} />
      <Route path="frente-caixa"  element={<FrenteCaixaPage />} />
      <Route path="delivery"      element={<DeliveryPage />} />
      <Route path="administrador" element={<AdminPage />} />
      <Route path="compras"       element={<ComprasPage />} />
      <Route path="financeiro"    element={<FinanceiroPage />} />
      <Route path="fiscal"        element={<FiscalPage />} />
      <Route path="integracoes"   element={<IntegracoesPage />} />
      <Route path="permissoes"    element={<PermissoesPage />} />
      <Route path="*"             element={<Navigate to="/pdv/configuracoes-gerais" replace />} />
    </Routes>
  );
}
