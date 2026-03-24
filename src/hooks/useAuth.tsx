import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, Perfil } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  perfil: Perfil | null;
  loading: boolean;
  perfilLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<User | null>(null);
  const [session, setSession]         = useState<Session | null>(null);
  const [perfil, setPerfil]           = useState<Perfil | null>(null);
  const [loading, setLoading]         = useState(true);
  const [perfilLoading, setPerfilLoading] = useState(false);

  async function fetchPerfil(userId: string): Promise<void> {
    setPerfilLoading(true);
    try {
      // Tentativa 1: com join de setores
      const { data, error } = await supabase
        .from('perfis')
        .select('*, setores(id, nome)')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('[useAuth] fetchPerfil erro:', error.message, '— tentando sem join...');

        // Tentativa 2: sem join (mais simples, evita falha de RLS em relação)
        const { data: data2, error: error2 } = await supabase
          .from('perfis')
          .select('*')
          .eq('id', userId)
          .single();

        if (error2) {
          console.error('[useAuth] fetchPerfil falhou mesmo sem join:', error2.message);
          return;
        }
        if (data2) setPerfil(data2 as Perfil);
        return;
      }

      if (data) setPerfil(data as Perfil);
    } catch (e) {
      console.error('[useAuth] fetchPerfil inesperado:', e);
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
        fetchPerfil(s.user.id);
      } else {
        setPerfil(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.user) await fetchPerfil(data.user.id);
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setPerfil(null);
    setUser(null);
    setSession(null);
  }

  const value: AuthContextType = {
    user, session, perfil, loading, perfilLoading, signIn, signOut, refreshPerfil,
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
