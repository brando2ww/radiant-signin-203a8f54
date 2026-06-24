import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserModules, type UserModule } from "@/hooks/use-user-modules";
import { MODULE_ROUTES, moduleForRoute } from "@/lib/access/module-routes";

export type AppRole =
  | "proprietario"
  | "gerente"
  | "caixa"
  | "garcom"
  | "cozinheiro"
  | "estoquista"
  | "financeiro"
  | "atendente_delivery";

/**
 * Escopo estrutural de cada papel: quais MÓDULOS o papel pode usar.
 * Dentro do módulo, todas as rotas ficam liberadas (regra do cliente).
 * Papéis com sub-allow-list usam `subRoutes` para restringir páginas específicas.
 */
interface RoleScope {
  modules: UserModule[] | "*";
  /** Quando definido, restringe a apenas estas rotas-prefixo (interseção com modules). */
  subRoutes?: string[];
}

const ROLE_SCOPE: Record<AppRole, RoleScope> = {
  proprietario: { modules: "*" },
  gerente: {
    modules: ["pdv", "financeiro", "delivery", "avaliacoes", "tarefas", "crm"],
  },
  // "Operador" do produto: Frente de Caixa + pedidos de delivery, sem
  // financeiro/configurações/relatórios.
  caixa: {
    modules: ["pdv", "delivery"],
    subRoutes: ["/pdv/caixa", "/pdv/delivery/pedidos"],
  },
  garcom: {
    modules: ["pdv"],
    subRoutes: ["/garcom", "/pdv/salao", "/pdv/comandas"],
  },
  cozinheiro: {
    modules: ["pdv"],
    subRoutes: ["/pdv/comandas"],
  },
  estoquista: {
    modules: ["pdv"],
    subRoutes: [
      "/pdv/estoque",
      "/pdv/fornecedores",
      "/pdv/notas-fiscais",
      "/pdv/cupons-fiscais",
      "/pdv/compras/cotacoes",
      "/pdv/compras/lista",
      "/pdv/compras/pedidos",
    ],
  },
  financeiro: {
    modules: ["financeiro"],
    subRoutes: ["/pdv/financeiro", "/pdv/relatorios"],
  },
  atendente_delivery: {
    modules: ["delivery"],
    subRoutes: [
      "/pdv/delivery/pedidos",
      "/pdv/delivery/cardapio",
      "/pdv/delivery/cupons",
      "/pdv/delivery/entregadores",
    ],
  },
};

const roleDefaultRoute: Record<AppRole, string> = {
  proprietario: "/pdv/caixa",
  gerente: "/pdv/caixa",
  caixa: "/pdv/caixa",
  garcom: "/garcom",
  cozinheiro: "/pdv/comandas",
  estoquista: "/pdv/estoque",
  financeiro: "/pdv/financeiro/lancamentos",
  atendente_delivery: "/pdv/delivery/pedidos",
};

export function useUserRole() {
  const { user } = useAuth();
  const { hasModule, activeModules, isLoading: isLoadingModules } = useUserModules();

  const { data: role = "proprietario" as AppRole, isLoading: isLoadingRole } = useQuery({
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

  const scope = ROLE_SCOPE[role] ?? ROLE_SCOPE.proprietario;

  /** Rotas-prefixo derivadas do papel (módulos × subRoutes). */
  const allowedRoutes: string[] = (() => {
    if (scope.modules === "*") return ["*"];
    const moduleRoutes = scope.modules.flatMap((m) => MODULE_ROUTES[m] || []);
    if (!scope.subRoutes) return moduleRoutes;
    // subRoutes filtram dentro dos módulos do papel
    return scope.subRoutes;
  })();

  const canAccess = (path: string): boolean => {
    // 1. Papel autoriza?
    const roleOk =
      allowedRoutes.includes("*") ||
      allowedRoutes.some((r) => path === r || path.startsWith(r + "/"));
    if (!roleOk) return false;

    // 2. Módulo do tenant está ativo?
    const mod = moduleForRoute(path);
    if (mod && !hasModule(mod)) return false;

    return true;
  };

  const roleDefault = roleDefaultRoute[role] || "/pdv/caixa";
  // Se o default do papel está em um módulo inativo no tenant, usa
  // a primeira rota do primeiro módulo ativo.
  const active = activeModules();
  const defaultRoute = canAccess(roleDefault)
    ? roleDefault
    : active.includes("avaliacoes")
    ? "/avaliacoes"
    : active.includes("delivery")
    ? "/pdv/delivery/pedidos"
    : active.includes("financeiro")
    ? "/pdv/financeiro/lancamentos"
    : roleDefault;


  return {
    role,
    isLoading: isLoadingRole || isLoadingModules,
    canAccess,
    allowedRoutes,
    defaultRoute,
    activeModules,
  };
}

export { ROLE_SCOPE, roleDefaultRoute };
