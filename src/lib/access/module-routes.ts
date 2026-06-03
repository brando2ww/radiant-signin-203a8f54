import type { UserModule } from "@/hooks/use-user-modules";

/**
 * Mapeia rotas → módulo do tenant. Fonte única da verdade.
 * Liberar o módulo X libera TODAS as rotas listadas em X.
 *
 * Rotas são prefixos: `/pdv/financeiro` cobre `/pdv/financeiro/qualquer-coisa`.
 */
export const MODULE_ROUTES: Record<UserModule, string[]> = {
  pdv: [
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
    "/pdv/usuarios",
    "/pdv/integracoes",
    "/pdv/franquia",
    "/pdv/clientes",
    "/pdv/venda-a-prazo",
    "/pdv/funcionarios-consumo",
    "/pdv/compras",
    "/garcom",
  ],
  financeiro: ["/pdv/financeiro"],
  delivery: ["/pdv/delivery"],
  avaliacoes: ["/pdv/avaliacoes", "/avaliacoes"],
  tarefas: ["/pdv/tarefas"],
  crm: ["/pdv/crm"],
};

/** Retorna o módulo dono de uma rota (ou null se a rota não pertence a nenhum módulo conhecido). */
export function moduleForRoute(path: string): UserModule | null {
  for (const [mod, routes] of Object.entries(MODULE_ROUTES) as [UserModule, string[]][]) {
    if (routes.some((r) => path === r || path.startsWith(r + "/"))) {
      return mod;
    }
  }
  return null;
}

/** Expande módulos liberados → lista plana de rotas-prefixo. */
export function routesForModules(modules: UserModule[]): string[] {
  const set = new Set<string>();
  for (const m of modules) {
    for (const r of MODULE_ROUTES[m] || []) set.add(r);
  }
  return [...set];
}
