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
import { LockKeyhole } from 'lucide-react';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
  allowedProfiles?: string[];
  /** Chave de permissão configurável: se o usuário tiver essa permissão,
   *  ganha acesso independente do perfil (allowedProfiles fica como fallback). */
  requiredPermissao?: string;
  /** A rota abre quando ao menos uma destas permissões estiver ativa. */
  requiredAnyPermissoes?: string[];
}

export function ProtectedRoute({ children, roles, allowedProfiles, requiredPermissao, requiredAnyPermissoes }: ProtectedRouteProps): React.ReactElement | null {
  const { user, perfil, loading } = useAuth();
  const { temPermissao, loading: permLoading } = useCargoPermissoes();

  if (loading || ((requiredPermissao || requiredAnyPermissoes?.length) && permLoading)) {
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

  if (requiredAnyPermissoes?.length && !requiredAnyPermissoes.some(temPermissao)) {
    return (
      <div className="min-h-[55vh] flex items-center justify-center p-6">
        <div className="max-w-sm text-center rounded-xl border border-border bg-card px-6 py-8">
          <LockKeyhole className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <h1 className="mt-3 text-base font-semibold text-foreground">Acesso não habilitado</h1>
          <p className="mt-1 text-sm text-muted-foreground">Esta aba está desativada para seu cargo ou para a sua conta.</p>
        </div>
      </div>
    );
  }

  if (requiredPermissao) {
    /**
     * Uma pergunta só, feita a quem sabe responder.
     *
     * Este guard lia `permissoes[chave]` direto — o mapa do CARGO. Com isso ele
     * era cego para a exceção por pessoa das Permissões 2.0: desligar
     * `ver_analitico` para a Aline salvava certo, o menu escondia certo, e a
     * rota deixava entrar assim mesmo, porque o cargo `operador` concede.
     *
     * `temPermissao` já resolve as quatro camadas (admin → exceção da pessoa →
     * permissão do cargo → negado). Reimplementar a regra aqui foi o que fez os
     * dois lados divergirem.
     *
     * O antigo fallback para `allowedProfiles` também saiu. Ele existia para
     * chave ausente no banco, e ausência não existe mais: a migration
     * `20260815154058` preencheu todo o catálogo em todo cargo, e a trigger em
     * `empresas` faz empresa nova nascer completa. Pior, o fallback abria a
     * rota inteira quando ela não declarava `allowedProfiles` — que é o caso de
     * `/analitico`, `/ouvidoria`, `/campanha-facil` e `/solicitacoes-whatsapp`.
     * Ausência agora nega, como em todo o resto do sistema.
     */
    if (!temPermissao(requiredPermissao)) {
      return (
        <div className="min-h-[55vh] flex items-center justify-center p-6">
          <div className="max-w-sm text-center rounded-xl border border-border bg-card px-6 py-8">
            <LockKeyhole className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <h1 className="mt-3 text-base font-semibold text-foreground">Acesso não habilitado</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta aba está desativada para seu cargo ou para a sua conta.
            </p>
          </div>
        </div>
      );
    }
    return <>{children}</> as React.ReactElement;
  }

  // Sem requiredPermissao: verificação por perfil (comportamento original)
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
