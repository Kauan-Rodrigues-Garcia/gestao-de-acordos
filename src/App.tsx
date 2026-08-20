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
import { PetWidget } from '@/components/pet/PetWidget';
import { ImpersonacaoBanner } from '@/components/ImpersonacaoBanner';
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { RealtimeAcordosProvider } from '@/providers/RealtimeAcordosProvider';
import { PresenceProvider } from '@/providers/PresenceProvider';
import { RastreioUsoProvider } from '@/providers/RastreioUsoProvider';
import { NotificacoesProvider } from '@/providers/NotificacoesProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { ROUTE_PATHS } from '@/lib/index';

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
const Ouvidoria         = lazy(() => import('@/pages/Ouvidoria'));
const CampanhaFacil     = lazy(() => import('@/pages/CampanhaFacil'));
const SolicitacoesWpp   = lazy(() => import('@/pages/SolicitacoesWhatsapp'));
const Tickets           = lazy(() => import('@/pages/Tickets'));
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
          <PetWidget />
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

function TenantThemeApplier(): null {
  const { tenantSlug } = useEmpresa();
  useEffect(() => {
    document.documentElement.setAttribute('data-tenant', tenantSlug);

    // Favicon por empresa (vale em todas as páginas, inclusive login):
    // BookPlay = handshake azul; PaguePlay/padrão = handshake verde.
    // PNGs com fundo transparente (sem o fundo preto do SVG antigo).
    const href = tenantSlug === 'bookplay' ? '/logo-bookplay.png' : '/logo-pagueplay.png';
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = href;

    return () => {
      document.documentElement.removeAttribute('data-tenant');
    };
  }, [tenantSlug]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary scope="App" fallbackMessage="Erro crítico na aplicação. Recarregue a página.">
    <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <EmpresaProvider>
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

              <Route path={ROUTE_PATHS.DASHBOARD} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_dashboard"><Dashboard /></ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* A lista da BookPlay. Era livre: qualquer cargo logado abria. */}
              <Route path={ROUTE_PATHS.ACORDOS} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_acordos">
                    <Acordos />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ACORDO_NOVO} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="criar_acordos">
                    <AcordoForm />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ACORDO_EDITAR} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="editar_acordos">
                    <AcordoForm />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ACORDO_DETALHE} element={
                <LayoutWrapper><AcordoDetalhe /></LayoutWrapper>
              } />

              {/* Importar Excel — gated pela permissão importar_excel (admin bypassa) */}
              <Route path={ROUTE_PATHS.IMPORTAR_EXCEL} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="importar_excel">
                    <ImportarExcel />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              <Route path={ROUTE_PATHS.PAINEL_LIDER} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_painel_lider">
                    <PainelLider />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.PAINEL_LIDER_OPERADOR} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_painel_lider">
                    <PainelLider />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ADMIN_USUARIOS} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_usuarios">
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
                  <ProtectedRoute requiredPermissao="ver_configuracoes">
                    <AdminConfiguracoes />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* /admin/logs agora é aba dentro de /admin/configuracoes */}
              <Route path={ROUTE_PATHS.ADMIN_LOGS} element={<Navigate to={ROUTE_PATHS.ADMIN_CONFIGURACOES + '?tab=logs'} replace />} />
              <Route path={ROUTE_PATHS.ADMIN_METAS} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_metas">
                    <MetasConfig />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ADMIN_LIXEIRA} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_lixeira">
                    <Lixeira />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Painel Diretoria */}
              <Route path={ROUTE_PATHS.PAINEL_DIRETORIA} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_painel_diretoria">
                    <PainelDiretoria />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Analítico (PaguePlay + BookPlay — o gate por slug continua
                  dentro da página; a permissão decide QUEM abre) */}
              <Route path={ROUTE_PATHS.ANALITICO} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_analitico">
                    <PaginaAnalitico />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Ouvidoria [PP]. Era LIVRE — qualquer cargo logado entrava, com
                  reclamação de cliente dentro. A concessão fina por
                  `ouvidoria_acessos` continua valendo dentro da página. */}
              <Route path={ROUTE_PATHS.OUVIDORIA} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_ouvidoria">
                    <Ouvidoria />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Campanha Fácil [BP] — o gate por slug segue dentro da página. */}
              <Route path={ROUTE_PATHS.CAMPANHA_FACIL} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_campanha_facil">
                    <CampanhaFacil />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Solicitações de WhatsApp — o chat interno entre o setor de
                  ligação e o digital. */}
              <Route path={ROUTE_PATHS.SOLICITACOES_WHATSAPP} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_solicitacoes_whatsapp">
                    <SolicitacoesWpp />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Tickets — a fila de pedidos da liderança. O cargo aqui é só a
                  porta larga: quem enxerga de fato depende da chave em
                  `tickets_config`, e a própria página resolve isso. */}
              <Route path={ROUTE_PATHS.TICKETS} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_tickets">
                    <Tickets />
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
                <ProtectedRoute requiredPermissao="ver_creators_lab">
                  <CreatorsLab />
                </ProtectedRoute>
              } />

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
        </EmpresaProvider>
        <DevToolsAdminOnly />
      </AuthProvider>
    </ThemeProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
