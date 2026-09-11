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
import { useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROUTE_PATHS } from '@/lib/index';
import { Skeleton } from '@/components/ui/skeleton';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useEmpresa } from '@/hooks/useEmpresa';
import { produtoDaEmpresa, produtoPermite, type Produto } from '@/lib/produto';
import { useNucleo } from '@/hooks/useNucleo';

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
  /**
   * Em qual lado da divisão por SETOR esta rota existe.
   *
   *   `'so'`   .. só para quem é do Núcleo de Inteligência e Gestão;
   *   `'fora'` .. para todo mundo MENOS o Núcleo;
   *   ausente  .. os dois lados, que é o certo para as rotas genéricas.
   *
   * Espelha o campo `nucleo` de `NavItem`, e pela mesma razão que `produtos`
   * existe nos dois lugares: **esconder o item do menu não fecha porta
   * nenhuma**. Sem esta prop, alguém do Núcleo digitava `/acordos` na barra de
   * endereço e a tela de cobrança abria inteira, com `ver_acordos` herdado da
   * semeadura do cargo `operador`.
   *
   * Menu é conforto; rota é a porta.
   */
  nucleo?: 'so' | 'fora';
  /** Mantém o layout aberto e mostra uma mensagem em vez de redirecionar. */
  mostrarSemAcesso?: boolean;
}

export function ProtectedRoute({ children, roles, allowedProfiles, requiredPermissao, produtos, nucleo, mostrarSemAcesso = false }: ProtectedRouteProps): React.ReactElement | null {
  const { user, perfil, loading } = useAuth();
  const { temPermissao, loading: permLoading } = useCargoPermissoes();
  const { empresa, tenantSlug, loading: empresaLoading } = useEmpresa();
  const { recorte, loading: nucleoLoading } = useNucleo();

  /*
   * O esqueleto só na PRIMEIRA carga.
   *
   * Trocar a página inteira por um esqueleto DESMONTA tudo o que estava
   * dentro, e todo estado local vai junto: a aba interna aberta, o filtro
   * escolhido, a rolagem, o formulário meio preenchido. Na primeira carga isso
   * não custa nada — não havia nada para perder. Numa recarga de fundo custa
   * tudo.
   *
   * E recarga de fundo acontece o tempo todo: o supabase-js REEMITE
   * `SIGNED_IN` quando a aba volta ao foco, e `useEmpresa` ouvia esse evento.
   * Sair do navegador e voltar levava a pessoa de volta para a primeira aba
   * interna da tela. A causa foi corrigida lá; esta guarda existe para que a
   * próxima fonte de recarga não recrie o mesmo sintoma — são três flags de
   * carregamento diferentes desembocando neste único `if`.
   */
  const jaMostrou = useRef(false);
  /*
   * `nucleo && nucleoLoading` entra na conta pelo mesmo motivo dos outros dois:
   * decidir antes da resposta seria decidir por palpite. E o palpite aqui é o
   * pior possível — `useNucleo` responde `false` enquanto carrega, então uma
   * rota `'fora'` abriria por um instante para quem é do Núcleo. Justamente o
   * buraco que esta prop existe para fechar.
   *
   * O esqueleto só aparece na PRIMEIRA carga (ver `jaMostrou` abaixo), então
   * isto não faz a tela piscar em cada navegação.
   */
  const carregando = loading || (requiredPermissao && permLoading)
    || (produtos && empresaLoading) || (nucleo && nucleoLoading);

  if (carregando && !jaMostrou.current) {
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

  /* Marca no MESMO passo em que entrega o conteúdo: um `useEffect` rodaria
     também nos caminhos que redirecionam, e a rota passaria a se lembrar de
     ter mostrado uma tela que ninguém viu. */
  const liberar = (): React.ReactElement => {
    jaMostrou.current = true;
    return <>{children}</> as React.ReactElement;
  };

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

  /*
   * O SETOR, logo depois do produto — e antes de cargo e permissão, porque é a
   * mesma ordem de pergunta: «isto existe para este setor?» vem antes de «esta
   * pessoa pode ver?».
   *
   * Um operador do Núcleo tem `ver_acordos` ligado, e está certo que tenha: a
   * chave é do CARGO `operador`, e desligá-la tiraria acordo de todo operador da
   * empresa. O que não é dele é a aba.
   *
   * O destino é sempre `/`, e `/` funciona para os dois lados: ela desenha o
   * painel do Núcleo para quem é do Núcleo, e o Dashboard da cobrança para o
   * resto. Ver `PainelDeEntrada`, em App.tsx.
   */
  /*
   * `recorte`, e não `souDoNucleo`: é o mesmo lado que o menu desenha, já com as
   * travessias de `recorteDoNucleo`. `null` não fecha nenhuma das duas marcas —
   * acesso total não tem lado, e quem configura o módulo sem ser do Núcleo
   * precisa alcançar a tela onde a configuração mora.
   *
   * Comparação com `true` e `false`, e não por verdade: `!recorte` trataria o
   * `null` como «não é do Núcleo» e fecharia Controle de Números justamente para
   * quem a travessia existe.
   */
  if (nucleo === 'fora' && recorte === true) {
    return <Navigate to={ROUTE_PATHS.DASHBOARD} replace />;
  }
  if (nucleo === 'so' && recorte === false) {
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
     * `/analitico`, `/campanha-facil` e `/solicitacoes-whatsapp`.
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
    return liberar();
  }

  // Sem requiredPermissao: verificação por perfil (comportamento original)
  const perfilRequerido = roles ?? allowedProfiles;
  if (perfilRequerido && perfil && perfil.perfil !== 'super_admin' && !perfilRequerido.includes(perfil.perfil)) {
    return <Navigate to={ROUTE_PATHS.DASHBOARD} replace />;
  }

  return liberar();
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
