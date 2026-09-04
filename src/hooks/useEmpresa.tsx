import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Empresa, supabase } from '@/lib/supabase';
import { fetchEmpresaBySlug, fetchEmpresaAtual } from '@/services/empresas.service';
import { getTenantRuntimeConfig, type TenantBranding, type TenantFeatures } from '@/lib/tenant';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { resolverEmpresaEscolhida } from '@/services/empresaAtiva.service';

interface EmpresaContextType {
  empresa: Empresa | null;
  branding: TenantBranding;
  features: TenantFeatures;
  tenantSlug: string;
  siteUrl: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EmpresaContext = createContext<EmpresaContextType | undefined>(undefined);

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const config = getTenantRuntimeConfig();

    setLoading(true);
    setError(null);

    try {
      // Impersonação cruza tenant (bookplay/pagueplay são deploys/domínios
      // separados, cada um com VITE_TENANT_SLUG fixo no build). Sem isto, o
      // super_admin impersonando um usuário PagueiPlay a partir do site
      // BookPlay ficava preso na empresa BookPlay (slug do build), então
      // todas as queries filtradas por empresa_id voltavam vazias.
      // A sessão real já é a do usuário-alvo, então usamos a empresa DELE.
      if (getImpersonacaoAtiva()) {
        const empresaReal = await fetchEmpresaAtual();
        setEmpresa(empresaReal);
        return;
      }

      // Super_admin escolheu outra empresa. Vem ANTES do slug do build pelo
      // mesmo motivo da impersonação: o slug descreve o DOMÍNIO, e a escolha
      // descreve onde a pessoa quer estar. `resolverEmpresaEscolhida` confere o
      // cargo e devolve null se a escolha não valer mais — aí segue o fluxo
      // normal, sem tela vazia e sem branding trocado.
      const escolhida = await resolverEmpresaEscolhida();
      if (escolhida) {
        setEmpresa(escolhida);
        return;
      }

      if (!config.slug) {
        // VITE_TENANT_SLUG not configured — fall back to the empresa linked to the
        // currently-authenticated user's profile (single-tenant / dev environments).
        const fallbackEmpresa = await fetchEmpresaAtual();
        setEmpresa(fallbackEmpresa);
        // No error: the app is usable as long as the user is logged in.
        return;
      }

      const tenantEmpresa = await fetchEmpresaBySlug(config.slug);

      if (!tenantEmpresa) {
        const { data: { session } } = await supabase.auth.getSession();
        setEmpresa(null);
        setError(session ? `A empresa configurada para este site não foi encontrada.` : null);
        return;
      }

      setEmpresa(tenantEmpresa);
    } catch (e) {
      console.warn('[useEmpresa] load error:', e);
      setEmpresa(null);
      setError(e instanceof Error ? e.message : 'Erro ao carregar tenant.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * De quem é a sessão que já foi carregada.
   *
   * `SIGNED_IN` não significa «alguém acabou de entrar». O supabase-js REEMITE
   * esse evento quando a aba volta ao foco — ele revalida a sessão guardada e
   * anuncia de novo a mesma pessoa. Só o `TOKEN_REFRESHED` estava filtrado
   * aqui, então sair do navegador e voltar disparava `load()`, que começa com
   * `setLoading(true)`, e o `ProtectedRoute` trocava a página por um esqueleto.
   *
   * Trocar a página DESMONTA tudo o que estava dentro: a aba interna aberta, o
   * filtro, a rolagem, o formulário pela metade. Era esse o defeito de «voltar
   * para a janela e cair na primeira aba».
   *
   * Comparar o id resolve sem perder nada: troca de pessoa (login, logout,
   * impersonação) muda o id e recarrega; a mesma pessoa voltando para a aba
   * não.
   */
  const usuarioCarregado = useRef<string | null>(null);

  useEffect(() => {
    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sessao) => {
      const uid = sessao?.user?.id ?? null;

      if (event === 'SIGNED_OUT') {
        usuarioCarregado.current = null;
        load();
        return;
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Mesma pessoa que já está carregada: é a aba voltando, não um login.
        if (uid !== null && uid === usuarioCarregado.current) return;
        usuarioCarregado.current = uid;
        load();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const runtimeConfig = getTenantRuntimeConfig(empresa);

  return (
    <EmpresaContext.Provider
      value={{
        empresa,
        branding: runtimeConfig.branding,
        features: runtimeConfig.features,
        tenantSlug: runtimeConfig.slug,
        siteUrl: runtimeConfig.siteUrl,
        loading,
        error,
        refresh: load,
      }}
    >
      {children}
    </EmpresaContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- arquivo exporta Provider + hook consumidor, padrão já usado no resto do projeto.
export function useEmpresa(): EmpresaContextType {
  const ctx = useContext(EmpresaContext);
  if (!ctx) throw new Error('useEmpresa deve ser usado dentro de EmpresaProvider');
  return ctx;
}
