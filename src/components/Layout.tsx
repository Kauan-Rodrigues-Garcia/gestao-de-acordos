/**
 * src/components/Layout.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Layout principal da aplicação com sidebar de navegação responsiva.
 *
 * ## Funcionalidades
 * - Sidebar colapsável (desktop) / drawer (mobile)
 * - Navegação adaptativa por perfil (RBAC): exibe apenas os itens permitidos
 * - Photo de perfil em tempo real via Supabase Storage (canal Realtime)
 * - Multi-tenant: adapta logo e tema conforme `tenantSlug`
 * - Dark/Light mode via `ThemeToggle`
 * - Indicador de usuários online via `usePresence`
 *
 * @param children - Conteúdo da página atual
 *
 * @example
 * ```tsx
 * // Uso típico (já configurado em App.tsx via LayoutWrapper)
 * <Layout>
 *   <Dashboard />
 * </Layout>
 * ```
 */
import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileText, Plus, Users, Settings,
  LogOut, Menu, X, ChevronRight,
  BarChart3, Upload, Target,
  Camera, Loader2, Trash2, TrendingUp, Bell, MessageCircle, BarChart2, KeyRound,
  LifeBuoy, Megaphone, MessageSquarePlus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useOuvidoriaAcesso } from '@/hooks/useOuvidoriaAcesso';
import { ROUTE_PATHS, PERFIL_LABELS, PERFIL_COLORS } from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/lib/supabase';
import { assinarTabela } from '@/lib/realtime';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { HelpDrawer } from './HelpDrawer';
import { OnboardingTour, ONBOARDING_STORAGE_KEY } from './OnboardingTour';
import { PetDespedida } from './pet/PetDespedida';
import { PainelDesempenhoDiario } from './PainelDesempenhoDiario';
import { NotificacaoToast } from './NotificacaoToast';
import { useNotificacoes } from '@/providers/NotificacoesProvider';
import { podeAcessarAbaWpp } from '@/pages/SolicitacoesWhatsapp/permissoes';
// O overlay continua no Layout: a comemoração explode em QUALQUER página, não
// só onde ela é criada. Só a aba de criação mudou de lugar.
import { ComemoracaoOverlay } from './comemoracao/ComemoracaoOverlay';
import { useTermoUso } from '@/hooks/useTermoUso';
import { useMarcarAtrasados } from '@/hooks/useMarcarAtrasados';
import { ChatplayOnboardingModal } from './ChatplayOnboardingModal';
import { ModalRecortarFoto } from './ModalRecortarFoto';
import { TrocarSenhaModal } from './TrocarSenhaModal';

interface NavItem {
  label: string;
  icon: React.ElementType;
  to: string;
  roles?: string[];
  /** Se true, o item fica oculto quando o tenant for PaguePay */
  hiddenForPaguePay?: boolean;
  /** Se true, o item fica oculto quando o tenant for BookPlay */
  hiddenForBookplay?: boolean;
  /** Chave de `cargos_permissoes` que precisa estar true (admin bypassa) */
  permissaoKey?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',        icon: LayoutDashboard, to: ROUTE_PATHS.DASHBOARD,           roles: ['operador','lider','administrador','elite','gerencia','diretoria','ouvidoria'] },
  // Visibilidade especial (cargo ouvidoria/admin OU acesso concedido) — ver filtro abaixo
  { label: 'Ouvidoria',        icon: LifeBuoy,        to: ROUTE_PATHS.OUVIDORIA },
  // Visibilidade especial (PaguePlay + gate de rollout) — ver filtro abaixo
  { label: 'Solicitar Atendimento', icon: MessageSquarePlus, to: ROUTE_PATHS.SOLICITACOES_WHATSAPP },
  // Comemorações virou aba dentro de Usuários (BookPlay e PaguePlay) — sem
  // item de menu. A rota antiga redireciona para lá.
  { label: 'Acordos',          icon: FileText,        to: ROUTE_PATHS.ACORDOS,             roles: ['operador','lider','administrador','elite','gerencia'], hiddenForPaguePay: true },
  { label: 'Novo Acordo',      icon: Plus,            to: ROUTE_PATHS.ACORDO_NOVO,         roles: ['operador','lider','administrador','elite','gerencia'], hiddenForPaguePay: true, permissaoKey: 'criar_acordos' },
  { label: 'Painel Líder',     icon: BarChart3,       to: ROUTE_PATHS.PAINEL_LIDER,        roles: ['lider','administrador','elite','gerencia'], permissaoKey: 'ver_painel_lider' },
  { label: 'Painel Diretoria', icon: TrendingUp,      to: ROUTE_PATHS.PAINEL_DIRETORIA,    roles: ['diretoria','administrador'] },
  { label: 'Usuários',         icon: Users,           to: ROUTE_PATHS.ADMIN_USUARIOS,      roles: ['lider','administrador','elite','gerencia'], permissaoKey: 'ver_usuarios' },
  // Metas virou aba dentro de Usuários (BookPlay e PaguePlay) — esconde o menu standalone.
  { label: 'Metas',            icon: Target,          to: '/admin/metas',                  roles: ['administrador','lider','elite','gerencia'], permissaoKey: 'ver_metas', hiddenForBookplay: true, hiddenForPaguePay: true },
  { label: 'Configurações',    icon: Settings,        to: ROUTE_PATHS.ADMIN_CONFIGURACOES, roles: ['administrador'], permissaoKey: 'ver_configuracoes' },
  { label: 'Lixeira',          icon: Trash2,          to: '/admin/lixeira',                roles: ['administrador','lider','operador','elite','gerencia','diretoria'], permissaoKey: 'ver_lixeira' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { perfil, signOut } = useAuth();
  const { empresa, branding } = useEmpresa();
  const tenant = useTenant();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [painelDiaAberto, setPainelDiaAberto] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>((perfil as { foto_url?: string | null } | null)?.foto_url ?? null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [deletandoFoto, setDeletandoFoto] = useState(false);
  // Foto escolhida no input aguardando recorte no modal
  const [fotoParaRecorte, setFotoParaRecorte] = useState<File | null>(null);
  const [perfilPopoverOpen, setPerfilPopoverOpen] = useState(false);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  // ── Auto-hide / auto-show do sidebar ────────────────────────────────────────
  // Comportamento automático é opcional: checkbox discreta no rodapé do
  // sidebar, persistida por navegador. Desligada, o sidebar só muda pelo botão.
  const [autoRecolher, setAutoRecolher] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar-auto-recolher') !== '0'; } catch { return true; }
  });
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoShowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearAutoTimers() {
    if (autoHideTimer.current) { clearTimeout(autoHideTimer.current); autoHideTimer.current = null; }
    if (autoShowTimer.current) { clearTimeout(autoShowTimer.current); autoShowTimer.current = null; }
  }

  function toggleAutoRecolher(ativo: boolean) {
    setAutoRecolher(ativo);
    if (!ativo) clearAutoTimers();
    try { localStorage.setItem('sidebar-auto-recolher', ativo ? '1' : '0'); } catch { /* noop */ }
  }

  function handleSidebarMouseEnter() {
    if (!autoRecolher) return;
    if (autoHideTimer.current) { clearTimeout(autoHideTimer.current); autoHideTimer.current = null; }
    if (!sidebarOpen) {
      autoShowTimer.current = setTimeout(() => setSidebarOpen(true), 1000);
    }
  }

  function handleSidebarMouseLeave() {
    if (!autoRecolher) return;
    if (autoShowTimer.current) { clearTimeout(autoShowTimer.current); autoShowTimer.current = null; }
    if (sidebarOpen) {
      autoHideTimer.current = setTimeout(() => setSidebarOpen(false), 3000);
    }
  }

  useEffect(() => () => clearAutoTimers(), []);

  // ── Realtime: escuta mudanças de foto_url na tabela perfis ──────────────
  // Garante que a foto atualiza em tempo real para TODOS os usuários conectados
  useEffect(() => {
    if (!perfil?.id) return;
    const perfilId = perfil.id;

    const sincronizar = () => {
      void supabase.from('perfis').select('foto_url').eq('id', perfilId).single()
        .then(({ data }) => {
          if (data?.foto_url) setFotoUrl(data.foto_url as string);
        });
    };

    sincronizar();

    // Canal compartilhado: dedup por tópico + reconexão automática.
    return assinarTabela(
      {
        topico:  `perfil-foto-${perfilId}`,
        escutas: [{ tabela: 'perfis', evento: 'UPDATE', filtro: `id=eq.${perfilId}` }],
      },
      {
        onEvento: (payload) => {
          const novaFoto = (payload.new as { foto_url?: string | null } | null)?.foto_url ?? null;
          setFotoUrl(novaFoto ? novaFoto + '?t=' + Date.now() : null);
        },
        onReconectado: sincronizar,
      },
    );
  }, [perfil?.id]);

  async function handleFotoUpload(file: File) {
    if (!perfil?.id) return;
    if (!file.type.startsWith('image/')) { toast.error('Arquivo inválido. Envie uma imagem.'); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error('Imagem muito grande. Máximo 3 MB.'); return; }
    setUploadingFoto(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `avatars/${perfil.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from('perfis').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('perfis').getPublicUrl(path);
      const urlFinal = publicUrl + '?t=' + Date.now();
      const { error: dbErr } = await supabase.from('perfis').update({ foto_url: urlFinal }).eq('id', perfil.id);
      if (dbErr) throw dbErr;
      // O realtime subscription vai atualizar fotoUrl automaticamente
      toast.success('Foto de perfil atualizada!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Erro ao enviar foto: ' + msg);
    } finally {
      setUploadingFoto(false);
    }
  }

  async function handleDeletarFoto() {
    if (!perfil?.id || !fotoUrl) return;
    setDeletandoFoto(true);
    try {
      // Remover do banco
      const { error: dbErr } = await supabase.from('perfis').update({ foto_url: null }).eq('id', perfil.id);
      if (dbErr) throw dbErr;
      // Tentar remover do storage (best-effort)
      const ext = fotoUrl.split('?')[0].split('.').pop() ?? 'jpg';
      await supabase.storage.from('perfis').remove([`avatars/${perfil.id}.${ext}`]);
      setFotoUrl(null);
      toast.success('Foto removida!');
      setPerfilPopoverOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Erro ao remover foto: ' + msg);
    } finally {
      setDeletandoFoto(false);
    }
  }

  const isPP = tenant.isPaguePlay || empresa?.slug === 'pagueplay';
  const userRole = perfil?.perfil ?? 'operador';
  const { temPermissao, loading: permLoading } = useCargoPermissoes();
  const ouvidoriaAcesso = useOuvidoriaAcesso();
  // Mesmo estado que o painel (ChatNotificacoes) usa — antes o header tinha um
  // canal e um SELECT count próprios, que podiam divergir da lista por instantes.
  const { naoLidas, animarBadge } = useNotificacoes();
  const { precisaAceitar, loading: termoLoading } = useTermoUso();
  useMarcarAtrasados();

  // ── Lembrete de votação do nome do mascote — só depois de termos + tour ─────
  // (tourPronto começa true se o tour já foi concluído em sessão anterior;
  //  senão vira true quando o OnboardingTour chamar onFinished agora)
  const [tourPronto, setTourPronto] = useState(false);
  useEffect(() => {
    if (perfil?.id && localStorage.getItem(ONBOARDING_STORAGE_KEY(perfil.id))) {
      setTourPronto(true);
    }
  }, [perfil?.id]);
  const avisoPetPronto = !termoLoading && !precisaAceitar && tourPronto;

  // (Favicon por empresa é aplicado no root em TenantThemeApplier — vale para
  //  todas as páginas, inclusive a de login.)

  // ── Chatplay modal (PaguePlay only) ─────────────────────────────────────────
  const [chatplayOnboardingOpen, setChatplayOnboardingOpen] = useState(false);

  // ── Troca de senha 1x (botão de chave) ──────────────────────────────────────
  const [senhaModalOpen, setSenhaModalOpen] = useState(false);
  const [senhaTrocadaLocal, setSenhaTrocadaLocal] = useState(false);
  const mostrarBotaoSenha = !!perfil?.id && !perfil?.senha_alterada && !senhaTrocadaLocal;

  // Filtra por role, visibilidade PaguePay e permissões configuráveis.
  //
  // Itens COM permissaoKey são controlados exclusivamente pela permissão:
  //   - admin/super_admin sempre veem (temPermissao retorna true)
  //   - outros cargos: visível se e somente se a permissão estiver ativa no painel
  //   Isso mantém a nav consistente com o ProtectedRoute da rota correspondente.
  //
  // Itens SEM permissaoKey são controlados pelo cargo (roles), como antes.
  const navItems = NAV_ITEMS.filter(item => {
    if (item.hiddenForPaguePay && isPP) return false;
    if (item.hiddenForBookplay && tenant.slug === 'bookplay') return false;

    // Ouvidoria: PaguePlay only; visível para cargo ouvidoria, admins e
    // usuários com acesso concedido em ouvidoria_acessos.
    if (item.to === ROUTE_PATHS.OUVIDORIA) {
      return isPP && ouvidoriaAcesso.podeVer;
    }

    // Solicitar Atendimento: PaguePlay. Aberta a todos os cargos — o operador
    // enxerga só os pedidos dele, e quem garante isso é a RLS, não este filtro.
    if (item.to === ROUTE_PATHS.SOLICITACOES_WHATSAPP) {
      return isPP && podeAcessarAbaWpp(userRole);
    }

    if (item.permissaoKey) {
      return !permLoading && temPermissao(item.permissaoKey);
    }

    return !item.roles || item.roles.includes(userRole) || userRole === 'super_admin';
  });

  const initials = perfil?.nome?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
  const nomeSetor = (perfil?.setores as { nome?: string } | undefined)?.nome || null;

  async function handleSignOut() {
    await signOut();
    navigate(ROUTE_PATHS.LOGIN);
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
          {isPP
            ? <img src="/logo-pagueplay.png" alt="Logo PaguePLAY" className="w-8 h-8 object-contain" />
            : <img src="/logo-bookplay.png" alt="Logo BookPlay" className="w-8 h-8 object-contain" />
          }
        </div>
        <AnimatePresence>
          {(sidebarOpen || mobileOpen) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden">
              <p className="font-bold text-sm text-sidebar-foreground leading-none">{branding.appName}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isActive
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <AnimatePresence>
              {(sidebarOpen || mobileOpen) && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 truncate">
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        ))}

        {/* Analítico — PaguePlay e BookPlay, verificado direto no slug da empresa */}
        {(empresa?.slug === 'pagueplay' || empresa?.slug === 'bookplay') && (
          <NavLink
            to={ROUTE_PATHS.ANALITICO}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isActive
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
            )}
          >
            <BarChart2 className="w-4 h-4 flex-shrink-0" />
            <AnimatePresence>
              {(sidebarOpen || mobileOpen) && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 truncate">
                  Analítico
                </motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        )}

        {/* Campanha Fácil — BookPlay only, e apenas para cargos acima de operador */}
        {empresa?.slug === 'bookplay' && userRole !== 'operador' && (
          <NavLink
            to={ROUTE_PATHS.CAMPANHA_FACIL}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isActive
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
            )}
          >
            <Megaphone className="w-4 h-4 flex-shrink-0" />
            <AnimatePresence>
              {(sidebarOpen || mobileOpen) && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 truncate">
                  Campanha Fácil
                </motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        )}

        {/* Importar Excel — gated pela permissão importar_excel (admin bypassa) */}
        {!permLoading && temPermissao('importar_excel') && (
        <NavLink
          to="/acordos/importar"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) => cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
            isActive
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
          )}
        >
          <Upload className="w-4 h-4 flex-shrink-0" />
          <AnimatePresence>
            {(sidebarOpen || mobileOpen) && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 truncate">
                Importar Excel
              </motion.span>
            )}
          </AnimatePresence>
        </NavLink>
        )}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Desempenho Diário (PaguePLAY only) */}
      {isPP && (
        <div className="px-2 pt-2">
          <button
            onClick={() => setPainelDiaAberto(v => !v)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              painelDiaAberto
                ? 'bg-violet-500/15 text-violet-500'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
            )}
            title="Desempenho do Dia"
          >
            <BarChart2 className="w-4 h-4 flex-shrink-0" />
            <AnimatePresence>
              {(sidebarOpen || mobileOpen) && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 truncate text-left"
                >
                  📊 Desempenho do Dia
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      )}

      {/* Recolhimento automático do sidebar (desktop) — discreto */}
      {sidebarOpen && (
        <label className="hidden md:flex items-center gap-2 px-5 pt-2 cursor-pointer select-none text-[11px] text-sidebar-foreground/45 hover:text-sidebar-foreground/75 transition-colors">
          <input
            type="checkbox"
            checked={autoRecolher}
            onChange={e => toggleAutoRecolher(e.target.checked)}
            className="h-3 w-3 accent-primary cursor-pointer"
          />
          Recolher automaticamente
        </label>
      )}

      {/* User info */}
      <div className="p-3">
        <div className={cn('flex items-center gap-3 p-2 rounded-lg', (sidebarOpen || mobileOpen) ? 'bg-sidebar-accent' : 'justify-center')}>
          <Avatar className="w-8 h-8 flex-shrink-0">
            {fotoUrl && <AvatarImage src={fotoUrl} alt={perfil?.nome ?? ''} className="object-cover" />}
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
          </Avatar>
          <AnimatePresence>
            {(sidebarOpen || mobileOpen) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-sidebar-foreground truncate">{perfil?.nome ?? '...'}</p>
                <p className="text-xs text-sidebar-foreground/60 flex items-center gap-1">
                  <span className={cn('inline-block px-1.5 py-0 rounded text-[10px] font-medium', PERFIL_COLORS[userRole])}>
                    {PERFIL_LABELS[userRole]}
                  </span>
                  {nomeSetor && <span className="truncate">· {nomeSetor}</span>}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          {(sidebarOpen || mobileOpen) && (
            <Button variant="ghost" size="icon" className="w-7 h-7 text-sidebar-foreground/50 hover:text-destructive flex-shrink-0" onClick={handleSignOut}>
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: sidebarOpen ? 240 : 64 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="hidden md:flex flex-col bg-sidebar border-r border-sidebar-border overflow-hidden flex-shrink-0"
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >
        <SidebarContent />
      </motion.aside>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-sidebar border-r border-sidebar-border z-50 md:hidden">
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 flex-shrink-0">
          <Button variant="ghost" size="icon" className="w-8 h-8"
            onClick={() => {
              if (window.innerWidth >= 768) {
                clearAutoTimers();
                setSidebarOpen(prev => !prev);
              } else {
                setMobileOpen(prev => !prev);
              }
            }}>
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {/* Chatplay config — PaguePlay only */}
            {isPP && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'w-8 h-8 relative',
                  perfil?.tampermonkey_configured
                    ? 'text-violet-500 hover:text-violet-600'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title={perfil?.tampermonkey_configured ? 'Chatplay configurado' : 'Configurar Chatplay'}
                onClick={() => setChatplayOnboardingOpen(true)}
              >
                <MessageCircle className="w-4 h-4" />
                {!perfil?.tampermonkey_configured && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-violet-500" />
                )}
              </Button>
            )}
            {/* Trocar senha 1x — some após a primeira troca */}
            {mostrarBotaoSenha && (
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 relative text-amber-500 hover:text-amber-600"
                title="Alterar minha senha"
                aria-label="Alterar minha senha"
                onClick={() => setSenhaModalOpen(true)}
              >
                <KeyRound className="w-4 h-4" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" />
              </Button>
            )}
            {/* Badge de notificações — indica novas sem abrir o painel */}
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-foreground relative"
              title={naoLidas > 0 ? `${naoLidas} notificação${naoLidas > 1 ? 'ões' : ''} não lida${naoLidas > 1 ? 's' : ''}` : 'Notificações'}
              aria-label={`Notificações${naoLidas > 0 ? ` — ${naoLidas} não lida${naoLidas > 1 ? 's' : ''}` : ''}`}
              onClick={() => document.querySelector<HTMLButtonElement>('[data-notif-trigger]')?.click()}
            >
              <Bell className="w-4 h-4" />
              {naoLidas > 0 && (
                <span
                  className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-[9px] font-bold text-white flex items-center justify-center leading-none transition-transform ${animarBadge ? 'scale-125' : 'scale-100'}`}
                >
                  {naoLidas > 99 ? '99+' : naoLidas}
                </span>
              )}
            </Button>
            <HelpDrawer />
            <ThemeToggle />
            {/* Perfil no header — clicável para upload de foto */}
            <Popover open={perfilPopoverOpen} onOpenChange={setPerfilPopoverOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2.5 pl-2 border-l border-border hover:opacity-80 transition-opacity cursor-pointer" title="Clique para alterar foto de perfil">
                  <div className="relative">
                    <Avatar className="w-7 h-7">
                      {fotoUrl && <AvatarImage src={fotoUrl} alt={perfil?.nome ?? ''} className="object-cover" />}
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-background border border-border rounded-full flex items-center justify-center">
                      <Camera className="w-2 h-2 text-muted-foreground" />
                    </span>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-xs font-semibold leading-none text-foreground">{perfil?.nome ?? 'Carregando...'}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <span className={cn('px-1.5 py-0 rounded text-[10px] font-medium border', PERFIL_COLORS[userRole])}>
                        {PERFIL_LABELS[userRole]}
                      </span>
                      {nomeSetor && <span>· {nomeSetor}</span>}
                    </p>
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4" align="end">
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Foto de perfil</p>
                  {/* Preview */}
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="w-14 h-14">
                        {fotoUrl && <AvatarImage src={fotoUrl} alt={perfil?.nome ?? ''} className="object-cover" />}
                        <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">{initials}</AvatarFallback>
                      </Avatar>
                    </div>
                    <div>
                      <p className="text-xs font-medium">{perfil?.nome}</p>
                      <p className="text-[11px] text-muted-foreground">{perfil?.email}</p>
                    </div>
                  </div>
                  {/* Upload */}
                  <input
                    ref={inputFotoRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (!file.type.startsWith('image/')) {
                          toast.error('Arquivo inválido. Envie uma imagem.');
                        } else {
                          // Abre o modal de recorte antes do upload
                          setFotoParaRecorte(file);
                        }
                      }
                      e.target.value = '';
                    }}
                  />
                  <Button
                    className="w-full gap-2"
                    size="sm"
                    disabled={uploadingFoto}
                    onClick={() => inputFotoRef.current?.click()}
                  >
                    {uploadingFoto ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</>
                    ) : (
                      <><Camera className="w-3.5 h-3.5" /> {fotoUrl ? 'Alterar foto' : 'Adicionar foto'}</>
                    )}
                  </Button>
                  {fotoUrl && (
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      size="sm"
                      disabled={deletandoFoto}
                      onClick={handleDeletarFoto}
                    >
                      {deletandoFoto ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Removendo...</>
                      ) : (
                        <><Trash2 className="w-3.5 h-3.5" /> Excluir foto</>
                      )}
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground text-center">
                    JPG, PNG ou GIF · Máx. 3 MB
                  </p>
                </div>
              </PopoverContent>
            </Popover>

            <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Expand toggle */}
        <button
          onClick={() => { clearAutoTimers(); setSidebarOpen(!sidebarOpen); }}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-card border border-border rounded-full items-center justify-center shadow-sm z-10 hover:bg-accent transition-colors"
          style={{ left: sidebarOpen ? '228px' : '52px' }}
        >
          <ChevronRight className={cn('w-3 h-3 transition-transform', sidebarOpen && 'rotate-180')} />
        </button>

        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
        <OnboardingTour
          precisaAceitar={precisaAceitar}
          termoLoading={termoLoading}
          onFinished={() => setTourPronto(true)}
        />
      </div>

      {isPP && (
        <PainelDesempenhoDiario
          aberto={painelDiaAberto}
          onClose={() => setPainelDiaAberto(false)}
        />
      )}

      {isPP && (
        <ChatplayOnboardingModal
          open={chatplayOnboardingOpen}
          onClose={() => setChatplayOnboardingOpen(false)}
          onConfirmed={() => setChatplayOnboardingOpen(false)}
        />
      )}

      {/* Aviso rápido de notificação nova — um card por vez, canto superior */}
      <NotificacaoToast />

      {/* Comemoração de meta — explode no topo, em qualquer página, para quem
          for do setor dos homenageados. Não bloqueia cliques. */}
      <ComemoracaoOverlay />

      {/* Despedida do mascote — só abre pós termos + tour, e só para quem já
          convivia com ele (perfis.pet_despedida = 'pendente'). */}
      <PetDespedida pronto={avisoPetPronto} />

      {/* Troca de senha 1x */}
      {perfil?.id && (
        <TrocarSenhaModal
          open={senhaModalOpen}
          onOpenChange={setSenhaModalOpen}
          perfilId={perfil.id}
          onTrocada={() => setSenhaTrocadaLocal(true)}
        />
      )}

      {/* Recorte da foto de perfil antes do upload */}
      <ModalRecortarFoto
        arquivo={fotoParaRecorte}
        onCancelar={() => setFotoParaRecorte(null)}
        onConfirmar={async (foto) => {
          setFotoParaRecorte(null);
          await handleFotoUpload(foto);
          setPerfilPopoverOpen(false);
        }}
      />
    </div>
  );
}
