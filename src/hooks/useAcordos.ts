/**
 * src/hooks/useAcordos.ts
 *
 * Hook centralizado para acordos com suporte a OPTIMISTIC UPDATES.
 *
 * ─── API pública ────────────────────────────────────────────────────────────
 *  acordos          – lista atual (atualiza sem skeleton via helpers abaixo)
 *  totalCount       – total para paginação
 *  loading          – true apenas na PRIMEIRA carga
 *  error            – mensagem de erro, se houver
 *  refetch()        – força recarregamento completo (botão manual)
 *
 *  patchAcordo(id, partial) – atualiza campos localmente sem refetch
 *  removeAcordo(id)         – remove item localmente sem refetch
 *  addAcordo(acordo)        – insere item localmente sem refetch
 *
 * ─── Realtime ───────────────────────────────────────────────────────────────
 *  Quando o componente está montado, escuta alterações Supabase e aplica
 *  apenas um patch/add/remove cirúrgico – sem recarregar a tabela inteira.
 *  O realtime está habilitado por padrão; passe `enableRealtime={false}`
 *  em contextos onde não é necessário (ex: listas secundárias).
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, Acordo } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { getTodayISO } from '@/lib/index';
import {
  type FiltrosAcordo,
  fetchAcordos as fetchAcordosService,
  calcularMetricasDashboard,
  type MetricasDashboard,
} from '@/services/acordos.service';

export type { FiltrosAcordo };

interface UseAcordosOptions extends FiltrosAcordo {
  enableRealtime?: boolean;
}

export interface UseAcordosResult {
  acordos: Acordo[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Atualiza campos de um acordo localmente (sem novo fetch) */
  patchAcordo: (id: string, partial: Partial<Acordo>) => void;
  /** Remove um acordo da lista localmente (sem novo fetch) */
  removeAcordo: (id: string) => void;
  /** Adiciona um acordo à lista localmente (sem novo fetch) */
  addAcordo: (acordo: Acordo) => void;
}

export function useAcordos(filtros?: UseAcordosOptions): UseAcordosResult {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [acordos, setAcordos]       = useState<Acordo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Ref para evitar setState após desmontagem
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── fetch completo (usado apenas na montagem ou refresh manual) ───────────
  const fetchAcordos = useCallback(async () => {
    const empresaId = empresa?.id ?? perfil?.empresa_id;
    if (!perfil || !empresaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, count } = await fetchAcordosService({
        ...filtros,
        empresa_id: filtros?.empresa_id ?? empresaId,
      });
      if (!mountedRef.current) return;
      setAcordos(data);
      setTotalCount(count);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Erro ao carregar acordos');
      console.error('[useAcordos]', e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, empresa?.id, perfil?.empresa_id, JSON.stringify(filtros)]);

  useEffect(() => { fetchAcordos(); }, [fetchAcordos]);

  // ── helpers de mutação local (optimistic updates) ─────────────────────────

  /** Atualiza campos de um ou mais acordos localmente */
  const patchAcordo = useCallback((id: string, partial: Partial<Acordo>) => {
    setAcordos(prev => prev.map(a => a.id === id ? { ...a, ...partial } : a));
  }, []);

  /** Remove um acordo da lista local */
  const removeAcordo = useCallback((id: string) => {
    setAcordos(prev => {
      const next = prev.filter(a => a.id !== id);
      setTotalCount(c => Math.max(0, c - (prev.length - next.length)));
      return next;
    });
  }, []);

  /** Adiciona um acordo ao início da lista local (ex: novo cadastro) */
  const addAcordo = useCallback((acordo: Acordo) => {
    setAcordos(prev => {
      // Evita duplicar se o Realtime já inseriu antes
      if (prev.some(a => a.id === acordo.id)) return prev;
      setTotalCount(c => c + 1);
      return [acordo, ...prev];
    });
  }, []);

  // ── Realtime cirúrgico: patch/add/remove em vez de refetch ───────────────
  const enableRealtime = filtros?.enableRealtime !== false;
  useEffect(() => {
    if (!enableRealtime) return;
    const empresaId = empresa?.id ?? perfil?.empresa_id;
    if (!empresaId) return;

    const channel = supabase
      .channel(`acordos-rt-${empresaId}-${JSON.stringify(filtros ?? {})}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'acordos', filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          if (!mountedRef.current) return;

          if (payload.eventType === 'UPDATE' && payload.new) {
            // Patch cirúrgico — apenas o registro alterado
            setAcordos(prev =>
              prev.map(a => a.id === (payload.new as Acordo).id
                ? { ...a, ...(payload.new as Acordo) }
                : a
              )
            );
          } else if (payload.eventType === 'DELETE' && payload.old) {
            // Remove cirúrgico
            setAcordos(prev => {
              const next = prev.filter(a => a.id !== (payload.old as Acordo).id);
              if (next.length < prev.length) setTotalCount(c => Math.max(0, c - 1));
              return next;
            });
          } else if (payload.eventType === 'INSERT' && payload.new) {
            // Adiciona novo registro (apenas se não existe ainda)
            setAcordos(prev => {
              if (prev.some(a => a.id === (payload.new as Acordo).id)) return prev;
              setTotalCount(c => c + 1);
              return [payload.new as Acordo, ...prev];
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa?.id, perfil?.empresa_id, enableRealtime]);

  return { acordos, totalCount, loading, error, refetch: fetchAcordos, patchAcordo, removeAcordo, addAcordo };
}

/** Hook de métricas do dashboard */
export function useDashboardMetricas() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const [metricas, setMetricas] = useState<MetricasDashboard>({
    acordos_hoje:        0,
    pagos_hoje:          0,
    pendentes_hoje:      0,
    vencidos:            0,
    valor_previsto_hoje: 0,
    valor_recebido_hoje: 0,
    em_acompanhamento:   0,
    total_geral:         0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const empresaId = empresa?.id ?? perfil?.empresa_id;
    if (!perfil || !empresaId) return;
    async function fetchMetricas() {
      const { data, error } = await supabase
        .from('acordos')
        .select('status, valor, vencimento')
        .eq('empresa_id', empresaId);

      if (error) { console.error('[useDashboardMetricas]', error); setLoading(false); return; }
      if (data) {
        setMetricas(calcularMetricasDashboard(
          data as { status: string; valor: unknown; vencimento: string }[]
        ));
      }
      setLoading(false);
    }
    fetchMetricas();
  }, [perfil, empresa?.id, perfil?.empresa_id]);

  return { metricas, loading };
}
