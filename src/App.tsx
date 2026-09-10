import { lazy, Suspense, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { EmpresaProvider } from '@/hooks/useEmpresa';
import { useEmpresa } from '@/hooks/useEmpresa';
import { ProtectedRoute, PublicRoute } from '@/components/ProtectedRoute';
import { TermoUsoGate } from '@/components/TermoUsoGate';
import { TermoUsoProvider } from '@/hooks/useTermoUso';
import Layout from '@/components/Layout';
import { ChatNotificacoes } from '@/components/ChatNotificacoes';
import { ImpersonacaoBanner } from '@/components/ImpersonacaoBanner';
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { RealtimeAcordosProvider } from '@/providers/RealtimeAcordosProvider';
import { PresenceProvider } from '@/providers/PresenceProvider';
import { RastreioUsoProvider } from '@/providers/RastreioUsoProvider';
import { NotificacoesProvider } from '@/providers/NotificacoesProvider';
import { MesProvider } from '@/providers/MesProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { ROUTE_PATHS } from '@/lib/index';
import { produtoDaEmpresa, type Produto } from '@/lib/produto';
import { NucleoProvider, useNucleo } from '@/hooks/useNucleo';

/**
 * As rotas da cobrança, declaradas uma vez.
 *
 * Repetir `['cobranca']` em dezesseis rotas convida à divergência: alguém
 * acrescenta um produto em quinze e esquece a décima sexta, e o buraco não
 * aparece em teste nenhum — aparece quando um vendedor abre a URL.
 */
const SO_COBRANCA: readonly Produto[] = ['cobranca'];

/**
 * ## `nucleo="fora"` e `nucleo="so"` — o recorte por SETOR
 *
 * Um eixo a mais, ao lado de `produtos` e `requiredPermissao`, e ele existe
 * porque nenhum dos dois dava conta do Núcleo de Inteligência e Gestão:
 *
 *   - `produtos` não recorta: o Núcleo é `cobranca`. Mesma empresa (BookPlay),
 *     mesmo banco, mesmo deploy. Inventar um quarto produto para um setor
 *     criaria uma empresa que não existe;
 *   - `requiredPermissao` não recorta: cargo não distingue setor. Quem trabalha
 *     no Núcleo é operador, líder, gerência — os mesmos cargos do Play 3. Tirar
 *     `ver_acordos` do cargo `operador` tiraria acordo de todo operador da
 *     empresa.
 *
 * Sem o eixo, quem é do Núcleo herdava a operação de cobrança inteira só porque
 * o produto da empresa é cobrança: Acordos, Novo Acordo, Analítico e Lixeira
 * abriam para um setor que não tem um acordo sequer.
 *
 * Levam `nucleo="fora"` as rotas que falam de ACORDO — criar, editar, listar,
 * medir, recuperar da lixeira, importar planilha, e os painéis que somam tudo
 * isso. `nucleo="so"` fica com o Controle de Números, que é a tela do Núcleo.
 *
 * NÃO levam marca, e é decisão e não esquecimento: `/` (existe para todo mundo,
 * e é o CONTEÚDO dela que muda — ver `PainelDeEntrada`), Usuários e
 * Configurações (cadastro de gente e da empresa, que todo setor usa), RH Gestão
 * e Tickets (atravessam a empresa, e ninguém pediu para fechar).
 *
 * A mesma marca existe em `NAV_ITEMS` (`lib/menuLateral.ts`), e as duas listas
 * têm de concordar — há teste de contrato para isso. Esconder o item do menu
 * não fecha porta nenhuma: menu é conforto, rota é a porta.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,  // Realtime mantém cache em sincronia — refetch no foco é redundante e causa "piscar"
      refetchOnReconnect: true,     // refaz se internet caiu e voltou (importante)
      retry: 1,
    },
  },
});

const Login             = lazy(() => import('@/pages/Login'));
const Dashboard         = lazy(() => import('@/pages/Dashboard'));
const ProdutoEmMontagem = lazy(() => import('@/pages/ProdutoEmMontagem'));
const Acordos           = lazy(() => import('@/pages/Acordos'));
const AcordoForm        = lazy(() => import('@/pages/AcordoForm'));
const AcordoDetalhe     = lazy(() => import('@/pages/AcordoDetalhe'));
const PainelLider       = lazy(() => import('@/pages/PainelLider'));
const AdminUsuarios     = lazy(() => import('@/pages/AdminUsuarios'));
const AdminConfiguracoes= lazy(() => import('@/pages/AdminConfiguracoes'));
const MetasConfig       = lazy(() => import('@/pages/MetasConfig'));
const ImportarExcel     = lazy(() => import('@/pages/ImportarExcel'));
const NotFound          = lazy(() => import('@/pages/not-found/Index'));
const Registro          = lazy(() => import('@/pages/Registro'));
const Lixeira           = lazy(() => import('@/pages/Lixeira'));
const PainelDiretoria   = lazy(() => import('@/pages/PainelDiretoria'));
const PaginaAnalitico   = lazy(() => import('@/pages/Analitico'));
const CampanhaFacil     = lazy(() => import('@/pages/CampanhaFacil'));
const SolicitacoesWpp   = lazy(() => import('@/pages/SolicitacoesWhatsapp'));
const Tickets           = lazy(() => import('@/pages/Tickets'));
const RhGestao          = lazy(() => import('@/pages/RhGestao'));
const ControleNumeros   = lazy(() => import('@/pages/ControleNumeros'));
const MeusChips         = lazy(() => import('@/pages/MeusChips'));
// O painel do Nucleo. Lazy como o resto, e aqui isso poupa o bundle de quase
// todo mundo: um setor so o abre.
const DashboardNucleo   = lazy(() => import('@/pages/DashboardNucleo'));
const ModoTV            = lazy(() => import('@/pages/ModoTV'));
// O palco. Lazy como o resto, e aqui isso importa por um motivo extra: o PC da
// TV baixa SÓ este pedaço, e não a mesa nem o Gestão inteiro.
const TvPalco           = lazy(() => import('@/pages/TvPalco'));
// Creators Lab: lazy como todo o resto, e por um motivo a mais — quem usa o
// Gestão e nunca descobre o Easter Egg não baixa um byte dele.
const CreatorsLab       = lazy(() => import('@/pages/CreatorsLab'));
// Comemorações não tem mais rota própria: virou aba de /admin/usuarios e é
// carregada de lá (lazy também, para não entrar no bundle de quem não abre).

function PageLoader() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-4 gap-4 mt-6">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

function LayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <TermoUsoProvider>
        <TermoUsoGate>
          <Layout>
            {/* ErrorBoundary por página — evita que o erro de uma rota quebre o layout inteiro */}
            <ErrorBoundary scope="Page" fallbackMessage="Ocorreu um erro ao carregar esta página. Tente novamente.">
              {children}
            </ErrorBoundary>
          </Layout>
          <ChatNotificacoes />
        </TermoUsoGate>
      </TermoUsoProvider>
    </ProtectedRoute>
  );
}

function DevToolsAdminOnly() {
  const { perfil } = useAuth();
  if (perfil?.perfil !== 'administrador' && perfil?.perfil !== 'super_admin') return null;
  return <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />;
}

function VersionWatcher(): null {
  useVersionCheck();
  return null;
}

/**
 * A rota `/` por produto — e, dentro da cobrança, por SETOR.
 *
 * O Dashboard é da cobrança inteiro. Enquanto Comercial e RH não têm o deles,
 * a porta de entrada avisa que a operação está sendo montada — em vez de abrir
 * uma tela de recebimento vazia para um vendedor.
 *
 * ## O Núcleo entra aqui, e não dentro do Dashboard
 *
 * O Núcleo de Inteligência e Gestão é `cobranca` — mesma empresa, mesmo deploy —
 * e mesmo assim recebimento, acordo pago, ticket médio e meta do mês não dizem
 * nada sobre o trabalho dele, que é preparar e distribuir números de WhatsApp.
 *
 * A troca acontece nesta função, com um `return` diferente, e **o Dashboard da
 * cobrança não é tocado**. A alternativa — abrir o Dashboard e ramificar lá
 * dentro — colocaria dois painéis em mil linhas de componente e faria toda
 * mudança na cobrança arriscar quebrar o Núcleo, e vice-versa. Aqui os dois só
 * dividem a URL.
 *
 * Enquanto `useNucleo` carrega, `souDoNucleo` é `false` e o Dashboard da
 * cobrança aparece. Não é vazamento: o painel do Núcleo não mostra nada que a
 * pessoa não pudesse ver, e o Dashboard mostra o que a RLS dela entregar — que,
 * para quem é do Núcleo, é praticamente nada.
 */
function PainelDeEntrada(): React.ReactElement {
  const { empresa, tenantSlug, loading } = useEmpresa();
  const { souDoNucleo } = useNucleo();
  const produto = produtoDaEmpresa(empresa, tenantSlug);

  if (souDoNucleo) return <DashboardNucleo />;

  // Enquanto carrega, o Dashboard já se vira sozinho com os próprios estados de
  // carregamento — e trocá-lo por um esqueleto aqui piscaria duas vezes.
  if (loading || produto === 'cobranca') return <Dashboard />;
  return <ProdutoEmMontagem produto={produto} />;
}

function TenantThemeApplier(): null {
  const { empresa, tenantSlug } = useEmpresa();
  useEffect(() => {
    document.documentElement.setAttribute('data-tenant', tenantSlug);

    // Favicon por empresa (vale em todas as páginas, inclusive login):
    // BookPlay = handshake azul; PaguePlay = handshake verde.
    //
    // O ternário de dois casos ficou errado quando surgiram Comercial e RH:
    // «não é bookplay» virava PaguePlay, e as duas empresas novas nasceram com
    // a logo de uma cobrança que não é a delas.
    //
    // Fora da cobrança o app NÃO troca o ícone — fica o do `index.html`. Apontar
    // para um arquivo que ainda não existe daria 404 e ícone quebrado, que é
    // pior do que um ícone genérico. Quando Comercial e RH tiverem logo, entram
    // aqui como mais uma linha do mapa.
    const produto = produtoDaEmpresa(empresa, tenantSlug);
    const href = produto !== 'cobranca'
      ? null
      : (tenantSlug === 'bookplay' ? '/logo-bookplay.png' : '/logo-pagueplay.png');
    if (href) {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.type = 'image/png';
      link.href = href;
    }

    return () => {
      document.documentElement.removeAttribute('data-tenant');
    };
  }, [empresa, tenantSlug]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary scope="App" fallbackMessage="Erro crítico na aplicação. Recarregue a página.">
    <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <EmpresaProvider>
          {/* Dentro de EmpresaProvider porque precisa da empresa, e ACIMA do
              Router porque três consumidores fazem a mesma pergunta — a barra
              lateral, o guarda de rota e a porta de entrada. Um hook solto em
              cada um consultaria `numeros_config` três vezes por navegação. */}
          <NucleoProvider>
          {/* Acima de tudo que desenha número: o mês escolhido vale para o
              sistema inteiro, e não pode se perder ao trocar de página. */}
          <MesProvider>
          <RealtimeAcordosProvider>
          <PresenceProvider>
          {/* Acima do Router: o sino do header (Layout) e o painel
              (ChatNotificacoes) precisam do MESMO estado de notificações. */}
          <NotificacoesProvider>
        <TenantThemeApplier />
        <VersionWatcher />
        <Router>
          {/* DENTRO do Router: o rastreio lê a rota atual com `useLocation`, e
              fora dele o hook estouraria. Não renderiza nada — só mede. */}
          <RastreioUsoProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path={ROUTE_PATHS.LOGIN} element={
                <PublicRoute><Login /></PublicRoute>
              } />
              <Route path={ROUTE_PATHS.REGISTRO} element={
                <PublicRoute><Registro /></PublicRoute>
              } />

              {/* `/` existe em todo produto — é a porta de entrada. O que ela
                  DESENHA é que muda: o Dashboard atual é da cobrança de ponta a
                  ponta (recebimento, acordo, meta, ticket médio) e não significa
                  nada em Vendas ou RH. Ver `PainelDeEntrada`. */}
              <Route path={ROUTE_PATHS.DASHBOARD} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_dashboard" mostrarSemAcesso>
                    <PainelDeEntrada />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* A lista da BookPlay. Era livre: qualquer cargo logado abria. */}
              <Route path={ROUTE_PATHS.ACORDOS} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" requiredPermissao="ver_acordos">
                    <Acordos />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ACORDO_NOVO} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" allowedProfiles={['operador','lider','administrador','elite','gerencia']} requiredPermissao="criar_acordos">
                    <AcordoForm />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ACORDO_EDITAR} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" allowedProfiles={['operador','lider','administrador','elite','gerencia','diretoria']} requiredPermissao="editar_acordos">
                    <AcordoForm />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* Sem `requiredPermissao` de propósito: a rota sempre foi aberta a
                  qualquer pessoa logada, e apertá-la agora tiraria acesso de quem
                  usa hoje. O que entra é só a barreira de PRODUTO — quem não é da
                  cobrança não tem o que ver aqui. Fechar por permissão é decisão à
                  parte, e merece ser tomada em separado. */}
              <Route path={ROUTE_PATHS.ACORDO_DETALHE} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora"><AcordoDetalhe /></ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Importar Excel — gated pela permissão importar_excel (admin bypassa) */}
              <Route path={ROUTE_PATHS.IMPORTAR_EXCEL} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" allowedProfiles={['operador','lider','administrador','elite','gerencia','diretoria']} requiredPermissao="importar_excel">
                    <ImportarExcel />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              <Route path={ROUTE_PATHS.PAINEL_LIDER} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" allowedProfiles={['lider','administrador','elite','gerencia']} requiredPermissao="ver_painel_lider">
                    <PainelLider />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.PAINEL_LIDER_OPERADOR} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" allowedProfiles={['lider','administrador','elite','gerencia']} requiredPermissao="ver_painel_lider">
                    <PainelLider />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ADMIN_USUARIOS} element={
                <LayoutWrapper>
                  <ProtectedRoute allowedProfiles={['lider','administrador','elite','gerencia']} requiredPermissao="ver_usuarios">
                    <AdminUsuarios />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* /admin/setores agora é aba dentro de /admin/usuarios */}
              <Route path={ROUTE_PATHS.ADMIN_SETORES} element={<Navigate to={ROUTE_PATHS.ADMIN_USUARIOS + '?tab=setores'} replace />} />
              {/* /admin/equipes agora é aba dentro de /admin/usuarios */}
              <Route path={ROUTE_PATHS.ADMIN_EQUIPES} element={<Navigate to={ROUTE_PATHS.ADMIN_USUARIOS + '?tab=equipes'} replace />} />
              <Route path={ROUTE_PATHS.ADMIN_CONFIGURACOES} element={
                <LayoutWrapper>
                  <ProtectedRoute allowedProfiles={['administrador']} requiredPermissao="ver_configuracoes">
                    <AdminConfiguracoes />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* /admin/logs agora é aba dentro de /admin/configuracoes */}
              <Route path={ROUTE_PATHS.ADMIN_LOGS} element={<Navigate to={ROUTE_PATHS.ADMIN_CONFIGURACOES + '?tab=logs'} replace />} />
              <Route path={ROUTE_PATHS.ADMIN_METAS} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" allowedProfiles={['administrador','lider','elite','gerencia']} requiredPermissao="ver_metas">
                    <MetasConfig />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ADMIN_LIXEIRA} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" allowedProfiles={['administrador','lider','operador','elite','gerencia','diretoria']} requiredPermissao="ver_lixeira">
                    <Lixeira />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Painel Diretoria */}
              <Route path={ROUTE_PATHS.PAINEL_DIRETORIA} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" allowedProfiles={['diretoria','administrador']}
                                  requiredPermissao="ver_painel_diretoria">
                    <PainelDiretoria />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Analítico (PaguePlay + BookPlay — o gate por slug continua
                  dentro da página; a permissão decide QUEM abre) */}
              <Route path={ROUTE_PATHS.ANALITICO} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" requiredPermissao="ver_analitico">
                    <PaginaAnalitico />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Campanha Fácil [BP] — o gate por slug segue dentro da página. */}
              <Route path={ROUTE_PATHS.CAMPANHA_FACIL} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" requiredPermissao="ver_campanha_facil">
                    <CampanhaFacil />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Solicitações de WhatsApp — o chat interno entre o setor de
                  ligação e o digital. */}
              <Route path={ROUTE_PATHS.SOLICITACOES_WHATSAPP} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} requiredPermissao="ver_solicitacoes_whatsapp">
                    <SolicitacoesWpp />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Tickets — a fila de pedidos da liderança. O cargo aqui é só a
                  porta larga: quem enxerga de fato depende da chave em
                  `tickets_config`, e a própria página resolve isso. */}
              <Route path={ROUTE_PATHS.TICKETS} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} requiredPermissao="ver_tickets">
                    <Tickets />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* RH Gestão — Controle de Premiação e Comissão. O cargo não
                  entra na rota: quem abre é `ver_rh_gestao`, e o que a pessoa
                  enxerga dentro sai do escopo da aba (equipe que ela lidera,
                  setor, ou a empresa). A RLS cumpre o mesmo recorte no banco. */}
              <Route path={ROUTE_PATHS.RH_GESTAO} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} requiredPermissao="ver_rh_gestao">
                    <RhGestao />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Controle de Números — o Núcleo de Inteligência e Gestão.

                  Sem `allowedProfiles`: quem abre é a chave, como nas abas já
                  convertidas. E a chave sozinha não basta — `fn_numeros_visivel`
                  ainda exige que a pessoa esteja no setor apontado por
                  `numeros_config`, então um cargo com a chave ligada num setor
                  qualquer abre a tela e não recebe uma linha. */}
              <Route path={ROUTE_PATHS.CONTROLE_NUMEROS} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="so" requiredPermissao="ver_controle_numeros">
                    <ControleNumeros />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Meus Chips — a outra ponta. O que a pessoa enxerga aqui sai do
                  escopo da aba `chips`: individual (o operador vê o que foi
                  lançado para ele) ou setor (a liderança vê tudo). */}
              <Route path={ROUTE_PATHS.MEUS_CHIPS} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} nucleo="fora" requiredPermissao="ver_meus_chips">
                    <MeusChips />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* /comemoracoes agora é aba dentro de /admin/usuarios.
                  Redireciona em vez de sumir: notificação antiga, link colado no
                  WhatsApp e favorito continuam caindo na tela certa. */}
              <Route path={ROUTE_PATHS.COMEMORACOES} element={
                <Navigate to={ROUTE_PATHS.ADMIN_USUARIOS + '?tab=comemoracoes'} replace />
              } />

              {/* /admin/cargos agora é aba dentro de /admin/configuracoes */}
              <Route path={ROUTE_PATHS.ADMIN_CARGOS} element={<Navigate to={ROUTE_PATHS.ADMIN_CONFIGURACOES + '?tab=permissoes'} replace />} />

              {/*
                Creators Lab — a área escondida.

                Sem `LayoutWrapper` de propósito: ela substitui a tela inteira,
                sem barra lateral nem cabeçalho do Gestão. Continua dentro de
                `ProtectedRoute` (só quem está logado), mas sem exigir permissão
                — não há dado do Gestão ali, e o ponto é justamente qualquer
                pessoa curiosa poder encontrar.
              */}
              <Route path={ROUTE_PATHS.CREATORS_LAB} element={
                <ProtectedRoute produtos={SO_COBRANCA}>
                  <CreatorsLab />
                </ProtectedRoute>
              } />

              {/*
                Modo TV — a mesa. Atrás do painel como todo o resto: a chave
                `ver_modo_tv` nasce desligada para todo cargo configurável, então
                hoje só quem tem acesso total abre.
              */}
              <Route path={ROUTE_PATHS.MODO_TV} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} requiredPermissao="ver_modo_tv">
                    <ModoTV />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/*
                O palco — a ÚNICA rota com dado que roda sem sessão.

                Sem `LayoutWrapper`, sem `ProtectedRoute` e sem `PublicRoute`:
                ele toma a tela inteira e não pode redirecionar ninguém. Um
                `PublicRoute` aqui mandaria a TV para o Dashboard toda vez que
                alguém abrisse o palco de um navegador já logado.

                O que protege esta rota não é sessão, é superfície: ela fala com
                uma RPC só, somente leitura, que devolve apenas o que está na
                tela. Ver a migration 20260902110000.
              */}
              <Route path={ROUTE_PATHS.TV_PALCO} element={<TvPalco />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <ImpersonacaoBanner />
          <Toaster richColors position="top-right" />
          </RastreioUsoProvider>
        </Router>
          </NotificacoesProvider>
          </PresenceProvider>
          </RealtimeAcordosProvider>
          </MesProvider>
          </NucleoProvider>
        </EmpresaProvider>
        <DevToolsAdminOnly />
      </AuthProvider>
    </ThemeProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
