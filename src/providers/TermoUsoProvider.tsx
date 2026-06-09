import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { TermoUso } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';

export interface UseTermoUsoResult {
  termoAtivo: TermoUso | null;
  precisaAceitar: boolean;
  loading: boolean;
  registrarAceite: () => Promise<void>;
}

const TermoUsoContext = createContext<UseTermoUsoResult | null>(null);

export function TermoUsoProvider({ children }: { children: React.ReactNode }) {
  const { perfil, session } = useAuth();
  const { empresa } = useEmpresa();

  const [termoAtivo, setTermoAtivo] = useState<TermoUso | null>(null);
  const [precisaAceitar, setPrecisaAceitar] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id || !perfil?.id || !empresa?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: termo } = await supabase
        .from('termos_uso')
        .select('*')
        .eq('empresa_id', empresa.id)
        .eq('ativo', true)
        .maybeSingle();

      if (cancelled) return;

      if (!termo) {
        setLoading(false);
        return;
      }

      setTermoAtivo(termo as TermoUso);

      const { data: aceite } = await supabase
        .from('aceites_termo')
        .select('id')
        .eq('usuario_id', session.user.id)
        .eq('termo_id', termo.id)
        .maybeSingle();

      if (cancelled) return;

      setPrecisaAceitar(!aceite);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id, perfil?.id, empresa?.id]);

  const registrarAceite = useCallback(async () => {
    if (!termoAtivo || !session?.user?.id) return;

    await supabase.from('aceites_termo').insert({
      usuario_id: session.user.id,
      termo_id: termoAtivo.id,
      user_agent: navigator.userAgent,
    });

    setPrecisaAceitar(false);
  }, [termoAtivo, session?.user?.id]);

  return (
    <TermoUsoContext.Provider value={{ termoAtivo, precisaAceitar, loading, registrarAceite }}>
      {children}
    </TermoUsoContext.Provider>
  );
}

export function useTermoUso(): UseTermoUsoResult {
  const ctx = useContext(TermoUsoContext);
  if (!ctx) throw new Error('useTermoUso must be used within TermoUsoProvider');
  return ctx;
}
