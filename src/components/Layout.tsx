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
  BarChart3, ClipboardList, Building2, Upload, Bot, Users2, Target,
  Camera, Loader2, Trash2, TrendingUp, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { ROUTE_PATHS, PERFIL_LABELS, PERFIL_COLORS, isPaguePlay, isPerfilLider, isPerfilAdmin } from '@/lib/index';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  label: string;
  icon: React.ElementType;
  to: string;
  roles?: string[];
  /** Se true, o item fica oculto quando o tenant for PaguePay */
  hiddenForPaguePay?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',     icon: LayoutDashboard, to: ROUTE_PATHS.DASHBOARD,           roles: ['operador','lider','administrador','elite','gerencia','diretoria'] },
  { label: 'Acordos',       icon: FileText,        to: ROUTE_PATHS.ACORDOS,             roles: ['operador','lider','administrador','elite','gerencia'], hiddenForPaguePay: true },
  { label: 'Novo Acordo',   icon: Plus,            to: ROUTE_PATHS.ACORDO_NOVO,         roles: ['operador','lider','administrador','elite','gerencia'] },
  { label: 'Painel Líder',  icon: BarChart3,       to: ROUTE_PATHS.PAINEL_LIDER,        roles: ['lider','administrador','elite','gerencia'] },
  { label: 'Painel Diretoria', icon: TrendingUp,   to: ROUTE_PATHS.PAINEL_DIRETORIA,    roles: ['diretoria','administrador'] },
  { label: 'Usuários',      icon: Users,           to: ROUTE_PATHS.ADMIN_USUARIOS,      roles: ['lider','administrador','elite','gerencia'] },
  { label: 'Setores',       icon: Building2,       to: ROUTE_PATHS.ADMIN_SETORES,       roles: ['administrador'] },
  { label: 'Equipes',       icon: Users2,          to: '/admin/equipes',                roles: ['administrador','lider','elite','gerencia'] },
  { label: 'Metas',         icon: Target,          to: '/admin/metas',                  roles: ['administrador','lider','elite','gerencia'] },
  { label: 'Configurações', icon: Settings,        to: ROUTE_PATHS.ADMIN_CONFIGURACOES, roles: ['administrador'] },
  { label: 'IA',            icon: Bot,             to: ROUTE_PATHS.ADMIN_IA,            roles: ['administrador'] },
  { label: 'Permissões',    icon: ShieldCheck,     to: ROUTE_PATHS.ADMIN_CARGOS,        roles: ['administrador'] },
  { label: 'Lixeira',       icon: Trash2,          to: '/admin/lixeira',                roles: ['administrador','lider','operador','elite','gerencia','diretoria'] },
  { label: 'Logs',          icon: ClipboardList,   to: ROUTE_PATHS.ADMIN_LOGS,          roles: ['administrador'] },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { perfil, signOut } = useAuth();
  const { empresa, branding, tenantSlug } = useEmpresa();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>((perfil as any)?.foto_url ?? null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [deletandoFoto, setDeletandoFoto] = useState(false);
  const [perfilPopoverOpen, setPerfilPopoverOpen] = useState(false);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  // ── Realtime: escuta mudanças de foto_url na tabela perfis ──────────────
  // Garante que a foto atualiza em tempo real para TODOS os usuários conectados
  useEffect(() => {
    if (!perfil?.id) return;
    // Sincronizar foto inicial do banco
    supabase.from('perfis').select('foto_url').eq('id', perfil.id).single().then(({ data }) => {
      if (data?.foto_url) setFotoUrl(data.foto_url as string);
    });
    // Subscription para mudanças em tempo real
    const channel = supabase
      .channel(`perfil-foto-${perfil.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'perfis', filter: `id=eq.${perfil.id}` },
        (payload) => {
          const newFoto = (payload.new as any)?.foto_url ?? null;
          setFotoUrl(newFoto ? newFoto + '?t=' + Date.now() : null);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
    } catch (err: any) {
      toast.error('Erro ao enviar foto: ' + (err?.message ?? err));
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
    } catch (err: any) {
      toast.error('Erro ao remover foto: ' + (err?.message ?? err));
    } finally {
      setDeletandoFoto(false);
    }
  }

  const isPP = isPaguePlay(tenantSlug);
  const userRole = perfil?.perfil ?? 'operador';

  // Filtra por role E por visibilidade PaguePay
  const navItems = NAV_ITEMS.filter(item => {
    if (item.roles && !item.roles.includes(userRole) && userRole !== 'super_admin') return false;
    if (item.hiddenForPaguePay && isPP) return false;
    return true;
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
        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-background flex items-center justify-center">
          <img src="/images/Logo_Clebs.png" alt="Logo" className="w-8 h-8 object-contain" />
        </div>
        <AnimatePresence>
          {(sidebarOpen || mobileOpen) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden">
              <p className="font-bold text-sm text-sidebar-foreground leading-none">{branding.appName}</p>
              <p className="text-xs text-sidebar-foreground/50 mt-0.5">{empresa?.nome ?? branding.shortName}</p>
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

        {/* Importar Excel */}
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
      </nav>

      <Separator className="bg-sidebar-border" />

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
                setSidebarOpen(prev => !prev);
              } else {
                setMobileOpen(prev => !prev);
              }
            }}>
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
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
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        await handleFotoUpload(file);
                        setPerfilPopoverOpen(false);
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
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-card border border-border rounded-full items-center justify-center shadow-sm z-10 hover:bg-accent transition-colors"
          style={{ left: sidebarOpen ? '228px' : '52px' }}
        >
          <ChevronRight className={cn('w-3 h-3 transition-transform', sidebarOpen && 'rotate-180')} />
        </button>

        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
