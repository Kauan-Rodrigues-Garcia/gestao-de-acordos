/**
 * Registro.tsx — Cadastro simplificado de novo usuário
 *
 * O usuário preenche apenas:
 *   - Nome completo
 *   - E-mail (que será o login)
 *   - Senha
 *
 * O administrador poderá definir o setor e perfil depois via AdminUsuarios.
 *
 * Não requer confirmação de e-mail (depende da configuração do Supabase).
 * Valida login único (e-mail) antes de tentar criar.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Eye, EyeOff, Lock, Mail, User, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ROUTE_PATHS } from '@/lib/index';
import { buildAuthRedirectUrl } from '@/lib/tenant';
import { useEmpresa } from '@/hooks/useEmpresa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function Registro() {
  const navigate = useNavigate();
  const { empresa, branding, loading: tenantLoading, error: tenantError, tenantSlug } = useEmpresa();

  const [nome,     setNome]     = useState('');
  const [email,    setEmail]    = useState('');
  const [senha,    setSenha]    = useState('');
  const [confirma, setConfirma] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [erro,     setErro]     = useState('');
  const [sucesso,  setSucesso]  = useState(false);

  function validar(): string | null {
    if (!nome.trim())       return 'Informe seu nome completo.';
    if (nome.trim().length < 3) return 'Nome deve ter pelo menos 3 caracteres.';
    if (!email.trim())      return 'Informe seu e-mail.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail inválido.';
    if (!senha)             return 'Informe uma senha.';
    if (senha.length < 6)   return 'A senha deve ter pelo menos 6 caracteres.';
    if (senha !== confirma) return 'As senhas não coincidem.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantSlug) { setErro('Não foi possível identificar a empresa deste site. Entre em contato com o suporte.'); return; }
    const msg = validar();
    if (msg) { setErro(msg); return; }
    const authRedirectUrl = buildAuthRedirectUrl();

    setLoading(true);
    setErro('');

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: senha,
        options: {
          ...(authRedirectUrl ? { emailRedirectTo: authRedirectUrl } : {}),
          data: {
            nome: nome.trim(),
            perfil: 'operador',
            setor_id: null,
            empresa_id: empresa?.id ?? null,
            empresa_slug: tenantSlug,
          }
        }
      });

      if (error) {
        // Erro específico de usuário duplicado
        if (error.message.toLowerCase().includes('already registered') ||
            error.message.toLowerCase().includes('user already exists') ||
            error.message.toLowerCase().includes('email address is already')) {
          setErro('Este e-mail já está cadastrado. Tente fazer login ou use outro e-mail.');
        } else if (error.message.toLowerCase().includes('database error')) {
          setErro('Erro interno ao criar conta. Tente novamente em alguns instantes ou entre em contato com o suporte.');
        } else {
          setErro(error.message);
        }
        return;
      }

      if (!data.user) {
        setErro('Não foi possível concluir o cadastro. Tente novamente.');
        return;
      }

      setSucesso(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  }

  if (sucesso) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gradient-to-br from-success/5 via-background to-background pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="w-full max-w-md relative"
        >
          <Card className="border-success/30 shadow-lg">
            <CardContent className="p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 400 }}
                className="w-16 h-16 bg-success rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle2 className="w-8 h-8 text-white" />
              </motion.div>
              <h2 className="text-xl font-bold text-foreground mb-2">Conta criada!</h2>
              <p className="text-sm text-muted-foreground mb-1">
                Bem-vindo(a), <strong className="text-foreground">{nome.trim().split(' ')[0]}</strong>!
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                 Sua conta foi criada com sucesso e já está vinculada a <strong className="text-foreground">{empresa?.nome ?? branding.shortName}</strong>.
               </p>
              <Button className="w-full" onClick={() => navigate(ROUTE_PATHS.LOGIN)}>
                Ir para o Login
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 35 }}
        className="w-full max-w-md relative"
      >
        <Card className="border-border shadow-lg">
          <CardHeader className="text-center pb-4 pt-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 30 }}
              className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md"
            >
              <Shield className="w-7 h-7 text-primary-foreground" />
            </motion.div>
             <h1 className="text-2xl font-bold text-foreground">{branding.appName}</h1>
             <p className="text-sm text-muted-foreground mt-1">{branding.registerSubtitle}</p>
           </CardHeader>

           <CardContent className="pb-8">
             <form onSubmit={handleSubmit} className="space-y-4">
               <div className="space-y-1.5">
                 <Label className="text-sm font-medium">Empresa do site</Label>
                 <Input value={empresa?.nome ?? branding.shortName ?? tenantSlug} readOnly className="h-9 text-sm bg-muted/40" />
               </div>
               {/* Nome */}
              <div className="space-y-1.5">
                <Label htmlFor="nome" className="text-sm font-medium">Nome completo *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="nome"
                    type="text"
                    placeholder="Seu nome completo"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    className="pl-9"
                    autoComplete="name"
                    autoFocus
                  />
                </div>
              </div>

              {/* E-mail */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">E-mail (será seu login) *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="pl-9"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Senha */}
              <div className="space-y-1.5">
                <Label htmlFor="senha" className="text-sm font-medium">Senha *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="senha"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    className="pl-9 pr-9"
                    autoComplete="new-password"
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

              {/* Confirmar senha */}
              <div className="space-y-1.5">
                <Label htmlFor="confirma" className="text-sm font-medium">Confirmar senha *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirma"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Repita a senha"
                    value={confirma}
                    onChange={e => setConfirma(e.target.value)}
                    className={cn(
                      'pl-9',
                      confirma && senha !== confirma && 'border-destructive focus-visible:ring-destructive'
                    )}
                    autoComplete="new-password"
                  />
                </div>
                {confirma && senha !== confirma && (
                  <p className="text-xs text-destructive">As senhas não coincidem</p>
                )}
              </div>

              {/* Erro */}
               {(tenantError || erro) && (
                 <motion.div
                   initial={{ opacity: 0, y: -4 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3"
                 >
                   <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                   <p className="text-xs text-destructive">{tenantError || erro}</p>
                 </motion.div>
               )}

               <Button type="submit" className="w-full font-semibold" disabled={loading || tenantLoading || !tenantSlug}>
                 {loading || tenantLoading ? (
                   <div className="flex items-center gap-2">
                     <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                     Preparando cadastro...
                   </div>
                 ) : 'Criar conta'}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-border text-center">
              <p className="text-xs text-muted-foreground">
                Já tem conta?{' '}
                <Link to={ROUTE_PATHS.LOGIN} className="text-primary hover:underline font-medium">
                  Fazer login
                </Link>
              </p>
            </div>

             <p className="text-center text-xs text-muted-foreground/60 mt-3">
               Após o cadastro, seu acesso ficará vinculado automaticamente ao tenant deste site.
             </p>
          </CardContent>
        </Card>

        <div className="flex justify-center mt-4">
          <Link to={ROUTE_PATHS.LOGIN} className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            <ArrowLeft className="w-3 h-3" /> Voltar para o login
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
