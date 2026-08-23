/**
 * src/hooks/useAcordos.ts  — v5 (React Query)
 *
 * ─── O QUE MUDOU EM RELAÇÃO À v4 ─────────────────────────────────────────────
 *  • Internamente migrado para @tanstack/react-query (useQuery / setQueryData)
 *  • Estado manual (useState) removido — React Query gerencia loading/error/cache
 *  • staleTime: 60s; refetchOnWindowFocus desativado — RealtimeAcordosProvider mantém o cache em sincronia
 *  • optimistic updates via queryClient.setQueryData (mesmo comportamento público)
 *  • API pública (UseAcordosResult) 100% compatível — zero mudanças nos callers
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
import { useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  /**
   * Lista de operador_id resolvidos para filtrar por equipe no realtime.
   * Preenchido internamente quando equipe_id é fornecido.
   */
  _operadoresEquipeIds?: string[];
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

type QueryData = { data: Acordo[]; count: number };

// ─── Helper: verifica se um acordo atende os filtros ativos ──────────────────
function matchesFiltros(acordo: Acordo, filtros?: UseAcordosOptions): boolean {
  if (!filtros) return true;

  if (filtros.status && acordo.status !== filtros.status) return false;
  if (filtros.tipo   && acordo.tipo   !== filtros.tipo)   return false;

  if (filtros.operador_id && acordo.operador_id !== filtros.operador_id) return false;
  if (filtros.setor_id    && acordo.setor_id    !== filtros.setor_id)    return false;
  if (filtros.empresa_id  && acordo.empresa_id  !== filtros.empresa_id)  return false;
  if (filtros._operadoresEquipeIds) {
    if (!filtros._operadoresEquipeIds.includes(acordo.operador_id)) return false;
  }

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
  const { perfil }       = useAuth();
  const { empresa }      = useEmpresa();
  const queryClient      = useQueryClient();

  const empresaId = empresa?.id ?? perfil?.empresa_id;

  // ── Estabiliza filtros com useMemo ────────────────────────────────────────
  const filtrosEstavel = useMemo(() => {
    if (!filtros) return '';
    const {
      status, tipo, operador_id, setor_id, equipe_id, empresa_id,
      vencimento, data_inicio, data_fim, busca,
      apenas_hoje, page, perPage, enableRealtime, prioritize_today,
      status_exceto, tag_ids,
    } = filtros;
    return JSON.stringify({
      status, tipo, operador_id, setor_id, equipe_id, empresa_id,
      vencimento, data_inicio, data_fim, busca,
      apenas_hoje, page, perPage, enableRealtime, prioritize_today,
      status_exceto, tag_ids,
    });
  }, [
    filtros?.status, filtros?.tipo, filtros?.operador_id, filtros?.setor_id,
    filtros?.equipe_id, filtros?.empresa_id, filtros?.vencimento, filtros?.data_inicio,
    filtros?.data_fim, filtros?.busca, filtros?.apenas_hoje, filtros?.page,
    filtros?.perPage, filtros?.enableRealtime, filtros?.prioritize_today,
    // `join` porque array literal quebra a comparacao referencial das deps.
    filtros?.status_exceto?.join(','),
    filtros?.tag_ids?.join(','),
  ]);

  const queryKey = useMemo(
    () => ['acordos', empresaId ?? '', filtrosEstavel] as const,
    [empresaId, filtrosEstavel],
  );

  // ── React Query — gerencia loading, error, cache e refetch-on-focus ───────
  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      fetchAcordosService({
        ...filtros,
        empresa_id: filtros?.empresa_id ?? empresaId,
      }),
    enabled: !!perfil && !!empresaId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ── Resolver operadores da equipe (para filtro de realtime) ───────────────
  const equipeIdsRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (!filtros?.equipe_id) { equipeIdsRef.current = null; return; }
    const eId        = filtros.equipe_id;
    const eEmpresaId = filtros.empresa_id ?? empresa?.id ?? perfil?.empresa_id;
    let q = supabase.from('perfis').select('id').eq('equipe_id', eId);
    if (eEmpresaId) q = q.eq('empresa_id', eEmpresaId);
    q.then(({ data: rows }) => {
      equipeIdsRef.current = ((rows as { id: string }[]) ?? []).map(m => m.id);
    });
  }, [filtros?.equipe_id, filtros?.empresa_id, empresa?.id, perfil?.empresa_id]);

  // filtrosRef estável para o handler do realtime (evita re-subscribe)
  const filtrosRef = useRef<UseAcordosOptions | undefined>(filtros);
  useEffect(() => {
    filtrosRef.current = filtros
      ? { ...filtros, ...(equipeIdsRef.current !== null ? { _operadoresEquipeIds: equipeIdsRef.current } : {}) }
      : filtros;
  });

  // ── Optimistic updates via queryClient.setQueryData ───────────────────────
  const patchAcordo = useCallback((id: string, partial: Partial<Acordo>) => {
    queryClient.setQueryData<QueryData>(queryKey, old => {
      if (!old) return old;
      return { ...old, data: old.data.map(a => a.id === id ? { ...a, ...partial } : a) };
    });
  }, [queryClient, queryKey]);

  const removeAcordo = useCallback((id: string) => {
    queryClient.setQueryData<QueryData>(queryKey, old => {
      if (!old) return old;
      const next    = old.data.filter(a => a.id !== id);
      const removed = old.data.length - next.length;
      return { data: next, count: Math.max(0, old.count - removed) };
    });
  }, [queryClient, queryKey]);

  const addAcordo = useCallback((acordo: Acordo) => {
    queryClient.setQueryData<QueryData>(queryKey, old => {
      if (!old) return old;
      if (old.data.some(a => a.id === acordo.id)) return old; // dedup
      return { data: [acordo, ...old.data], count: old.count + 1 };
    });
  }, [queryClient, queryKey]);

  // ── Subscribe no canal central ────────────────────────────────────────────
  const { status: realtimeStatus, subscribe, unsubscribe } = useRealtimeAcordos();
  const instanceId    = useRef(`useAcordos-${Math.random().toString(36).slice(2, 10)}`).current;
  const enableRealtime = filtros?.enableRealtime !== false;

  useEffect(() => {
    if (!enableRealtime) return;

    const handleEvent = (event: AcordoRealtimeEvent) => {
      // ── UPDATE: merge cirúrgico preservando joins locais ─────────────────
      if (event.eventType === 'UPDATE' && event.newRecord) {
        const updated = event.newRecord;
        queryClient.setQueryData<QueryData>(queryKey, old => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map(a =>
              a.id === updated.id
                ? {
                    ...a,
                    ...updated,
                    perfis:  a.perfis  ?? (updated as Acordo & { perfis?: Acordo['perfis'] }).perfis,
                    setores: a.setores ?? (updated as Acordo & { setores?: Acordo['setores'] }).setores,
                  }
                : a
            ),
          };
        });
        return;
      }

      // ── DELETE: remove da lista local ────────────────────────────────────
      if (event.eventType === 'DELETE' && event.oldRecord?.id) {
        removeAcordo(event.oldRecord.id);
        return;
      }

      // ── INSERT: adiciona apenas se atende os filtros ativos ──────────────
      if (event.eventType === 'INSERT' && event.newRecord) {
        const full = event.newRecord;
        if (!matchesFiltros(full, filtrosRef.current)) return;
        queryClient.setQueryData<QueryData>(queryKey, old => {
          if (!old) return old;
          if (old.data.some(a => a.id === full.id)) return old; // dedup
          return { data: [full, ...old.data], count: old.count + 1 };
        });
      }
    };

    subscribe(instanceId, handleEvent);
    return () => unsubscribe(instanceId);
  }, [enableRealtime, subscribe, unsubscribe, instanceId, queryClient, queryKey, removeAcordo]);

  // ── loading: inclui a espera pela sessão ──────────────────────────────────
  // `isLoading` do React Query é false enquanto a query está DESABILITADA
  // (`enabled: !!perfil && !!empresaId`). Sem o termo abaixo, o intervalo entre
  // montar a tela e o perfil/empresa chegarem reportava loading=false com lista
  // vazia — e a tela de Acordos renderiza `{loading ? <TableSkeleton/> : tabela}`,
  // ou seja, piscava "nenhum acordo" antes de buscar. Do ponto de vista de quem
  // olha, ainda está carregando.
  const aguardandoSessao = (!perfil || !empresaId) && !data;

  return {
    acordos:    data?.data   ?? [],
    totalCount: data?.count  ?? 0,
    loading:    isLoading || aguardandoSessao,
    // Erro que não é Error (string lançada, objeto solto) não vai cru para a
    // tela: `String(err)` já exibiu coisas como "string-error" para o usuário.
    error:      error instanceof Error ? error.message
              : error                  ? 'Erro ao carregar acordos'
              : null,
    realtimeStatus,
    refetch:    async () => { await refetch(); },
    patchAcordo, removeAcordo, addAcordo,
  };
}

/**
 * Janela de agrupamento das releituras de métrica disparadas pelo realtime.
 *
 * Exportada para o teste não cravar o número: quem muda a constante muda o
 * teste junto, sem descobrir por um teste vermelho que não explica nada.
 */
export const MS_AGRUPAMENTO_METRICAS = 500;

// ─── Hook de métricas do dashboard ───────────────────────────────────────────
export function useDashboardMetricas() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const queryClient = useQueryClient();
  const { subscribe, unsubscribe } = useRealtimeAcordos();

  const empresaId = empresa?.id ?? perfil?.empresa_id;
  const instanceId = useRef(`useDashboardMetricas-${Math.random().toString(36).slice(2, 10)}`).current;

  const { data: metricas, isLoading } = useQuery({
    queryKey: ['metricas-dashboard', empresaId ?? ''],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acordos')
        .select('status, valor, vencimento')
        .eq('empresa_id', empresaId!);
      if (error) throw error;
      return calcularMetricasDashboard(
        (data ?? []) as { status: string; valor: unknown; vencimento: string }[]
      );
    },
    enabled: !!perfil && !!empresaId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  /*
   * Invalida o cache de métricas em qualquer evento do realtime — agrupado.
   *
   * Sem o agrupamento, uma importação de 300 acordos disparava 300 eventos e,
   * com eles, 300 releituras de `status, valor, vencimento` da empresa inteira.
   * O resultado era o oposto do pretendido: a tela ficava MAIS lenta justamente
   * quando havia mais dado chegando.
   *
   * Meio segundo é curto o bastante para parecer instantâneo a quem acabou de
   * marcar um acordo como pago, e longo o bastante para uma rajada de
   * importação virar uma consulta só.
   *
   * O React Query preserva a identidade das partes que não mudaram
   * (`structuralSharing`, padrão na v5), então uma releitura que devolve os
   * mesmos números não re-renderiza os cards.
   */
  const agrupador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    subscribe(instanceId, () => {
      if (agrupador.current) clearTimeout(agrupador.current);
      agrupador.current = setTimeout(() => {
        agrupador.current = null;
        queryClient.invalidateQueries({ queryKey: ['metricas-dashboard', empresaId ?? ''] });
      }, MS_AGRUPAMENTO_METRICAS);
    });
    return () => {
      if (agrupador.current) clearTimeout(agrupador.current);
      unsubscribe(instanceId);
    };
  }, [subscribe, unsubscribe, instanceId, queryClient, empresaId]);

  const defaultMetricas: MetricasDashboard = {
    acordos_hoje:        0,
    pagos_hoje:          0,
    pendentes_hoje:      0,
    vencidos:            0,
    valor_previsto_hoje: 0,
    valor_recebido_hoje: 0,
    em_acompanhamento:   0,
    total_geral:         0,
  };

  // Mesma correção do useAcordos: query desabilitada (sem perfil/empresa ainda)
  // tem isLoading=false, e os cards mostrariam zeros como se fossem o resultado.
  const aguardandoSessao = (!perfil || !empresaId) && !metricas;

  return { metricas: metricas ?? defaultMetricas, loading: isLoading || aguardandoSessao };
}
