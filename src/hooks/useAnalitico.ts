/**
 * useAnalitico — busca e realtime de analitico_recebimentos (PaguePlay)
 *
 * Ao montar, marca como vistos os registros não vistos do operador atual
 * (tag "novo" desaparece após a primeira visualização do mês).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
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
  const marcouRef     = useRef(false);
  const hasLoadedOnce = useRef(false);

  const isLiderMais = isPerfilAdminOuLider(perfil?.perfil ?? '');

  const fetchDados = useCallback(async () => {
    if (!empresa?.id || !perfil?.id) return;
    setLoading(true);
    setError(null);

    let operadorId: string | null | undefined = undefined;
    if (options.apenasOrfaos) {
      operadorId = null;
    } else if (options.operadorFiltro !== undefined) {
      operadorId = options.operadorFiltro;
    } else if (!isLiderMais) {
      operadorId = perfil.id;
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
    hasLoadedOnce.current = true;
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

  // Realtime: a importação insere EM LOTE (1 evento por linha), então o
  // refetch/toast é debounced — um único aviso por importação, e nunca para
  // quem importou (o próprio fluxo de importar já dá o feedback).
  const rtDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rtToastRef     = useRef(false);
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
        (payload) => {
          const importadoPorMim =
            (payload.new as { importado_por_id?: string | null } | null)?.importado_por_id === perfil?.id;
          if (hasLoadedOnce.current && payload.eventType === 'INSERT' && !importadoPorMim) {
            rtToastRef.current = true;
          }
          if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current);
          rtDebounceRef.current = setTimeout(() => {
            if (rtToastRef.current) {
              rtToastRef.current = false;
              toast.info('Analítico atualizado!', {
                id: 'analitico-atualizado',   // mesmo id → substitui, não empilha
                description: 'Novos recebimentos foram importados.',
                duration: 4000,
              });
            }
            void fetchDados();
          }, 1500);
        },
      )
      .subscribe();

    return () => {
      if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [empresa?.id, perfil?.id, options.mes, fetchDados]);

  return { dados, loading, error, novosCount, refetch: fetchDados };
}
