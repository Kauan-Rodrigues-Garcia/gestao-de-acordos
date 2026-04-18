/**
 * src/hooks/useAuth.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Contexto de autenticação e perfil do usuário.
 *
 * ## API pública (`useAuth()`)
 *
 * | Campo           | Tipo                  | Descrição                                      |
 * |-----------------|-----------------------|------------------------------------------------|
 * | `user`          | `User \| null`        | Usuário Supabase autenticado                   |
 * | `session`       | `Session \| null`     | Sessão ativa                                   |
 * | `perfil`        | `Perfil \| null`      | Perfil do usuário (nome, cargo, setor…)        |
 * | `empresa`       | `Empresa \| null`     | Empresa vinculada ao perfil                    |
 * | `loading`       | `boolean`             | True durante restauração da sessão inicial     |
 * | `perfilLoading` | `boolean`             | True enquanto `fetchPerfil` está em execução   |
 * | `authError`     | `string \| null`      | Mensagem de erro de autenticação               |
 * | `signIn()`      | `(id, pwd) => Promise`| Login por e-mail ou nome de usuário            |
 * | `signOut()`     | `() => Promise`       | Logout e limpeza de estado                     |
 * | `refreshPerfil`| `() => Promise`       | Força re-fetch do perfil (ex: após edição)     |
 *
 * ## Resiliência a race condition
 * O `fetchPerfil` usa **backoff exponencial com 7 tentativas** (500 ms → 8 s)
 * para tolerar o atraso do trigger do banco ao criar o perfil após o signup.
 *
 * ## Multi-tenant
 * Valida que o `slug` da empresa do usuário corresponde ao tenant configurado
 * em `VITE_TENANT_SLUG`. Usuários de outra empresa são bloqueados no login.
 *
 * @example
 * ```tsx
 * function MinhaPage() {
 *   const { perfil, signOut } = useAuth();
 *   if (!perfil) return null;
 *   return <p>Olá, {perfil.nome}! <button onClick={signOut}>Sair</button></p>;
 * }
 * ```
 */
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, Perfil, Empresa } from '@/lib/supabase';
import { getConfiguredTenantSlug } from '@/lib/tenant';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  perfil: Perfil | null;
  empresa: Empresa | null;
  loading: boolean;
  perfilLoading: boolean;
  authError: string | null;
  signIn: (identifier: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<User | null>(null);
  const [session, setSession]         = useState<Session | null>(null);
  const [perfil, setPerfil]           = useState<Perfil | null>(null);
  const [empresa, setEmpresa]         = useState<Empresa | null>(null);
  const [loading, setLoading]         = useState(true);
  const [perfilLoading, setPerfilLoading] = useState(false);
  const [authError, setAuthError]     = useState<string | null>(null);
  const isSigningIn                   = useRef(false);

  async function rejectTenantMismatch(currentEmpresa: Empresa | null) {
    const tenantSlug = getConfiguredTenantSlug();
    const companyName = currentEmpresa?.nome ?? 'outra empresa';
    const message = tenantSlug
      ? `Seu usuário está vinculado a ${companyName}. Acesse pelo site correto da sua empresa.`
      : `Seu usuário está vinculado a ${companyName}. Este site não está disponível para a sua empresa.`;

    setAuthError(message);
    setPerfil(null);
    setEmpresa(null);
    await supabase.auth.signOut();
    return { tenantMismatch: message, missingProfile: null as string | null };
  }

  async function fetchPerfil(userId: string): Promise<{ tenantMismatch: string | null; missingProfile: string | null }> {
    setPerfilLoading(true);
    setAuthError(null);
    try {
      // Aumentado para 7 tentativas com backoff exponencial (cap 8 s)
      // para tolerar banco sob alta carga. Delays: 500ms → 1s → 2s → 4s → 8s → 8s → 8s
      const MAX_ATTEMPTS = 7;
      const BASE_DELAY_MS = 500;
      const MAX_DELAY_MS = 8000;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        // Tentativa primária: com join de setores e empresas
        const { data, error } = await supabase
          .from('perfis')
          .select('*, setores(id, nome), empresas(id, nome, slug, ativo, config, criado_em, atualizado_em)')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          console.warn(`[useAuth] fetchPerfil erro (tentativa ${attempt}/${MAX_ATTEMPTS}):`, error.message, '— tentando sem join...');

          // Fallback sem join (evita falha de RLS em relação)
          const { data: data2, error: error2 } = await supabase
            .from('perfis')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

          if (error2) {
            console.error('[useAuth] fetchPerfil falhou mesmo sem join:', error2.message);
            // Não retorna — deixa o backoff retentar
          } else if (data2) {
            // ── Validar tenant no fallback também (sem join, empresa_id está no perfil)
            const tenantSlug = getConfiguredTenantSlug();
            const isSuperAdmin = (data2 as Perfil).perfil === 'super_admin';
            if (!isSuperAdmin && tenantSlug && (data2 as Perfil).empresa_id) {
              // Buscar slug da empresa do usuário
              const { data: empData } = await supabase
                .from('empresas')
                .select('id, nome, slug, ativo, config, criado_em, atualizado_em')
                .eq('id', (data2 as Perfil).empresa_id)
                .maybeSingle();
              if (empData && (empData as Empresa).slug !== tenantSlug) {
                return rejectTenantMismatch(empData as Empresa);
              }
              setEmpresa((empData as Empresa) ?? null);
            } else {
              setEmpresa(null);
            }
            setPerfil(data2 as Perfil);
            return { tenantMismatch: null, missingProfile: null };
          }
        } else if (data) {
          const { empresas: emp, ...perfilData } = data as Perfil & { empresas?: Empresa };
          const nextPerfil = perfilData as Perfil;
          const tenantSlug = getConfiguredTenantSlug();
          const isSuperAdmin = nextPerfil.perfil === 'super_admin';

          if (!isSuperAdmin && tenantSlug && emp?.slug && emp.slug !== tenantSlug) {
            return rejectTenantMismatch(emp);
          }

          setPerfil(nextPerfil);
          setEmpresa(emp ?? null);
          return { tenantMismatch: null, missingProfile: null };
        }

        // Perfil ainda não criado pelo trigger — backoff exponencial com cap
        if (attempt < MAX_ATTEMPTS) {
          const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
          console.info(`[useAuth] perfil não encontrado, aguardando ${delay}ms (tentativa ${attempt}/${MAX_ATTEMPTS})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // Todas as tentativas esgotadas sem encontrar perfil
      const missingProfile = 'Login encontrado, mas o perfil do usuário ainda não foi criado no banco. Tente novamente em alguns instantes ou entre em contato com o administrador.';
      console.error('[useAuth] fetchPerfil: perfil não encontrado após', MAX_ATTEMPTS, 'tentativas.');
      setAuthError(missingProfile);
      return { tenantMismatch: null, missingProfile };
    } catch (e) {
      console.error('[useAuth] fetchPerfil inesperado:', e);
      return { tenantMismatch: null, missingProfile: null };
    } finally {
      setPerfilLoading(false);
    }
  }

  async function refreshPerfil() {
    if (user) await fetchPerfil(user.id);
  }

  useEffect(() => {
    let mounted = true;

    // Restaurar sessão existente
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchPerfil(s.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Ouvir mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // Pular se signIn já está buscando o perfil manualmente
        if (!isSigningIn.current) {
          fetchPerfil(s.user.id);
        }
      } else {
        setPerfil(null);
        setEmpresa(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(identifier: string, password: string) {
    let email = identifier.trim();

    // If identifier does not contain '@', treat it as a username and look up email
    // Uses RPC with SECURITY DEFINER to bypass RLS (query runs before authentication)
    if (!email.includes('@')) {
      const tenantSlug = getConfiguredTenantSlug();
      let emailResult: string | null = null;
      let lookupError: unknown = null;

      if (tenantSlug) {
        const { data, error } = await supabase.rpc('buscar_email_por_usuario_empresa', {
          p_usuario: email,
          p_empresa_slug: tenantSlug,
        });
        if (!error && data) {
          emailResult = data as string;
          lookupError = null;
        } else {
          lookupError = error;
        }
      }

      if (!emailResult) {
        const { data, error } = await supabase
          .rpc('buscar_email_por_usuario', { p_usuario: email });
        if (!error && data) {
          emailResult = data as string;
          lookupError = null;
        } else {
          lookupError = error;
        }
      }

      if (lookupError || !emailResult) {
        return { error: 'Usuário não encontrado neste site. Tente novamente com seu e-mail ou confirme se o cadastro está vinculado à empresa correta.' };
      }
      email = emailResult;
    }

    isSigningIn.current = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          return { error: 'Email não confirmado. Entre em contato com o administrador.' };
        }
        if (error.message.toLowerCase().includes('invalid login credentials')) {
          return { error: 'Credenciais inválidas. Verifique seu usuário e senha.' };
        }
        return { error: error.message };
      }
      if (data.user) {
        const { tenantMismatch, missingProfile } = await fetchPerfil(data.user.id);
        if (tenantMismatch || missingProfile) {
          await supabase.auth.signOut();
          return { error: tenantMismatch ?? missingProfile };
        }
      }
      return { error: null };
    } finally {
      isSigningIn.current = false;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setPerfil(null);
    setEmpresa(null);
    setUser(null);
    setSession(null);
    setAuthError(null);
  }

  const value: AuthContextType = {
    user, session, perfil, empresa, loading, perfilLoading, authError, signIn, signOut, refreshPerfil,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}