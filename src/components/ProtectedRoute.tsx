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
import { useEmpresa } from '@/hooks/useEmpresa';
import { produtoDaEmpresa, produtoPermite, type Produto } from '@/lib/produto';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
  allowedProfiles?: string[];
  /** Chave de permissão configurável: se o usuário tiver essa permissão,
   *  ganha acesso independente do perfil (allowedProfiles fica como fallback). */
  requiredPermissao?: string;
  /**
   * Em quais PRODUTOS esta rota existe. Lista branca: sem ela, a rota vale em
   * qualquer produto — que é o padrão certo só para as rotas genéricas (perfil,
   * termos, 404).
   *
   * Existe porque esconder o item do menu não fecha porta nenhuma: até 25/08 um
   * usuário do Comercial digitava `/acordos` na barra de endereço e a tela de
   * cobrança abria, com `ver_acordos` herdado da semeadura. Menu é conforto;
   * rota é a porta.
   */
  produtos?: readonly Produto[];
  /** Mantém o layout aberto e mostra uma mensagem em vez de redirecionar. */
  mostrarSemAcesso?: boolean;
}

export function ProtectedRoute({ children, roles, allowedProfiles, requiredPermissao, produtos, mostrarSemAcesso = false }: ProtectedRouteProps): React.ReactElement | null {
  const { user, perfil, loading } = useAuth();
  const { temPermissao, loading: permLoading } = useCargoPermissoes();
  const { empresa, tenantSlug, loading: empresaLoading } = useEmpresa();

  if (loading || (requiredPermissao && permLoading) || (produtos && empresaLoading)) {
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

  /*
   * O produto vem ANTES de cargo e permissão, porque é pergunta de outra ordem.
   *
   * Cargo e permissão respondem «esta pessoa pode ver?». Esta responde «isto
   * sequer existe aqui?». Um vendedor com `ver_acordos` ligado por engano na
   * semeadura continua fora de `/acordos`: acordo não é coisa do Comercial, e
   * nenhuma permissão faz virar.
   */
  if (produtos && !produtoPermite(produtos, produtoDaEmpresa(empresa, tenantSlug))) {
    return <Navigate to={ROUTE_PATHS.DASHBOARD} replace />;
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
      if (mostrarSemAcesso) {
        return (
          <div className="flex min-h-[50vh] items-center justify-center p-8 text-center">
            <div>
              <p className="font-medium text-foreground">Esta aba não foi liberada para seu cargo.</p>
              <p className="mt-1 text-sm text-muted-foreground">Escolha no menu uma das abas disponíveis.</p>
            </div>
          </div>
        );
      }
      return <Navigate to={ROUTE_PATHS.DASHBOARD} replace />;
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
