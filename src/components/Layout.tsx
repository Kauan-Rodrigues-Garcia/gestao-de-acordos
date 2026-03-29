import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileText, Plus, Users, Settings,
  LogOut, Menu, X, ChevronRight, Bell,
  Shield, BarChart3, ClipboardList, Building2, Upload, Bot
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ROUTE_PATHS, PERFIL_LABELS, PERFIL_COLORS } from '@/lib/index';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  label: string;
  icon: React.ElementType;
  to: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',     icon: LayoutDashboard, to: ROUTE_PATHS.DASHBOARD,           roles: ['operador','lider','administrador'] },
  { label: 'Acordos',       icon: FileText,        to: ROUTE_PATHS.ACORDOS,             roles: ['operador','lider','administrador'] },
  { label: 'Novo Acordo',   icon: Plus,            to: ROUTE_PATHS.ACORDO_NOVO,         roles: ['operador','lider','administrador'] },
  { label: 'Painel Líder',  icon: BarChart3,       to: ROUTE_PATHS.PAINEL_LIDER,        roles: ['lider','administrador'] },
  { label: 'Usuários',      icon: Users,           to: ROUTE_PATHS.ADMIN_USUARIOS,      roles: ['lider','administrador'] },
  { label: 'Setores',       icon: Building2,       to: ROUTE_PATHS.ADMIN_SETORES,       roles: ['administrador'] },
  { label: 'Configurações', icon: Settings,        to: ROUTE_PATHS.ADMIN_CONFIGURACOES, roles: ['administrador'] },
  { label: 'IA',            icon: Bot,             to: ROUTE_PATHS.ADMIN_IA,            roles: ['administrador'] },
  { label: 'Logs',          icon: ClipboardList,   to: ROUTE_PATHS.ADMIN_LOGS,          roles: ['administrador'] },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { perfil, signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const userRole = perfil?.perfil ?? 'operador';
  const navItems = NAV_ITEMS.filter(item => !item.roles || item.roles.includes(userRole));
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
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <Shield className="w-4 h-4 text-primary-foreground" />
        </div>
        <AnimatePresence>
          {(sidebarOpen || mobileOpen) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden">
              <p className="font-bold text-sm text-sidebar-foreground leading-none">Gestão de Acordos</p>
              <p className="text-xs text-sidebar-foreground/50 mt-0.5">Gestão de Acordos</p>
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
        {(sidebarOpen || mobileOpen) && (
          <NavLink
            to="/acordos/importar"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              isActive
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
            )}
          >
            <Upload className="w-4 h-4 flex-shrink-0" />
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 truncate">
              Importar Excel
            </motion.span>
          </NavLink>
        )}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* User info */}
      <div className="p-3">
        <div className={cn('flex items-center gap-3 p-2 rounded-lg', (sidebarOpen || mobileOpen) ? 'bg-sidebar-accent' : 'justify-center')}>
          <Avatar className="w-8 h-8 flex-shrink-0">
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
            onClick={() => { setSidebarOpen(!sidebarOpen); setMobileOpen(!mobileOpen); }}>
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="w-8 h-8">
              <Bell className="w-4 h-4" />
            </Button>

            {/* Perfil no header */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-border">
              <Avatar className="w-7 h-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold leading-none text-foreground">{perfil?.nome ?? 'Carregando...'}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <span className={cn('px-1.5 py-0 rounded text-[10px] font-medium border', PERFIL_COLORS[userRole])}>
                    {PERFIL_LABELS[userRole]}
                  </span>
                  {nomeSetor && <span>· {nomeSetor}</span>}
                </p>
              </div>
            </div>

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
