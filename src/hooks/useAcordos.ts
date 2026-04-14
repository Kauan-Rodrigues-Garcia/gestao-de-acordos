/**
 * src/hooks/useAcordos.ts  — v3 (Realtime profissional)
 *
 * ─── Melhorias em relação à v2 ───────────────────────────────────────────────
 *  1. INSERT via Realtime agora busca o registro COMPLETO com joins (perfis,
 *     setores) antes de adicionar à lista — sem dados "crus" na tabela.
 *  2. INSERT é filter-aware: só entra na lista se o novo registro atende aos
 *     filtros ativos (status, tipo, operador, setor, data, busca).
 *  3. UPDATE via Realtime preserva os joins do registro já em memória — merge
 *     cirúrgico em vez de substituir pelo payload sem joins.
 *  4. realtimeStatus exportado: 'connecting' | 'connected' | 'error' | 'off'
 *     — permite mostrar indicador visual de conexão no componente.
 *  5. Canal com nome estável (baseado só em empresa_id), evitando múltiplas
 *     re-subscriptions quando os filtros mudam.
 *
 * ─── API pública ─────────────────────────────────────────────────────────────
 *  acordos            – lista atual (atualiza cirurgicamente via Realtime)
 *  totalCount         – total para paginação
 *  loading            – true apenas na PRIMEIRA carga
 *  error              – mensagem de erro, se houver
 *  realtimeStatus     – estado da conexão Realtime
 *  refetch()          – força recarregamento completo (botão manual)
 *
 *  patchAcordo(id, partial)  – atualiza campos localmente (optimistic)
 *  removeAcordo(id)          – remove item localmente (optimistic)
 *  addAcordo(acordo)         – insere item localmente (optimistic)
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
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

export type RealtimeStatus = 'off' | 'connecting' | 'connected' | 'error';

interface UseAcordosOptions extends FiltrosAcordo {
  enableRealtime?: boolean;
}

export interface UseAcordosResult {
  acordos: Acordo[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  /** Estado da conexão Realtime — use para exibir indicador visual */
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

  const [acordos,       setAcordos]       = useState<Acordo[]>([]);
  const [totalCount,    setTotalCount]    = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('off');

  // Ref p/ evitar setState após desmontagem
  const mountedRef  = useRef(true);
  // Ref p/ saber os filtros atuais dentro dos callbacks do Realtime
  const filtrosRef  = useRef(filtros);
  filtrosRef.current = filtros;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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
  }, [perfil, empresa?.id, perfil?.empresa_id, JSON.stringify(filtros)]);

  useEffect(() => { fetchAcordos(); }, [fetchAcordos]);

  // ── helpers de mutação local (optimistic updates) ─────────────────────────

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

  // ── Realtime cirúrgico ────────────────────────────────────────────────────
  const enableRealtime = filtros?.enableRealtime !== false;

  useEffect(() => {
    if (!enableRealtime) return;
    const empresaId = empresa?.id ?? perfil?.empresa_id;
    if (!empresaId) return;

    setRealtimeStatus('connecting');

    // Canal com nome ESTÁVEL — não muda quando filtros mudam, evita
    // re-subscriptions desnecessárias. Usamos um sufixo único por instância.
    const channelName = `acordos-rt-${empresaId}`;
    let channel: RealtimeChannel;

    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'acordos',
          filter: `empresa_id=eq.${empresaId}`,
        },
        async (payload) => {
          if (!mountedRef.current) return;

          // ── UPDATE: merge cirúrgico preservando joins em memória ────────
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updated = payload.new as Acordo;
            setAcordos(prev =>
              prev.map(a =>
                a.id === updated.id
                  ? {
                      ...a,           // preserva joins (perfis, setores) do registro local
                      ...updated,     // aplica apenas os campos escalares recebidos
                      perfis:  a.perfis  ?? (updated as any).perfis,
                      setores: a.setores ?? (updated as any).setores,
                    }
                  : a
              )
            );
            return;
          }

          // ── DELETE: remoção cirúrgica ────────────────────────────────────
          if (payload.eventType === 'DELETE' && payload.old) {
            const deletedId = (payload.old as Acordo).id;
            setAcordos(prev => {
              const next = prev.filter(a => a.id !== deletedId);
              if (next.length < prev.length) setTotalCount(c => Math.max(0, c - 1));
              return next;
            });
            return;
          }

          // ── INSERT: busca registro COMPLETO com joins antes de adicionar ─
          if (payload.eventType === 'INSERT' && payload.new) {
            const newId = (payload.new as Acordo).id;

            // Evita trabalho extra se o optimistic update já adicionou o item
            setAcordos(prev => {
              if (prev.some(a => a.id === newId)) return prev; // já existe — ignora
              return prev; // não adiciona ainda; espera o fetch abaixo
            });

            // Busca o registro completo com relações
            const { data: full, error: fetchErr } = await supabase
              .from('acordos')
              .select('*, perfis(id, nome, email, perfil, setor_id), setores(id, nome)')
              .eq('id', newId)
              .single();

            if (fetchErr || !full || !mountedRef.current) return;

            const fullAcordo = full as Acordo;

            // Verifica se atende aos filtros ativos antes de inserir
            if (!matchesFiltros(fullAcordo, filtrosRef.current)) return;

            setAcordos(prev => {
              if (prev.some(a => a.id === fullAcordo.id)) return prev; // dedup (optimistic já inseriu)
              setTotalCount(c => c + 1);
              return [fullAcordo, ...prev];
            });
          }
        }
      )
      .subscribe((status) => {
        if (!mountedRef.current) return;
        if (status === 'SUBSCRIBED')   setRealtimeStatus('connected');
        if (status === 'CHANNEL_ERROR') setRealtimeStatus('error');
        if (status === 'CLOSED')        setRealtimeStatus('off');
      });

    return () => {
      supabase.removeChannel(channel);
      if (mountedRef.current) setRealtimeStatus('off');
    };
  // Só recria o canal quando empresa muda — filtros são lidos via ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa?.id, perfil?.empresa_id, enableRealtime]);

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

    // Realtime para métricas: atualiza quando qualquer acordo muda
    const channel = supabase
      .channel(`metricas-rt-${empresaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'acordos', filter: `empresa_id=eq.${empresaId}` },
        () => { fetchMetricas(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [perfil, empresa?.id, perfil?.empresa_id]);

  return { metricas, loading };
}
