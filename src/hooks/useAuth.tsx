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
    return { tenantMismatch: message };
  }

  async function fetchPerfil(userId: string): Promise<{ tenantMismatch: string | null }> {
    setPerfilLoading(true);
    setAuthError(null);
    try {
      const MAX_ATTEMPTS = 3;
      const RETRY_DELAY_MS = 500;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        // Tentativa 1: com join de setores e empresas
        const { data, error } = await supabase
          .from('perfis')
          .select('*, setores(id, nome), empresas(id, nome, slug, ativo, config, criado_em, atualizado_em)')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          console.warn('[useAuth] fetchPerfil erro:', error.message, '— tentando sem join...');

          // Tentativa 2: sem join (mais simples, evita falha de RLS em relação)
          const { data: data2, error: error2 } = await supabase
            .from('perfis')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

          if (error2) {
            console.error('[useAuth] fetchPerfil falhou mesmo sem join:', error2.message);
            return { tenantMismatch: null };
          }
          if (data2) {
            setPerfil(data2 as Perfil);
            setEmpresa(null);
            return { tenantMismatch: null };
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
          return { tenantMismatch: null };
        }

        // Perfil ainda não criado pelo trigger — condição de corrida
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    } catch (e) {
      console.error('[useAuth] fetchPerfil inesperado:', e);
      return { tenantMismatch: null };
    } finally {
      setPerfilLoading(false);
    }

    return { tenantMismatch: null };
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
      const { data: emailResult, error: lookupError } = await supabase
        .rpc('buscar_email_por_usuario', { p_usuario: email });

      if (lookupError || !emailResult) {
        return { error: 'Usuário não encontrado.' };
      }
      email = emailResult as string;
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
        const { tenantMismatch } = await fetchPerfil(data.user.id);
        if (tenantMismatch) {
          return { error: tenantMismatch };
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
