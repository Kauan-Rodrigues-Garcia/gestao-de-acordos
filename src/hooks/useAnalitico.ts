/**
 * useAnalitico — busca e realtime de analitico_recebimentos (PaguePlay)
 *
 * Ao montar, marca como vistos os registros não vistos do operador atual
 * (tag "novo" desaparece após a primeira visualização do mês).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { buscarAnalitico, marcarVistoAnalitico } from '@/services/analitico/analitico.service';
import { isPerfilAdminOuLider } from '@/lib/index';

export interface UseAnaliticoOptions {
  mes: string;                  // 'yyyy-MM'
  /** Filtrar por operador específico (líder filtrando equipe) */
  operadorFiltro?: string | null;
  /** null = somente sem operador (bucket sem match) */
  apenasOrfaos?: boolean;
}

export function useAnalitico(options: UseAnaliticoOptions) {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const [dados,       setDados]       = useState<AnaliticoRecebimento[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [novosCount,  setNovosCount]  = useState(0);
  const marcouRef = useRef(false);

  const isLiderMais = isPerfilAdminOuLider(perfil?.perfil ?? '');

  const fetchDados = useCallback(async () => {
    if (!empresa?.id || !perfil?.id) return;
    setLoading(true);
    setError(null);

    let operadorId: string | null | undefined = undefined;
    if (options.apenasOrfaos) {
      operadorId = null; // RPC: IS NULL
    } else if (options.operadorFiltro !== undefined) {
      operadorId = options.operadorFiltro;
    } else if (!isLiderMais) {
      operadorId = perfil.id; // operador vê só os próprios
    }

    const { data, error: err } = await buscarAnalitico({
      empresaId:  empresa.id,
      mes:        options.mes,
      operadorId,
    });

    if (err) { setError(err); setLoading(false); return; }

    setDados(data);
    const naoVistos = data.filter(d => !d.visto && d.operador_id === perfil.id).length;
    setNovosCount(naoVistos);
    setLoading(false);
  }, [empresa?.id, perfil?.id, options.mes, options.operadorFiltro, options.apenasOrfaos, isLiderMais]);

  // Marcar como visto ao abrir (uma vez por mount)
  useEffect(() => {
    if (!perfil?.id || !empresa?.id || marcouRef.current) return;
    marcouRef.current = true;
    marcarVistoAnalitico(empresa.id, perfil.id, options.mes).catch(() => {});
  }, [empresa?.id, perfil?.id, options.mes]);

  useEffect(() => {
    void fetchDados();
  }, [fetchDados]);

  // Realtime subscription
  useEffect(() => {
    if (!empresa?.id) return;
    const channel = supabase
      .channel(`analitico-${empresa.id}-${options.mes}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'analitico_recebimentos',
          filter: `empresa_id=eq.${empresa.id}`,
        },
        () => { void fetchDados(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [empresa?.id, options.mes, fetchDados]);

  return { dados, loading, error, novosCount, refetch: fetchDados };
}
