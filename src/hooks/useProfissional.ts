import { useState, useEffect } from 'react';
import { supabase, type Profissional } from '@/lib/supabase';

/**
 * Busca um profissional pelo código na tabela `profissionais`.
 * - Debounce de 400ms para não disparar a cada tecla
 * - Só busca quando o código tiver pelo menos 4 caracteres
 */
export function useProfissional(codigo: string, empresaId: string | undefined) {
  const [profissional, setProfissional] = useState<Profissional | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const codigoTrimmed = codigo.trim();
    if (codigoTrimmed.length < 4 || !empresaId) {
      setProfissional(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profissionais')
        .select('id, empresa_id, codigo, nome, telefone, estado_uf, criado_em, atualizado_em')
        .eq('codigo', codigoTrimmed)
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (!error) {
        setProfissional((data as Profissional | null) ?? null);
      } else {
        console.warn('[useProfissional]', error.message);
        setProfissional(null);
      }
      setLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [codigo, empresaId]);

  return { profissional, loading };
}
