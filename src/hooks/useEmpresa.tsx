import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Empresa, supabase } from '@/lib/supabase';
import { fetchEmpresaBySlug } from '@/services/empresas.service';
import { getTenantRuntimeConfig, type TenantBranding, type TenantFeatures } from '@/lib/tenant';

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
      if (!config.slug) {
        throw new Error('VITE_TENANT_SLUG não foi configurado.');
      }

      const tenantEmpresa = await fetchEmpresaBySlug(config.slug);

      if (!tenantEmpresa) {
        const { data: { session } } = await supabase.auth.getSession();
        setEmpresa(null);
        setError(session ? `Tenant "${config.slug}" não encontrado na tabela empresas.` : null);
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

  useEffect(() => {
    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      load();
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

export function useEmpresa(): EmpresaContextType {
  const ctx = useContext(EmpresaContext);
  if (!ctx) throw new Error('useEmpresa deve ser usado dentro de EmpresaProvider');
  return ctx;
}
