/**
 * src/components/ProtectedRoute.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Guards de rota baseados em autenticação e perfil (RBAC).
 *
 * ## Componentes exportados
 *
 * ### `ProtectedRoute`
 * Redireciona para `/login` se o usuário não estiver autenticado.
 * Redireciona para `/` (dashboard) se o perfil do usuário não estiver na
 * lista `roles` ou `allowedProfiles`.
 *
 * @param children        - Conteúdo protegido
 * @param roles           - Lista de perfis permitidos (ex: ['administrador'])
 * @param allowedProfiles - Sinônimo de `roles` (retrocompatibilidade)
 *
 * @example
 * ```tsx
 * // Rota acessível por qualquer usuário autenticado
 * <ProtectedRoute>
 *   <Dashboard />
 * </ProtectedRoute>
 *
 * // Rota restrita a administradores
 * <ProtectedRoute allowedProfiles={['administrador', 'super_admin']}>
 *   <AdminConfiguracoes />
 * </ProtectedRoute>
 * ```
 *
 * ### `PublicRoute`
 * Redireciona para `/` se o usuário **já estiver** autenticado.
 * Usado nas páginas de Login e Registro.
 *
 * @example
 * ```tsx
 * <PublicRoute>
 *   <Login />
 * </PublicRoute>
 * ```
 */
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROUTE_PATHS } from '@/lib/index';
import { Skeleton } from '@/components/ui/skeleton';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
  allowedProfiles?: string[];
  /** Chave de permissão configurável: se o usuário tiver essa permissão,
   *  ganha acesso independente do perfil (allowedProfiles fica como fallback). */
  requiredPermissao?: string;
}

export function ProtectedRoute({ children, roles, allowedProfiles, requiredPermissao }: ProtectedRouteProps): React.ReactElement | null {
  const { user, perfil, loading } = useAuth();
  const { temPermissao, loading: permLoading } = useCargoPermissoes();

  if (loading || (requiredPermissao && permLoading)) {
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

  // Se tem permissão configurada E o usuário a possui → acesso garantido
  // (temPermissao já retorna true para admin/super_admin)
  if (requiredPermissao && temPermissao(requiredPermissao)) {
    return <>{children}</> as React.ReactElement;
  }

  // Fallback: verificação por perfil (comportamento original)
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
