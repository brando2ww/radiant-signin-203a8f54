import { Badge } from "@/components/ui/badge";
import {
  Armchair,
  ShoppingBag,
  DollarSign,
  ChefHat,
  Package,
  Warehouse,
  Truck,
  BarChart3,
  Settings,
  FileText,
  Receipt,
  Target,
  FolderTree,
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
  FileBarChart,
  PackageSearch,
  PieChart,
  LayoutDashboard,
  UtensilsCrossed,
  Tag,
  Palette,
  Plug,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Permission {
  label: string;
  icon: LucideIcon;
}

interface RolePermissions {
  label: string;
  color: string;
  description: string;
  permissions: Permission[];
}

export const roleConfig: Record<string, RolePermissions> = {
  proprietario: {
    label: "Proprietário",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    description: "Acesso total ao sistema. Gerencia usuários, configurações e todos os módulos.",
    permissions: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Salão", icon: Armchair },
      { label: "Balcão", icon: ShoppingBag },
      { label: "Caixa", icon: DollarSign },
      { label: "Cozinha", icon: ChefHat },
      { label: "Delivery", icon: Truck },
      { label: "Produtos", icon: Package },
      { label: "Estoque", icon: Warehouse },
      { label: "Financeiro", icon: FileText },
      { label: "Relatórios", icon: BarChart3 },
      { label: "Configurações", icon: Settings },
      { label: "Integrações", icon: Plug },
      { label: "Usuários", icon: Users },
    ],
  },
  gerente: {
    label: "Gerente",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    description: "Gerencia a operação completa, exceto gerenciamento de usuários.",
    permissions: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Salão", icon: Armchair },
      { label: "Balcão", icon: ShoppingBag },
      { label: "Caixa", icon: DollarSign },
      { label: "Cozinha", icon: ChefHat },
      { label: "Delivery", icon: Truck },
      { label: "Produtos", icon: Package },
      { label: "Estoque", icon: Warehouse },
      { label: "Financeiro", icon: FileText },
      { label: "Relatórios", icon: BarChart3 },
      { label: "Configurações", icon: Settings },
      { label: "Integrações", icon: Plug },
    ],
  },
  caixa: {
    label: "Caixa",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    description: "Opera o caixa, recebe pagamentos e faz fechamento.",
    permissions: [
      { label: "Caixa", icon: DollarSign },
      { label: "Visualizar Pedidos", icon: ShoppingBag },
    ],
  },
  garcom: {
    label: "Garçom",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    description: "Atende mesas, cria comandas e envia pedidos à cozinha.",
    permissions: [
      { label: "Salão", icon: Armchair },
      { label: "Comandas", icon: Receipt },
      { label: "Cozinha (visualizar)", icon: ChefHat },
    ],
  },
  cozinheiro: {
    label: "Cozinheiro",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    description: "Visualiza e gerencia a fila de preparo na cozinha.",
    permissions: [
      { label: "Cozinha", icon: ChefHat },
    ],
  },
  estoquista: {
    label: "Estoquista",
    color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
    description: "Controla estoque, recebe mercadorias e lança notas fiscais.",
    permissions: [
      { label: "Estoque", icon: Warehouse },
      { label: "Fornecedores", icon: Truck },
      { label: "Notas Fiscais", icon: Receipt },
      { label: "Compras", icon: PackageSearch },
    ],
  },
  financeiro: {
    label: "Financeiro",
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    description: "Gerencia contas, lançamentos, DRE e CMV.",
    permissions: [
      { label: "Lançamentos", icon: FileText },
      { label: "Contas a Pagar", icon: TrendingDown },
      { label: "Contas a Receber", icon: TrendingUp },
      { label: "Fluxo de Caixa", icon: ArrowLeftRight },
      { label: "Plano de Contas", icon: FolderTree },
      { label: "Centros de Custo", icon: Target },
      { label: "DRE", icon: FileBarChart },
      { label: "CMV", icon: PieChart },
      { label: "Relatórios", icon: BarChart3 },
    ],
  },
  atendente_delivery: {
    label: "Atendente Delivery",
    color: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    description: "Gerencia pedidos de delivery e atualiza status.",
    permissions: [
      { label: "Pedidos Delivery", icon: ShoppingBag },
      { label: "Cardápio", icon: UtensilsCrossed },
      { label: "Cupons", icon: Tag },
    ],
  },
};

interface RolePermissionsViewProps {
  role: string;
  compact?: boolean;
}

export function RolePermissionsView({ role, compact = false }: RolePermissionsViewProps) {
  const config = roleConfig[role];
  if (!config) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {config.permissions.map((p) => {
          const Icon = p.icon;
          return (
            <Badge key={p.label} variant="outline" className="text-xs gap-1 font-normal">
              <Icon className="h-3 w-3" />
              {p.label}
            </Badge>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{config.description}</p>
      <div className="grid grid-cols-2 gap-2">
        {config.permissions.map((p) => {
          const Icon = p.icon;
          return (
            <div key={p.label} className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{p.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
