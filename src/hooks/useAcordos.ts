/**
 * src/hooks/useAcordos.ts  — v4 (Fase 3: canal centralizado)
 *
 * ─── O QUE MUDOU EM RELAÇÃO À v3 ─────────────────────────────────────────────
 *  • Removido: canal Supabase próprio (causava conflito com N instâncias do hook)
 *  • Adicionado: subscribe/unsubscribe no RealtimeAcordosProvider (1 canal global)
 *  • realtimeStatus agora reflete o estado do canal central (compartilhado)
 *  • Cada instância recebe o mesmo evento e aplica matchesFiltros independentemente
 *  • Canal de métricas (useDashboardMetricas) também migrado para o provider
 *
 * ─── API PÚBLICA ─────────────────────────────────────────────────────────────
 *  acordos            – lista atual (atualiza cirurgicamente)
 *  totalCount         – total para paginação
 *  loading            – true apenas na PRIMEIRA carga
 *  error              – mensagem de erro, se houver
 *  realtimeStatus     – estado do canal central: 'connecting'|'connected'|'error'|'off'
 *  refetch()          – força recarregamento completo (botão manual)
 *  patchAcordo(id, partial)  – atualiza campos localmente (optimistic)
 *  removeAcordo(id)          – remove item localmente (optimistic)
 *  addAcordo(acordo)         – insere item localmente (optimistic)
 */
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase, Acordo } from '@/lib/supabase';
import { useAuth }    from './useAuth';
import { useEmpresa } from './useEmpresa';
import { getTodayISO } from '@/lib/index';
import {
  useRealtimeAcordos,
  type AcordoRealtimeEvent,
  type RealtimeStatus,
} from '@/providers/RealtimeAcordosProvider';
import {
  type FiltrosAcordo,
  fetchAcordos as fetchAcordosService,
  calcularMetricasDashboard,
  type MetricasDashboard,
} from '@/services/acordos.service';

export type { FiltrosAcordo };
export type { RealtimeStatus };

interface UseAcordosOptions extends FiltrosAcordo {
  /**
   * Desabilita o Realtime nesta instância.
   * Útil para listas secundárias/somente-leitura que não precisam de updates ao vivo.
   * Padrão: true (habilitado).
   */
  enableRealtime?: boolean;
}

export interface UseAcordosResult {
  acordos: Acordo[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  /** Estado do canal Realtime central — use para indicador visual */
  realtimeStatus: RealtimeStatus;
  refetch: () => Promise<void>;
  /** Atualiza campos de um acordo localmente (sem novo fetch) */
  patchAcordo: (id: string, partial: Partial<Acordo>) => void;
  /** Remove um acordo da lista local (sem novo fetch) */
  removeAcordo: (id: string) => void;
  /** Adiciona um acordo ao início da lista local (sem novo fetch) */
  addAcordo: (acordo: Acordo) => void;
}

// ─── Helper: verifica se um acordo atende os filtros ativos ──────────────────
function matchesFiltros(acordo: Acordo, filtros?: UseAcordosOptions): boolean {
  if (!filtros) return true;

  if (filtros.status && acordo.status !== filtros.status) return false;
  if (filtros.tipo   && acordo.tipo   !== filtros.tipo)   return false;

  if (filtros.operador_id && acordo.operador_id !== filtros.operador_id) return false;
  if (filtros.setor_id    && acordo.setor_id    !== filtros.setor_id)    return false;
  if (filtros.empresa_id  && acordo.empresa_id  !== filtros.empresa_id)  return false;

  const venc = acordo.vencimento ?? '';
  if (filtros.apenas_hoje && venc !== getTodayISO())     return false;
  if (filtros.vencimento  && venc !== filtros.vencimento) return false;
  if (filtros.data_inicio && venc < filtros.data_inicio) return false;
  if (filtros.data_fim    && venc > filtros.data_fim)    return false;

  if (filtros.busca) {
    const b = filtros.busca.toLowerCase();
    const nome = (acordo.nome_cliente ?? '').toLowerCase();
    const nr   = String(acordo.nr_cliente ?? '').toLowerCase();
    const wa   = (acordo.whatsapp ?? '').toLowerCase();
    if (!nome.includes(b) && !nr.includes(b) && !wa.includes(b)) return false;
  }

  return true;
}

// ─── Hook principal ───────────────────────────────────────────────────────────
export function useAcordos(filtros?: UseAcordosOptions): UseAcordosResult {
  const { perfil }   = useAuth();
  const { empresa }  = useEmpresa();

  const [acordos,    setAcordos]    = useState<Acordo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  // Canal centralizado
  const { status: realtimeStatus, subscribe, unsubscribe } = useRealtimeAcordos();

  // Refs para guards e acesso estável a filtros dentro de callbacks
  const mountedRef  = useRef(true);
  const filtrosRef  = useRef(filtros);
  filtrosRef.current = filtros;

  // ID único e estável por instância do hook
  const instanceId = useRef(`useAcordos-${Math.random().toString(36).slice(2, 10)}`).current;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Estabiliza filtros com useMemo ────────────────────────────────────────────
  // Serializa cada campo individualmente. Isso evita recriar useCallback
  // quando a referencia do objeto filtros muda sem mudar os valores.
  const filtrosEstavel = useMemo(() => {
    if (!filtros) return '';
    const {
      status, tipo, operador_id, setor_id, equipe_id, empresa_id,
      vencimento, data_inicio, data_fim, busca,
      apenas_hoje, page, perPage, enableRealtime,
    } = filtros;
    return JSON.stringify({
      status, tipo, operador_id, setor_id, equipe_id, empresa_id,
      vencimento, data_inicio, data_fim, busca,
      apenas_hoje, page, perPage, enableRealtime,
    });
  }, [
    filtros?.status, filtros?.tipo, filtros?.operador_id, filtros?.setor_id,
    filtros?.equipe_id, filtros?.empresa_id, filtros?.vencimento, filtros?.data_inicio, filtros?.data_fim,
    filtros?.busca, filtros?.apenas_hoje, filtros?.page, filtros?.perPage,
    filtros?.enableRealtime,
  ]);

  // ── fetch completo (montagem ou refresh manual) ───────────────────────────
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
  }, [perfil, empresa?.id, perfil?.empresa_id, filtrosEstavel]);

  useEffect(() => { fetchAcordos(); }, [fetchAcordos]);

  // ── Optimistic update helpers ─────────────────────────────────────────────

  const patchAcordo = useCallback((id: string, partial: Partial<Acordo>) => {
    setAcordos(prev => prev.map(a => a.id === id ? { ...a, ...partial } : a));
  }, []);

  const removeAcordo = useCallback((id: string) => {
    setAcordos(prev => {
      const next = prev.filter(a => a.id !== id);
      if (next.length < prev.length) setTotalCount(c => Math.max(0, c - 1));
      return next;
    });
  }, []);

  const addAcordo = useCallback((acordo: Acordo) => {
    setAcordos(prev => {
      if (prev.some(a => a.id === acordo.id)) return prev; // dedup
      setTotalCount(c => c + 1);
      return [acordo, ...prev];
    });
  }, []);

  // ── Subscribe no canal central (sem criar canal próprio) ──────────────────
  const enableRealtime = filtros?.enableRealtime !== false;

  useEffect(() => {
    if (!enableRealtime) return;

    const handleEvent = (event: AcordoRealtimeEvent) => {
      if (!mountedRef.current) return;

      // ── UPDATE: merge cirúrgico preservando joins locais ─────────────────
      if (event.eventType === 'UPDATE' && event.newRecord) {
        const updated = event.newRecord;
        setAcordos(prev =>
          prev.map(a =>
            a.id === updated.id
              ? {
                  ...a,
                  ...updated,
                  // Preserva perfis/setores já carregados — o payload UPDATE
                  // não inclui joins, mas o registro local já os tem.
                  perfis:  a.perfis  ?? (updated as any).perfis,
                  setores: a.setores ?? (updated as any).setores,
                }
              : a
          )
        );
        return;
      }

      // ── DELETE: remove da lista local ────────────────────────────────────
      if (event.eventType === 'DELETE' && event.oldRecord?.id) {
        const deletedId = event.oldRecord.id;
        setAcordos(prev => {
          const next = prev.filter(a => a.id !== deletedId);
          if (next.length < prev.length) setTotalCount(c => Math.max(0, c - 1));
          return next;
        });
        return;
      }

      // ── INSERT: adiciona apenas se atende os filtros ativos ──────────────
      // O newRecord já vem com joins completos (buscado no provider).
      if (event.eventType === 'INSERT' && event.newRecord) {
        const full = event.newRecord;
        if (!matchesFiltros(full, filtrosRef.current)) return;
        setAcordos(prev => {
          if (prev.some(a => a.id === full.id)) return prev; // dedup (optimistic já inseriu)
          setTotalCount(c => c + 1);
          return [full, ...prev];
        });
      }
    };

    subscribe(instanceId, handleEvent);
    return () => unsubscribe(instanceId);
  }, [enableRealtime, subscribe, unsubscribe, instanceId]);

  return {
    acordos, totalCount, loading, error, realtimeStatus,
    refetch: fetchAcordos,
    patchAcordo, removeAcordo, addAcordo,
  };
}

// ─── Hook de métricas do dashboard ───────────────────────────────────────────
export function useDashboardMetricas() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const { subscribe, unsubscribe } = useRealtimeAcordos();

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
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ID estável para o subscriber de métricas
  const instanceId = useRef(`useDashboardMetricas-${Math.random().toString(36).slice(2, 10)}`).current;

  const fetchMetricas = useCallback(async () => {
    const empresaId = empresa?.id ?? perfil?.empresa_id;
    if (!perfil || !empresaId) return;
    const { data, error } = await supabase
      .from('acordos')
      .select('status, valor, vencimento')
      .eq('empresa_id', empresaId);
    if (error) { console.error('[useDashboardMetricas]', error); if (mountedRef.current) setLoading(false); return; }
    if (data && mountedRef.current) {
      setMetricas(calcularMetricasDashboard(
        data as { status: string; valor: unknown; vencimento: string }[]
      ));
    }
    if (mountedRef.current) setLoading(false);
  }, [perfil, empresa?.id, perfil?.empresa_id]);

  useEffect(() => { fetchMetricas(); }, [fetchMetricas]);

  // Subscribe no canal central — refaz as métricas a cada mudança
  useEffect(() => {
    subscribe(instanceId, () => { fetchMetricas(); });
    return () => unsubscribe(instanceId);
  }, [subscribe, unsubscribe, instanceId, fetchMetricas]);

  return { metricas, loading };
}
