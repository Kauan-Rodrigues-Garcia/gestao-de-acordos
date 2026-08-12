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
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { identificarUsuario, limparUsuario } from '@/lib/observabilidade';
import { registrarLog, registrarLoginRecusado } from '@/services/logs.service';

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
  const isManualSignOut               = useRef(false);

  /**
   * signOut() com rede de segurança: alguns builds do supabase-js abortam a
   * limpeza do localStorage quando o POST /auth/v1/logout responde erro
   * (ex: 403 — sessão já revogada no servidor). Sem isso, um F5 restaura a
   * sessão velha salva no localStorage mesmo com o React state já zerado.
   */
  async function forceSignOut() {
    await supabase.auth.signOut().catch(() => {
      // Servidor pode recusar o /logout (sessão já revogada lá) — segue e limpa local mesmo assim.
    });
    try {
      const ref = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split('.')[0];
      localStorage.removeItem(`sb-${ref}-auth-token`);
    } catch {
      // Ambiente sem localStorage (SSR/teste) ou URL ausente — nada a limpar.
    }
  }

  async function rejectTenantMismatch(currentEmpresa: Empresa | null) {
    const tenantSlug = getConfiguredTenantSlug();
    const companyName = currentEmpresa?.nome ?? 'outra empresa';
    const message = tenantSlug
      ? `Seu usuário está vinculado a ${companyName}. Acesse pelo site correto da sua empresa.`
      : `Seu usuário está vinculado a ${companyName}. Este site não está disponível para a sua empresa.`;

    setAuthError(message);
    setPerfil(null);
    setEmpresa(null);
    await forceSignOut();
    return { tenantMismatch: message, missingProfile: null as string | null };
  }

  // Item 5: usuário desligado não acessa mais. Bloqueia no login e limpa a sessão.
  async function rejectDesligado() {
    const message = 'Sua conta foi desligada. Contate o administrador.';
    setAuthError(message);
    setPerfil(null);
    setEmpresa(null);
    await forceSignOut();
    return { tenantMismatch: null as string | null, missingProfile: message };
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
            // Item 5: conta desligada não acessa (super_admin nunca é bloqueado).
            if (!isSuperAdmin && (data2 as Perfil).situacao === 'desligado') {
              return rejectDesligado();
            }
            // Impersonação atravessa tenant — super_admin pode entrar como usuário de outra empresa.
            if (!isSuperAdmin && !getImpersonacaoAtiva() && tenantSlug && (data2 as Perfil).empresa_id) {
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

          // Item 5: conta desligada não acessa (super_admin nunca é bloqueado).
          if (!isSuperAdmin && nextPerfil.situacao === 'desligado') {
            return rejectDesligado();
          }

          // Impersonação atravessa tenant — super_admin pode entrar como usuário de outra empresa.
          if (!isSuperAdmin && !getImpersonacaoAtiva() && tenantSlug && emp?.slug && emp.slug !== tenantSlug) {
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
    // IMPORTANTE: ignorar TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION para não
    // remontar a árvore quando o usuário volta para a aba do navegador (bug #1).
    // Apenas SIGNED_IN (novo login) e SIGNED_OUT devem disparar side-effects.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      // Só atualizamos session/user em eventos relevantes — assim o React não re-renderiza
      // o AuthProvider a cada refresh silencioso de token (que ocorre ao voltar para a aba).
      if (_event === 'SIGNED_OUT') {
        if (!isManualSignOut.current) {
          // Logout inesperado: sessão expirou ou token foi revogado
          setAuthError('Sua sessão expirou. Por favor, faça login novamente.');
        }
        isManualSignOut.current = false;
        setSession(null);
        setUser(null);
        setPerfil(null);
        setEmpresa(null);
        setLoading(false);
        return;
      }
      if (_event === 'SIGNED_IN') {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user && !isSigningIn.current) {
          fetchPerfil(s.user.id);
        }
        return;
      }
      // TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION: só atualiza a session
      // (para manter o access_token válido) sem recarregar o perfil nem re-renderizar
      // a UI a ponto de perder estado de formulários em andamento.
      if (s) {
        setSession(s);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchPerfil recriada a cada render; rodar só uma vez no mount é intencional.
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
        // Identificador que não resolve: `fn_log_login_recusado` confirma no
        // banco se existe alguém com esse usuário/e-mail e só grava nesse caso —
        // então isto não enche a trilha com nomes inventados.
        void registrarLoginRecusado(identifier.trim(), 'usuario_nao_encontrado');
        return { error: 'Usuário não encontrado neste site. Tente novamente com seu e-mail ou confirme se o cadastro está vinculado à empresa correta.' };
      }
      email = emailResult;
    }

    isSigningIn.current = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Toda recusa é registrada, com o motivo separado: senha errada e e-mail
        // não confirmado são problemas diferentes, e distingui-los na trilha é o
        // que permite reconhecer força bruta em vez de cadastro pela metade.
        const motivo = error.message.toLowerCase().includes('email not confirmed')
          ? 'email_nao_confirmado'
          : error.message.toLowerCase().includes('invalid login credentials')
            ? 'credenciais_invalidas'
            : 'erro_autenticacao';
        void registrarLoginRecusado(email, motivo);

        if (motivo === 'email_nao_confirmado') {
          return { error: 'Email não confirmado. Entre em contato com o administrador.' };
        }
        if (motivo === 'credenciais_invalidas') {
          return { error: 'Credenciais inválidas. Verifique seu usuário e senha.' };
        }
        return { error: error.message };
      }
      if (data.user) {
        const { tenantMismatch, missingProfile } = await fetchPerfil(data.user.id);
        if (tenantMismatch || missingProfile) {
          // Senha correta, empresa errada. É o caso mais importante desta lista
          // do ponto de vista de segurança: credencial válida tentando entrar
          // pelo site de outra operação.
          void registrarLog({
            acao: 'acesso_negado',
            categoria: 'seguranca',
            severidade: 'critico',
            descricao: tenantMismatch
              ? 'Entrou com senha correta em um site de outra empresa — acesso negado'
              : 'Entrou com senha correta sem perfil cadastrado — acesso negado',
            tabela: 'auth.users',
            registroId: data.user.id,
            alvoTipo: 'usuario',
            detalhes: { motivo: tenantMismatch ?? missingProfile },
          });
          await forceSignOut();
          return { error: tenantMismatch ?? missingProfile };
        }

        // `void` e não `await`: login é o caminho mais sensível a latência do
        // sistema, e a requisição do log completa sozinha — ela não está
        // amarrada ao ciclo de vida de nenhum componente. O carimbo de tempo é
        // do banco (`criado_em DEFAULT now()`), então a ordem na trilha continua
        // certa mesmo que a resposta chegue depois da navegação.
        void registrarLog({
          acao: 'login',
          categoria: 'autenticacao',
          descricao: 'Entrou no sistema',
          tabela: 'auth.users',
          registroId: data.user.id,
          alvoTipo: 'usuario',
          detalhes: { por: identifier.includes('@') ? 'email' : 'usuario' },
        });
      }
      return { error: null };
    } finally {
      isSigningIn.current = false;
    }
  }

  async function signOut() {
    isManualSignOut.current = true;
    // Antes de derrubar a sessão: depois do signOut, `auth.uid()` é nulo e a
    // função de log não tem como saber quem saiu.
    await registrarLog({
      acao: 'logout',
      categoria: 'autenticacao',
      descricao: 'Saiu do sistema',
      tabela: 'auth.users',
      registroId: perfil?.id ?? null,
      alvoTipo: 'usuario',
    });
    await forceSignOut();
    setPerfil(null);
    setEmpresa(null);
    setUser(null);
    setSession(null);
    setAuthError(null);
  }

  // Carimba no Sentry quem está usando o sistema. Sem isto um erro chega sem
  // dono, e aqui quase todo problema é descoberto por um operador reclamando —
  // é o que liga o relato ao relatório. Vai só id, usuário e cargo: nome e
  // e-mail não são necessários para achar a pessoa e não precisam sair daqui.
  useEffect(() => {
    if (perfil?.id) {
      identificarUsuario({ id: perfil.id, usuario: perfil.usuario, cargo: perfil.perfil });
    } else {
      limparUsuario();
    }
  }, [perfil?.id, perfil?.usuario, perfil?.perfil]);

  const value: AuthContextType = {
    user, session, perfil, empresa, loading, perfilLoading, authError, signIn, signOut, refreshPerfil,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- arquivo exporta Provider + hook consumidor, padrão já usado no resto do projeto.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}