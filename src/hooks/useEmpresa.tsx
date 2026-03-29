/**
 * src/hooks/useEmpresa.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Hook/Context para fornecer o contexto da empresa ativa do usuário logado.
 * Usado por todos os serviços para filtrar queries por empresa.
 */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Empresa } from '@/lib/supabase';
import { fetchEmpresaAtual } from '@/services/empresas.service';

interface EmpresaContextType {
  empresa: Empresa | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const EmpresaContext = createContext<EmpresaContextType | undefined>(undefined);

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const emp = await fetchEmpresaAtual();
      setEmpresa(emp);
    } catch (e) {
      console.warn('[useEmpresa] load error:', e);
      setEmpresa(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <EmpresaContext.Provider value={{ empresa, loading, refresh: load }}>
      {children}
    </EmpresaContext.Provider>
  );
}

export function useEmpresa(): EmpresaContextType {
  const ctx = useContext(EmpresaContext);
  if (!ctx) throw new Error('useEmpresa deve ser usado dentro de EmpresaProvider');
  return ctx;
}
