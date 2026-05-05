import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield, Eye, EyeOff, Lock, User, AlertCircle,
  CheckCircle2, BarChart3, Users, Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { ROUTE_PATHS } from '@/lib/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FEATURES = [
  { icon: BarChart3, label: 'Dashboard com métricas em tempo real' },
  { icon: Zap,       label: 'Atualizações instantâneas via Realtime' },
  { icon: Users,     label: 'Gestão por equipes e setores' },
  { icon: CheckCircle2, label: 'Controle completo de acordos e parcelas' },
];

export default function Login() {
  const { signIn, authError } = useAuth();
  const { branding, empresa, error: tenantError } = useEmpresa();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier || !password) { setError('Preencha todos os campos.'); return; }
    setLoading(true);
    setError('');
    const { error: err } = await signIn(identifier, password);
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      navigate(ROUTE_PATHS.DASHBOARD);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Painel esquerdo — branding (apenas desktop) ─────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 flex-col justify-between bg-primary p-12 relative overflow-hidden">
        {/* Decoração de fundo */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/5 rounded-full" />
          <div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] bg-white/5 rounded-full translate-x-1/3 translate-y-1/3" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-white/[0.03] rounded-full" />
        </div>

        {/* Logo + nome */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">{branding.appName}</span>
        </div>

        {/* Tagline + features */}
        <div className="relative z-10 space-y-10">
          <div>
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
              Gestão de acordos<br />
              <span className="text-white/70">inteligente e eficiente</span>
            </h2>
            <p className="mt-4 text-white/60 text-sm leading-relaxed max-w-sm">
              {branding.tagline}
            </p>
          </div>

          <ul className="space-y-4">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-white/80" />
                </div>
                <span className="text-white/80 text-sm">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Rodapé */}
        <p className="relative z-10 text-white/40 text-xs">
          {branding.appName} © {new Date().getFullYear()} · Uso interno
        </p>
      </div>

      {/* ── Painel direito — formulário ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 35 }}
          className="w-full max-w-sm"
        >
          {/* Logo mobile */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
              <Shield className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-base text-foreground">{branding.appName}</span>
          </div>

          {/* Cabeçalho */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">{branding.loginTitle}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {empresa?.nome ?? branding.loginSubtitle}
            </p>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="identifier" className="text-sm font-medium">Usuário</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="identifier"
                  type="text"
                  placeholder="seu_usuario"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  className="pl-9"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-9 pr-9"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {(tenantError || authError || error) && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3"
              >
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive">{tenantError || error || authError}</p>
              </motion.div>
            )}

            <Button type="submit" className="w-full font-semibold h-10" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Entrando...
                </span>
              ) : 'Entrar'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-center text-muted-foreground">
              Acesso restrito. Solicite seu cadastro ao administrador.
            </p>
            <p className="text-xs text-center text-muted-foreground/60 mt-2">
              {branding.supportText}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
