import { lazy, Suspense, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { NOMES_TEMAS } from '@/lib/temas';
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
import { useTenant } from '@/lib/tenant-config';

/**
 * As rotas da cobrança, declaradas uma vez.
 *
 * Repetir `['cobranca']` em dezesseis rotas convida à divergência: alguém
 * acrescenta um produto em quinze e esquece a décima sexta, e o buraco não
 * aparece em teste nenhum — aparece quando um vendedor abre a URL.
 */
const SO_COBRANCA: readonly Produto[] = ['cobranca'];
/** Mesma razão, do outro lado: o Comercial começou com uma rota e vai ter mais. */
const SO_COMERCIAL: readonly Produto[] = ['comercial'];
/**
 * As telas que servem às duas operações — hoje, só Tickets.
 *
 * O menu declarou Tickets no Comercial na Fase 9 (15/09/2026) e a rota ficou
 * em `SO_COBRANCA`: o item aparecia, o vendedor clicava e voltava para o
 * Dashboard. `Layout.navegacao.test.ts` confere agora que rota e menu
 * declaram o mesmo produto.
 */
const COBRANCA_E_COMERCIAL: readonly Produto[] = ['cobranca', 'comercial'];

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
// Mapa de Abas (29/09/2026): as telas que juntam outras. Ver `lib/mapaAbas.ts`.
const Inicio            = lazy(() => import('@/pages/Inicio'));
const Desempenho        = lazy(() => import('@/pages/Desempenho'));
const FechamentoDoMes   = lazy(() => import('@/pages/FechamentoDoMes'));
const Nucleo            = lazy(() => import('@/pages/Nucleo'));
const AdminDados        = lazy(() => import('@/pages/AdminDados'));
const AdminAuditoria    = lazy(() => import('@/pages/AdminAuditoria'));
const PixAutomatico     = lazy(() => import('@/pages/PixAutomatico'));
const ProdutoEmMontagem = lazy(() => import('@/pages/ProdutoEmMontagem'));
const Acordos           = lazy(() => import('@/pages/Acordos'));
const AcordoForm        = lazy(() => import('@/pages/AcordoForm'));
const AcordoDetalhe     = lazy(() => import('@/pages/AcordoDetalhe'));
const AdminUsuarios     = lazy(() => import('@/pages/AdminUsuarios'));
const AdminConfiguracoes= lazy(() => import('@/pages/AdminConfiguracoes'));
const ImportarExcel     = lazy(() => import('@/pages/ImportarExcel'));
const NotFound          = lazy(() => import('@/pages/not-found/Index'));
const Registro          = lazy(() => import('@/pages/Registro'));
const PaginaAnalitico   = lazy(() => import('@/pages/Analitico'));
const CampanhaFacil     = lazy(() => import('@/pages/CampanhaFacil'));
const SolicitacoesWpp   = lazy(() => import('@/pages/SolicitacoesWhatsapp'));
const Tickets           = lazy(() => import('@/pages/Tickets'));
const Vendas            = lazy(() => import('@/pages/Vendas'));
// A rota `/` do Comercial. Lazy como o resto: quem é da cobrança nunca baixa
// este pedaço, e quem é do Comercial nunca baixa o Dashboard da cobrança.
const DashboardComercial = lazy(() => import('@/pages/Vendas/DashboardComercial'));
const VendasPainelLider  = lazy(() => import('@/pages/Vendas/PainelLiderComercial'));
const VendasPainelDiretoria = lazy(() => import('@/pages/Vendas/PainelDiretoriaComercial'));
const VendasLixeira      = lazy(() => import('@/pages/Vendas/LixeiraVendas'));
// Importação e Fechamento do Setor, em abas. Metas, Acompanhamento e Desafios
// também deixaram de ser página própria — ver os redirecionamentos abaixo.
const VendasIndicacoes  = lazy(() => import('@/pages/Vendas/Indicacoes'));
const MeusChips         = lazy(() => import('@/pages/MeusChips'));
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

/**
 * Redireciona para o endereço novo levando a busca do antigo.
 *
 * As rotas que o Mapa de Abas (29/09/2026) aposentou continuam valendo: um
 * favorito, uma notificação antiga ou um link colado no grupo não pode virar
 * «página não encontrada». A busca vai junto porque carrega o que a tela
 * precisa — `/rh-gestao?fechamento=…&setor=…` abre o mesmo setor lá.
 */
function Redirecionar({ para }: { para: string }): React.ReactElement {
  const { search } = useLocation();
  const [caminho, busca = ''] = para.split('?');
  const juntos = new URLSearchParams(busca);
  new URLSearchParams(search).forEach((v, k) => { if (!juntos.has(k)) juntos.set(k, v); });
  const q = juntos.toString();
  return <Navigate to={q ? `${caminho}?${q}` : caminho} replace />;
}

/**
 * `/acordos` nas duas empresas. Na PaguePlay a lista morava dentro do
 * Dashboard e abria com `ver_dashboard`; a chave veio junto com a lista.
 */
function RotaAcordos(): React.ReactElement {
  const { isPaguePlay } = useTenant();
  return isPaguePlay ? (
    <ProtectedRoute produtos={SO_COBRANCA} requiredPermissao="ver_dashboard">
      <Dashboard secao="acordos" />
    </ProtectedRoute>
  ) : (
    <ProtectedRoute produtos={SO_COBRANCA} requiredPermissao="ver_acordos">
      <Acordos />
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
 * A rota `/` por produto.
 *
 * O Dashboard é da cobrança inteiro — recebimento, acordo, ticket médio e
 * colchão —, e nenhuma dessas palavras significa alguma coisa fora dela. Por
 * isso `/` escolhe o painel pelo produto, e não mostra o mesmo para todos.
 *
 * Desde a Fase 9 (15/09/2026) o Comercial tem o dele: `DashboardComercial`, que
 * é o rodapé da planilha mensal escrito uma vez. O RH ainda não, e continua
 * caindo em `ProdutoEmMontagem` — avisar que a operação está sendo montada é
 * melhor do que abrir uma tela de recebimento vazia para um vendedor.
 *
 * ## O Núcleo não passa mais por aqui
 *
 * Até 11/09/2026 esta função desenhava o painel do Núcleo para quem estava no
 * SETOR dele, por um hook que saiu junto — a última decisão que olhava o setor. O
 * painel virou a aba Dashboard – ADM, com chave própria, e o Assistente ADM
 * deixou de ter `ver_dashboard`: quem chega em `/` sem essa chave e com
 * `ver_dashboard_adm` é mandado para lá pela `alternativa` da rota, antes de
 * chegar a esta função. Administrador e super_admin têm as duas chaves e
 * continuam abrindo no Dashboard.
 */
function PainelDeEntrada(): React.ReactElement {
  const { empresa, tenantSlug, loading } = useEmpresa();
  const produto = produtoDaEmpresa(empresa, tenantSlug);

  // Enquanto carrega, o Dashboard já se vira sozinho com os próprios estados de
  // carregamento — e trocá-lo por um esqueleto aqui piscaria duas vezes.
  if (loading || produto === 'cobranca') return <Inicio />;
  if (produto === 'comercial') return <DashboardComercial />;
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
    {/* Dono único do tema (o ThemeToggle só chama `setTheme`). `themes` lista
        todos os temas — é o que ele tira do <html> ao trocar. `color-scheme`
        fica com o CSS: o do next-themes só conhece `light`/`dark`. */}
    <ThemeProvider
      attribute="class" defaultTheme="system" enableSystem
      themes={NOMES_TEMAS} enableColorScheme={false}
    >
      <AuthProvider>
        <EmpresaProvider>
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
                  nada em Vendas ou RH. Ver `PainelDeEntrada`.

                  `alternativa`: quem não tem o Dashboard da cobrança e tem o
                  Dashboard – ADM — o Assistente ADM — entra direto no painel dele,
                  em vez de ler «aba não liberada» na tela inicial. */}
              <Route path={ROUTE_PATHS.DASHBOARD} element={
                <LayoutWrapper>
                  <ProtectedRoute
                    requiredPermissao="ver_dashboard" mostrarSemAcesso
                    alternativa={{ permissao: 'ver_dashboard_adm', rota: ROUTE_PATHS.NUCLEO }}
                  >
                    <PainelDeEntrada />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* Núcleo — Dashboard – ADM + Controle de Números num item só.
                  Cada aba pede a chave da tela de onde veio; o dado continua
                  passando pela RLS do Controle de Números. */}
              <Route path={ROUTE_PATHS.NUCLEO} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} algumaPermissao={['ver_dashboard_adm', 'ver_controle_numeros']}>
                    <Nucleo />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.DASHBOARD_ADM} element={<Redirecionar para={`${ROUTE_PATHS.NUCLEO}?tab=painel`} />} />
              <Route path={ROUTE_PATHS.CONTROLE_NUMEROS} element={<Redirecionar para={`${ROUTE_PATHS.NUCLEO}?tab=celulares`} />} />
              {/* A lista de acordos, nas duas empresas desde o Mapa de Abas —
                  ver `RotaAcordos`. Era livre: qualquer cargo logado abria. */}
              <Route path={ROUTE_PATHS.ACORDOS} element={
                <LayoutWrapper><RotaAcordos /></LayoutWrapper>
              } />
              {/* O Pix Automático era a quinta aba de Acordos. */}
              <Route path={ROUTE_PATHS.PIX_AUTOMATICO} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} requiredPermissao="ver_pix_automatico">
                    <PixAutomatico />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ACORDO_NOVO} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} allowedProfiles={['operador','lider','administrador','elite','gerencia']} requiredPermissao="criar_acordos">
                    <AcordoForm />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ACORDO_EDITAR} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} allowedProfiles={['operador','lider','administrador','elite','gerencia','diretoria']} requiredPermissao="editar_acordos">
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
                  <ProtectedRoute produtos={SO_COBRANCA}><AcordoDetalhe /></ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Importar Excel — gated pela permissão importar_excel (admin bypassa) */}
              <Route path={ROUTE_PATHS.IMPORTAR_EXCEL} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} allowedProfiles={['operador','lider','administrador','elite','gerencia','diretoria']} requiredPermissao="importar_excel">
                    <ImportarExcel />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Desempenho — Painel Líder, a parte de desempenho do Painel
                  Diretoria, Ranking e Desafios. Qualquer uma das chaves abre;
                  as abas saem de `abasDoDesempenho`. */}
              <Route path={ROUTE_PATHS.DESEMPENHO} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} algumaPermissao={['ver_painel_lider', 'ver_painel_diretoria', 'ver_analitico']}>
                    <Desempenho />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.PAINEL_LIDER} element={<Redirecionar para={`${ROUTE_PATHS.DESEMPENHO}?tab=equipes`} />} />
              <Route path={ROUTE_PATHS.PAINEL_LIDER_OPERADOR} element={<Redirecionar para={`${ROUTE_PATHS.DESEMPENHO}?tab=pessoas`} />} />
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
              {/* Administração › Dados e importações e › Auditoria. */}
              <Route path={ROUTE_PATHS.ADMIN_DADOS} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} algumaPermissao={['ver_banco_dados', 'ver_painel_diretoria']}>
                    <AdminDados />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.ADMIN_AUDITORIA} element={
                <LayoutWrapper>
                  <ProtectedRoute requiredPermissao="ver_logs">
                    <AdminAuditoria />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* /admin/logs era aba de Configurações; virou Auditoria. */}
              <Route path={ROUTE_PATHS.ADMIN_LOGS} element={<Navigate to={ROUTE_PATHS.ADMIN_AUDITORIA} replace />} />
              {/* A rota solta /admin/metas saiu (1 abertura em 60 dias): a
                  tela é a aba Metas de Pessoas. A Lixeira é a aba Excluídos
                  de Acordos, e o Painel Diretoria foi repartido — a Visão
                  geral é o Início › Empresa. */}
              <Route path={ROUTE_PATHS.ADMIN_METAS} element={<Navigate to={ROUTE_PATHS.ADMIN_USUARIOS + '?tab=metas'} replace />} />
              <Route path={ROUTE_PATHS.ADMIN_LIXEIRA} element={<Redirecionar para={`${ROUTE_PATHS.ACORDOS}?tab=excluidos`} />} />
              <Route path={ROUTE_PATHS.PAINEL_DIRETORIA} element={<Navigate to={`${ROUTE_PATHS.DASHBOARD}?vista=empresa`} replace />} />

              {/* Analítico (PaguePlay + BookPlay — o gate por slug continua
                  dentro da página; a permissão decide QUEM abre) */}
              <Route path={ROUTE_PATHS.ANALITICO} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} requiredPermissao="ver_analitico">
                    <PaginaAnalitico />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Campanha Fácil [BP] — o gate por slug segue dentro da página. */}
              <Route path={ROUTE_PATHS.CAMPANHA_FACIL} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} requiredPermissao="ver_campanha_facil">
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
              {/* ── O Comercial no desenho da BookPlay (16/09/2026) ─────────
                  Quatro telas viraram abas de outra, e os endereços antigos
                  continuam valendo — um favorito ou um link colado no grupo
                  não pode virar «página não encontrada». Cada aba de destino
                  pede a mesma chave que a rota antiga pedia. */}
              <Route path={ROUTE_PATHS.VENDAS_METAS} element={<Navigate to={ROUTE_PATHS.ADMIN_USUARIOS + '?tab=metas'} replace />} />
              <Route path={ROUTE_PATHS.VENDAS_ACOMPANHAMENTO} element={<Navigate to={ROUTE_PATHS.ADMIN_USUARIOS + '?tab=acompanhamento'} replace />} />
              <Route path={ROUTE_PATHS.VENDAS_FECHAMENTO} element={<Navigate to={ROUTE_PATHS.VENDAS_PAINEL_DIRETORIA + '?tab=fechamento'} replace />} />
              {/* Importar Vendas saiu do menu em 21/09/2026: o relatório virou
                  abas do Painel Diretoria, uma por pergunta. */}
              <Route path={ROUTE_PATHS.VENDAS_IMPORTAR} element={<Navigate to={ROUTE_PATHS.VENDAS_PAINEL_DIRETORIA + '?tab=importar'} replace />} />
              <Route path={ROUTE_PATHS.VENDAS_DESAFIOS} element={<Navigate to={ROUTE_PATHS.VENDAS_PAINEL_LIDER + '?tab=desafios'} replace />} />

              {/* Vendas — a primeira tela própria do Comercial. */}

              {/* Indicações tem chave e escopo PRÓPRIOS: quem prospecta não é
                  necessariamente quem a venda pertence. Ver permissoes-escopo. */}
              <Route path={ROUTE_PATHS.VENDAS_INDICACOES} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COMERCIAL} requiredPermissao="ver_indicacoes">
                    <VendasIndicacoes />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.VENDAS} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COMERCIAL} requiredPermissao="ver_vendas">
                    <Vendas />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Fase 9 — painéis e herança.

                  As CHAVES são as mesmas da cobrança (`ver_painel_lider`,
                  `ver_painel_diretoria`, `ver_lixeira`,
                  `analitico_sub_desafios`): a pergunta que elas fazem é a
                  mesma dos dois lados, e criar chave nova exigiria encostar na
                  cadeia de `fn_permissoes_catalogo()`, que já se partiu uma
                  vez aqui. O que separa as duas operações é a barreira de
                  PRODUTO, e ela está em cada linha abaixo.

                  As listas de cargo espelham as da cobrança, para quem tem o
                  painel lá ter o de cá sem ninguém reconfigurar cargo. */}
              <Route path={ROUTE_PATHS.VENDAS_PAINEL_LIDER} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COMERCIAL}
                    allowedProfiles={['lider','administrador','elite','gerencia']}
                    requiredPermissao="ver_painel_lider">
                    <VendasPainelLider />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.VENDAS_PAINEL_DIRETORIA} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COMERCIAL}
                    allowedProfiles={['diretoria','administrador']}
                    requiredPermissao="ver_painel_diretoria">
                    <VendasPainelDiretoria />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              {/* A lixeira do Comercial é outra TABELA, não outro filtro:
                  `lixeira_vendas` e `fn_venda_restaurar`, criadas na Fase 1.
                  Restaurar exige `restaurar_vendas`, conferida na tela e na
                  RPC — quem só tem `ver_lixeira` lê e não mexe. */}
              <Route path={ROUTE_PATHS.VENDAS_LIXEIRA} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COMERCIAL} requiredPermissao="ver_lixeira">
                    <VendasLixeira />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.TICKETS} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={COBRANCA_E_COMERCIAL} requiredPermissao="ver_tickets">
                    <Tickets />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />

              {/* Fechamento do mês — Fechamento + RH Gestão. Qualquer uma das
                  chaves abre; `/rh-gestao` cai na aba de premiação, com a
                  busca junto (setor e lançamento das notificações). */}
              <Route path={ROUTE_PATHS.FECHAMENTO} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} algumaPermissao={['ver_fechamento', 'ver_rh_gestao']}>
                    <FechamentoDoMes />
                  </ProtectedRoute>
                </LayoutWrapper>
              } />
              <Route path={ROUTE_PATHS.RH_GESTAO} element={<Redirecionar para={`${ROUTE_PATHS.FECHAMENTO}?tab=premiacao`} />} />

              {/* Meus Chips — a outra ponta. O que a pessoa enxerga aqui sai do
                  escopo da aba `chips`: individual (o operador vê o que foi
                  lançado para ele) ou setor (a liderança vê o setor, e o
                  Assistente ADM acompanha a distribuição). */}
              <Route path={ROUTE_PATHS.MEUS_CHIPS} element={
                <LayoutWrapper>
                  <ProtectedRoute produtos={SO_COBRANCA} requiredPermissao="ver_meus_chips">
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
        </EmpresaProvider>
        <DevToolsAdminOnly />
      </AuthProvider>
    </ThemeProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
