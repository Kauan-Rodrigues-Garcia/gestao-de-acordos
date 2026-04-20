import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { EmpresaProvider } from '@/hooks/useEmpresa';
import { ThemeProvider } from 'next-themes';
import { ProtectedRoute, PublicRoute } from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import { ChatNotificacoes } from '@/components/ChatNotificacoes';
import { ROUTE_PATHS } from '@/lib/index';
import { lazy, Suspense, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useEmpresa } from '@/hooks/useEmpresa';
import { RealtimeAcordosProvider } from '@/providers/RealtimeAcordosProvider';
import { PresenceProvider } from '@/providers/PresenceProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const Login             = lazy(() => import('@/pages/Login'));
const Dashboard         = lazy(() => import('@/pages/Dashboard'));
const Acordos           = lazy(() => import('@/pages/Acordos'));
const AcordoForm        = lazy(() => import('@/pages/AcordoForm'));
const AcordoDetalhe     = lazy(() => import('@/pages/AcordoDetalhe'));
const PainelLider       = lazy(() => import('@/pages/PainelLider'));
const AdminUsuarios     = lazy(() => import('@/pages/AdminUsuarios'));
const AdminSetores      = lazy(() => import('@/pages/AdminSetores'));
const AdminEquipes      = lazy(() => import('@/pages/AdminEquipes'));
const AdminConfiguracoes= lazy(() => import('@/pages/AdminConfiguracoes'));
const AdminLogs         = lazy(() => import('@/pages/AdminLogs'));
const AdminIA           = lazy(() => import('@/pages/AdminIA'));
const MetasConfig       = lazy(() => import('@/pages/MetasConfig'));
const ImportarExcel     = lazy(() => import('@/pages/ImportarExcel'));
const NotFound          = lazy(() => import('@/pages/not-found/Index'));
const Registro          = lazy(() => import('@/pages/Registro'));
const Lixeira           = lazy(() => import('@/pages/Lixeira'));
const PainelDiretoria   = lazy(() => import('@/pages/PainelDiretoria'));
const AdminCargos       = lazy(() => import('@/pages/AdminCargos'));
const NotificacoesDetalhadas = lazy(() => import('@/pages/NotificacoesDetalhadas'));

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
      <Layout>
        {/* ErrorBoundary por página — evita que o erro de uma rota quebre o layout inteiro */}
        <ErrorBoundary scope="Page" fallbackMessage="Ocorreu um erro ao carregar esta página. Tente novamente.">
          {children}
        </ErrorBoundary>
      </Layout>
      <ChatNotificacoes />
    </ProtectedRoute>
  );
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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <EmpresaProvider>
          <RealtimeAcordosProvider>
          <PresenceProvider>
        <TenantThemeApplier />
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ... rotas ... */}
              <Route path={ROUTE_PATHS.LOGIN} element={
                <PublicRoute><Login /></PublicRoute>
              } />
              <Route path="/registro" element={
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

              {/* Importar Excel — operadores, líderes e admins */}
              <Route path="/acordos/importar" element={
                <LayoutWrapper><ImportarExcel /></LayoutWrapper>
              } />

              <Route path={ROUTE_PATHS.PAINEL_LIDER} element={
                <LayoutWrapper>
                  <ProtectedRoute allowedProfiles={['lider','administrador','elite','gerencia']}>
                    <PainelLider />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.PAINEL_LIDER_OPERADOR} element={
                <LayoutWrapper>
                  <ProtectedRoute allowedProfiles={['lider','administrador','elite','gerencia']}>
                    <PainelLider />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ADMIN_USUARIOS} element={
                <LayoutWrapper>
                  <ProtectedRoute allowedProfiles={['lider', 'administrador', 'elite', 'gerencia']}>
                    <AdminUsuarios />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ADMIN_SETORES} element={
                <LayoutWrapper>
                  <ProtectedRoute roles={['administrador']}>
                    <AdminSetores />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* /admin/equipes agora é aba dentro de /admin/usuarios */}
              <Route path="/admin/equipes" element={<Navigate to={ROUTE_PATHS.ADMIN_USUARIOS + '?tab=equipes'} replace />} />
              <Route path={ROUTE_PATHS.ADMIN_CONFIGURACOES} element={
                <LayoutWrapper>
                  <ProtectedRoute roles={['administrador']}>
                    <AdminConfiguracoes />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* /admin/logs agora é aba dentro de /admin/configuracoes */}
              <Route path={ROUTE_PATHS.ADMIN_LOGS} element={<Navigate to={ROUTE_PATHS.ADMIN_CONFIGURACOES + '?tab=logs'} replace />} />
              <Route path="/admin/metas" element={
                <LayoutWrapper>
                  <ProtectedRoute allowedProfiles={['administrador','lider','elite','gerencia']}>
                    <MetasConfig />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* /admin/ia agora é aba dentro de /admin/configuracoes */}
              <Route path={ROUTE_PATHS.ADMIN_IA} element={<Navigate to={ROUTE_PATHS.ADMIN_CONFIGURACOES + '?tab=ia'} replace />} />

              <Route path="/admin/lixeira" element={
                <LayoutWrapper>
                  <ProtectedRoute allowedProfiles={['administrador','lider','operador','elite','gerencia','diretoria']}>
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

              {/* Notificações Detalhadas (página dedicada) */}
              <Route path="/notificacoes" element={
                <LayoutWrapper><NotificacoesDetalhadas /></LayoutWrapper>
              } />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <Toaster richColors position="top-right" />
        </Router>
          </PresenceProvider>
          </RealtimeAcordosProvider>
        </EmpresaProvider>
      </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}