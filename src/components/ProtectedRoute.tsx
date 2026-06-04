import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSuperAdmin } from '@/hooks/use-super-admin';
import { useUserRole } from '@/hooks/use-user-role';
import { RouteModuleGuard } from '@/components/RouteModuleGuard';

const Loader = () => (
  <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-muted">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
      <p className="text-muted-foreground">Carregando...</p>
    </div>
  </div>
);

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { isSuperAdmin, isLoading: superAdminLoading } = useSuperAdmin();
  const { canAccess, defaultRoute, isLoading: roleLoading } = useUserRole();
  const { pathname } = useLocation();

  if (loading || superAdminLoading) return <Loader />;

  if (!user) return <Navigate to="/" replace />;

  // Super admin não pode acessar o PDV — redireciona para /admin
  if (isSuperAdmin) return <Navigate to="/admin" replace />;

  if (roleLoading) return <Loader />;

  // Bloqueia acesso a rotas fora do escopo do papel
  if (!canAccess(pathname)) {
    return <Navigate to={defaultRoute} replace />;
  }

  // Bloqueia rotas cujo módulo não está habilitado para o tenant
  return <RouteModuleGuard>{children}</RouteModuleGuard>;
};
