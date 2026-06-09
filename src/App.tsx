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
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { RealtimeAcordosProvider } from '@/providers/RealtimeAcordosProvider';
import { PresenceProvider } from '@/providers/PresenceProvider';
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
const AdminSetores      = lazy(() => import('@/pages/AdminSetores'));
const AdminConfiguracoes= lazy(() => import('@/pages/AdminConfiguracoes'));
const MetasConfig       = lazy(() => import('@/pages/MetasConfig'));
const ImportarExcel     = lazy(() => import('@/pages/ImportarExcel'));
const NotFound          = lazy(() => import('@/pages/not-found/Index'));
const Registro          = lazy(() => import('@/pages/Registro'));
const Lixeira           = lazy(() => import('@/pages/Lixeira'));
const PainelDiretoria   = lazy(() => import('@/pages/PainelDiretoria'));

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

function TenantThemeApplier(): null {
  const { tenantSlug } = useEmpresa();
  useEffect(() => {
    document.documentElement.setAttribute('data-tenant', tenantSlug);
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
        <TenantThemeApplier />
        <VersionWatcher />
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path={ROUTE_PATHS.LOGIN} element={
                <PublicRoute><Login /></PublicRoute>
              } />
              <Route path={ROUTE_PATHS.REGISTRO} element={
                <PublicRoute><Registro /></PublicRoute>
              } />

              <Route path={ROUTE_PATHS.DASHBOARD} element={
                <LayoutWrapper><Dashboard /></LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ACORDOS} element={
                <LayoutWrapper><Acordos /></LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ACORDO_NOVO} element={
                <LayoutWrapper><AcordoForm /></LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ACORDO_EDITAR} element={
                <LayoutWrapper><AcordoForm /></LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ACORDO_DETALHE} element={
                <LayoutWrapper><AcordoDetalhe /></LayoutWrapper>
              } />

              {/* Importar Excel — disponível para todos os usuários */}
              <Route path={ROUTE_PATHS.IMPORTAR_EXCEL} element={
                <LayoutWrapper>
                  <ImportarExcel />
                </LayoutWrapper>
              } />

              <Route path={ROUTE_PATHS.PAINEL_LIDER} element={
                <LayoutWrapper>
                  <ProtectedRoute allowedProfiles={['lider','administrador','elite','gerencia']} requiredPermissao="ver_painel_lider">
                    <PainelLider />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.PAINEL_LIDER_OPERADOR} element={
                <LayoutWrapper>
                  <ProtectedRoute allowedProfiles={['lider','administrador','elite','gerencia']} requiredPermissao="ver_painel_lider">
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
              <Route path={ROUTE_PATHS.ADMIN_SETORES} element={
                <LayoutWrapper>
                  {/* Setores é admin-only por design — sem permissão configurável */}
                  <ProtectedRoute allowedProfiles={['administrador']}>
                    <AdminSetores />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
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
                  <ProtectedRoute allowedProfiles={['administrador','lider','elite','gerencia']} requiredPermissao="ver_metas">
                    <MetasConfig />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ADMIN_LIXEIRA} element={
                <LayoutWrapper>
                  <ProtectedRoute allowedProfiles={['administrador','lider','operador','elite','gerencia','diretoria']} requiredPermissao="ver_lixeira">
                    <Lixeira />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Painel Diretoria */}
              <Route path={ROUTE_PATHS.PAINEL_DIRETORIA} element={
                <LayoutWrapper>
                  <ProtectedRoute allowedProfiles={['diretoria','administrador']}>
                    <PainelDiretoria />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* /admin/cargos agora é aba dentro de /admin/configuracoes */}
              <Route path={ROUTE_PATHS.ADMIN_CARGOS} element={<Navigate to={ROUTE_PATHS.ADMIN_CONFIGURACOES + '?tab=permissoes'} replace />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <Toaster richColors position="top-right" />
        </Router>
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
