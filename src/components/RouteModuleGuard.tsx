import { ReactNode } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { useUserModules } from "@/hooks/use-user-modules";
import { isAlwaysAllowed, moduleForRoute } from "@/lib/access/module-routes";
import ModuleUnavailable from "@/pages/ModuleUnavailable";

interface Props {
  children: ReactNode;
}

/**
 * Guarda global por rota: verifica se o módulo correspondente à rota atual
 * está habilitado para o tenant. Mostra a tela `ModuleUnavailable` quando não.
 *
 * Rotas em `ALWAYS_ALLOWED_ROUTES` passam direto.
 * Rotas desconhecidas são redirecionadas para o módulo padrão do tenant.
 */
export function RouteModuleGuard({ children }: Props) {
  const { pathname } = useLocation();
  const { hasModule, isLoading, getDefaultModuleRoute } = useUserModules();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isAlwaysAllowed(pathname)) {
    return <>{children}</>;
  }

  const mod = moduleForRoute(pathname);

  if (!mod) {
    // Rota não mapeada: deixa a árvore de rotas decidir (catch-all / 404).
    return <>{children}</>;
  }

  if (hasModule(mod)) {
    return <>{children}</>;
  }

  // Rota raiz do app sem módulo → manda para o default acessível, evita tela vazia.
  if (pathname === "/pdv" || pathname === "/pdv/") {
    return <Navigate to={getDefaultModuleRoute()} replace />;
  }

  return <ModuleUnavailable module={mod} />;
}
