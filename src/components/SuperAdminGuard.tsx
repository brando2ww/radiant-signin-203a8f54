import { Navigate } from "react-router-dom";
import { useSuperAdmin } from "@/hooks/use-super-admin";
import { useAuth } from "@/contexts/AuthContext";

export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading } = useSuperAdmin();

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  if (!isSuperAdmin) return <Navigate to="/pdv/caixa" replace />;

  return <>{children}</>;
}
