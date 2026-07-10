/**
 * useDiario — busca e realtime de diario_recebimentos (PaguePlay).
 *
 * Lógica de "novos" do operador:
 *   Um pagamento só é considerado lido quando o operador abre a aba
 *   (marcarVisto=true) após a importação. Os ids não vistos no momento da
 *   carga ficam em `novosIds` durante a sessão — a lista continua separando
 *   "anteriores" × "novos" mesmo depois de o banco marcar visto=true.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { DiarioRecebimento } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { buscarDiario, marcarVistoDiario } from '@/services/diario/diario.service';

export interface UseDiarioOptions {
  /** Dia do relatório ('yyyy-MM-dd'); null = ainda não resolvido (não busca) */
  dia: string | null;
  /** Filtrar por operador específico; null = somente órfãos; undefined = todos */
  operadorFiltro?: string | null;
  /** Marca as linhas do usuário atual como vistas após a carga (visão operador) */
  marcarVisto?: boolean;
}

export function useDiario(options: UseDiarioOptions) {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const [dados,   setDados]   = useState<DiarioRecebimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  // Ids não vistos na carga — mantidos como "novos" durante a sessão
  const novosIdsRef   = useRef<Set<string>>(new Set());
  const [novosIds, setNovosIds] = useState<Set<string>>(new Set());
  const hasLoadedOnce = useRef(false);

  const fetchDados = useCallback(async () => {
    if (!empresa?.id || !perfil?.id || !options.dia) {
      setDados([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: err } = await buscarDiario({
      empresaId:  empresa.id,
      dia:        options.dia,
      operadorId: options.operadorFiltro,
    });

    if (err) { setError(err); setLoading(false); return; }

    setDados(data);

    // Congela os "novos" da sessão e marca como vistos no banco
    const naoVistosProprios = data.filter(d => !d.visto && d.operador_id === perfil.id);
    if (naoVistosProprios.length) {
      for (const d of naoVistosProprios) novosIdsRef.current.add(d.id);
      setNovosIds(new Set(novosIdsRef.current));
      if (options.marcarVisto) {
        marcarVistoDiario(empresa.id, perfil.id).catch(() => {});
      }
    }

    setLoading(false);
    hasLoadedOnce.current = true;
  }, [empresa?.id, perfil?.id, options.dia, options.operadorFiltro, options.marcarVisto]);

  useEffect(() => {
    void fetchDados();
  }, [fetchDados]);

  // Realtime: refetch em INSERT/DELETE (UPDATE de "visto" não altera a lista).
  // A importação insere EM LOTE (1 evento por linha) → refetch/toast debounced:
  // um único aviso por importação, e nunca para quem importou.
  const rtDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rtToastRef    = useRef(false);
  useEffect(() => {
    if (!empresa?.id || !options.dia) return;
    const agendarRefetch = () => {
      if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current);
      rtDebounceRef.current = setTimeout(() => {
        if (rtToastRef.current) {
          rtToastRef.current = false;
          toast.info('Recebimento diário atualizado!', {
            id: 'diario-atualizado',   // mesmo id → substitui, não empilha
            description: 'Novos pagamentos foram importados.',
            duration: 4000,
          });
        }
        void fetchDados();
      }, 1500);
    };
    const channel = supabase
      .channel(`diario-${empresa.id}-${options.dia}-${options.operadorFiltro ?? 'all'}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'diario_recebimentos',
          filter: `empresa_id=eq.${empresa.id}`,
        },
        (payload) => {
          const importadoPorMim =
            (payload.new as { importado_por_id?: string | null } | null)?.importado_por_id === perfil?.id;
          if (hasLoadedOnce.current && !importadoPorMim) rtToastRef.current = true;
          agendarRefetch();
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'DELETE',
          schema: 'public',
          table:  'diario_recebimentos',
        },
        () => { agendarRefetch(); },
      )
      .subscribe();

    return () => {
      if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [empresa?.id, perfil?.id, options.dia, options.operadorFiltro, fetchDados]);

  return { dados, loading, error, novosIds, refetch: fetchDados };
}
