import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { ProtectedRoute, PublicRoute } from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import { ROUTE_PATHS } from '@/lib/index';
import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const Login             = lazy(() => import('@/pages/Login'));
const Dashboard         = lazy(() => import('@/pages/Dashboard'));
const Acordos           = lazy(() => import('@/pages/Acordos'));
const AcordoForm        = lazy(() => import('@/pages/AcordoForm'));
const AcordoDetalhe     = lazy(() => import('@/pages/AcordoDetalhe'));
const PainelLider       = lazy(() => import('@/pages/PainelLider'));
const AdminUsuarios     = lazy(() => import('@/pages/AdminUsuarios'));
const AdminSetores      = lazy(() => import('@/pages/AdminSetores'));
const AdminConfiguracoes= lazy(() => import('@/pages/AdminConfiguracoes'));
const AdminLogs         = lazy(() => import('@/pages/AdminLogs'));
const ImportarExcel     = lazy(() => import('@/pages/ImportarExcel'));
const NotFound          = lazy(() => import('@/pages/not-found/Index'));
const Registro          = lazy(() => import('@/pages/Registro'));

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
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<PageLoader />}>
          <Routes>
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
                <ProtectedRoute roles={['lider','administrador']}>
                  <PainelLider />
                </ProtectedRoute>
              </LayoutWrapper>
            } />
            <Route path={ROUTE_PATHS.PAINEL_LIDER_OPERADOR} element={
              <LayoutWrapper>
                <ProtectedRoute roles={['lider','administrador']}>
                  <PainelLider />
                </ProtectedRoute>
              </LayoutWrapper>
            } />
            <Route path={ROUTE_PATHS.ADMIN_USUARIOS} element={
              <LayoutWrapper>
                <ProtectedRoute roles={['administrador']}>
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
            <Route path={ROUTE_PATHS.ADMIN_CONFIGURACOES} element={
              <LayoutWrapper>
                <ProtectedRoute roles={['administrador']}>
                  <AdminConfiguracoes />
                </ProtectedRoute>
              </LayoutWrapper>
            } />
            <Route path={ROUTE_PATHS.ADMIN_LOGS} element={
              <LayoutWrapper>
                <ProtectedRoute roles={['administrador']}>
                  <AdminLogs />
                </ProtectedRoute>
              </LayoutWrapper>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Toaster richColors position="top-right" />
      </Router>
    </AuthProvider>
  );
}
