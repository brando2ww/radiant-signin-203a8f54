import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole =
  | "proprietario"
  | "gerente"
  | "caixa"
  | "garcom"
  | "cozinheiro"
  | "estoquista"
  | "financeiro"
  | "atendente_delivery";

const roleRouteAccess: Record<AppRole, string[]> = {
  proprietario: ["*"],
  gerente: [
    "/pdv/dashboard",
    "/pdv/salao",
    
    "/pdv/caixa",
    "/pdv/comandas",
    "/pdv/produtos",
    "/pdv/centros-producao",
    "/pdv/estoque",
    "/pdv/fornecedores",
    "/pdv/notas-fiscais",
    "/pdv/cupons-fiscais",
    "/pdv/relatorios",
    "/pdv/configuracoes",
    "/pdv/compras/cotacoes",
    "/pdv/compras/pedidos",
    "/pdv/compras/lista",
    "/pdv/financeiro/lancamentos",
    "/pdv/financeiro/contas-pagar",
    "/pdv/financeiro/contas-receber",
    "/pdv/financeiro/fluxo-caixa",
    "/pdv/financeiro/plano-contas",
    "/pdv/financeiro/centros-custo",
    "/pdv/financeiro/dre",
    "/pdv/financeiro/cmv-produtos",
    "/pdv/financeiro/cmv-geral",
    "/pdv/delivery/pedidos",
    "/pdv/delivery/cardapio",
    "/pdv/delivery/personalizacao",
    "/pdv/delivery/cupons",
    "/pdv/delivery/configuracoes",
    "/pdv/delivery/relatorios",
    "/pdv/delivery/entregadores",
    "/pdv/integracoes",
    "/pdv/franquia",
    "/pdv/clientes",
  ],
  caixa: ["/pdv/caixa"],
  garcom: ["/garcom", "/pdv/salao", "/pdv/comandas"],
  cozinheiro: ["/pdv/comandas"],
  estoquista: [
    "/pdv/estoque",
    "/pdv/fornecedores",
    "/pdv/notas-fiscais",
    "/pdv/cupons-fiscais",
    "/pdv/compras/cotacoes",
    "/pdv/compras/pedidos",
    "/pdv/compras/lista",
  ],
  financeiro: [
    "/pdv/financeiro/lancamentos",
    "/pdv/financeiro/contas-pagar",
    "/pdv/financeiro/contas-receber",
    "/pdv/financeiro/fluxo-caixa",
    "/pdv/financeiro/plano-contas",
    "/pdv/financeiro/centros-custo",
    "/pdv/financeiro/dre",
    "/pdv/financeiro/cmv-produtos",
    "/pdv/financeiro/cmv-geral",
    "/pdv/relatorios",
  ],
  atendente_delivery: [
    "/pdv/delivery/pedidos",
    "/pdv/delivery/cardapio",
    "/pdv/delivery/cupons",
    "/pdv/delivery/entregadores",
  ],
};

const roleDefaultRoute: Record<AppRole, string> = {
  proprietario: "/pdv/dashboard",
  gerente: "/pdv/dashboard",
  caixa: "/pdv/caixa",
  garcom: "/garcom",
  cozinheiro: "/pdv/comandas",
  estoquista: "/pdv/estoque",
  financeiro: "/pdv/financeiro/lancamentos",
  atendente_delivery: "/pdv/delivery/pedidos",
};

export function useUserRole() {
  const { user } = useAuth();

  const { data: role = "proprietario" as AppRole, isLoading } = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: async (): Promise<AppRole> => {
      if (!user?.id) return "proprietario";
      const { data, error } = await supabase
        .from("establishment_users")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return (data?.role as AppRole) || "proprietario";
    },
    enabled: !!user?.id,
  });

  const allowedRoutes = roleRouteAccess[role] || ["*"];

  const canAccess = (path: string): boolean => {
    if (allowedRoutes.includes("*")) return true;
    return allowedRoutes.some(
      (route) => path === route || path.startsWith(route + "/")
    );
  };

  const defaultRoute = roleDefaultRoute[role] || "/pdv/dashboard";

  return { role, isLoading, canAccess, allowedRoutes, defaultRoute };
}

export { roleRouteAccess, roleDefaultRoute };
