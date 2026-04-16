import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROUTE_PATHS } from '@/lib/index';
import { Skeleton } from '@/components/ui/skeleton';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
  allowedProfiles?: string[];
}

export function ProtectedRoute({ children, roles, allowedProfiles }: ProtectedRouteProps): React.ReactElement | null {
  const { user, perfil, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to={ROUTE_PATHS.LOGIN} replace />;

  // Suporte a ambos: roles e allowedProfiles (sinônimos)
  const perfilRequerido = roles ?? allowedProfiles;
  if (perfilRequerido && perfil && perfil.perfil !== 'super_admin' && !perfilRequerido.includes(perfil.perfil)) {
    return <Navigate to={ROUTE_PATHS.DASHBOARD} replace />;
  }

  return <>{children}</> as React.ReactElement;
}

export function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (user) return <Navigate to={ROUTE_PATHS.DASHBOARD} replace />;
  return <>{children}</>;
}
