import type { UserModule } from "@/hooks/use-user-modules";

/**
 * Rotas sempre liberadas (infraestrutura básica do app).
 * Não dependem de módulo do tenant.
 */
export const ALWAYS_ALLOWED_ROUTES: string[] = [];

/**
 * Mapeia rotas → módulo do tenant. Fonte única da verdade.
 * Rotas são prefixos: `/pdv/financeiro` cobre `/pdv/financeiro/qualquer-coisa`.
 *
 * Política: allowlist estrita. Rotas não mapeadas são bloqueadas pelo
 * `PDVHeaderNav` para evitar vazamento de itens entre tenants.
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
    "/pdv/franquia",
    "/pdv/venda-a-prazo",
    "/pdv/funcionarios-consumo",
    "/pdv/compras",
    "/pdv/configuracoes",
    "/pdv/usuarios",
    "/pdv/integracoes",
    "/pdv/clientes",
    "/garcom",
  ],
  financeiro: ["/pdv/financeiro"],
  delivery: ["/pdv/delivery"],
  avaliacoes: ["/pdv/avaliacoes", "/avaliacoes"],
  tarefas: ["/pdv/tarefas"],
  crm: ["/pdv/crm"],
};


function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/** Verifica se a rota é sempre liberada (independente de módulo). */
export function isAlwaysAllowed(path: string): boolean {
  return ALWAYS_ALLOWED_ROUTES.some((r) => matches(path, r));
}

/** Retorna o módulo dono de uma rota (ou null se a rota não pertence a nenhum módulo conhecido). */
export function moduleForRoute(path: string): UserModule | null {
  for (const [mod, routes] of Object.entries(MODULE_ROUTES) as [UserModule, string[]][]) {
    if (routes.some((r) => matches(path, r))) {
      return mod;
    }
  }
  return null;
}

/** Expande módulos liberados → lista plana de rotas-prefixo. */
export function routesForModules(modules: UserModule[]): string[] {
  const set = new Set<string>(ALWAYS_ALLOWED_ROUTES);
  for (const m of modules) {
    for (const r of MODULE_ROUTES[m] || []) set.add(r);
  }
  return [...set];
}

/** Rótulos amigáveis para exibir mensagens de módulo bloqueado. */
export const MODULE_LABELS: Record<UserModule, string> = {
  pdv: "Frente de Caixa",
  financeiro: "Financeiro",
  delivery: "Delivery",
  avaliacoes: "Avaliações",
  tarefas: "Tarefas",
  crm: "CRM",
};
