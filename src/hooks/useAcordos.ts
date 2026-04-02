/**
 * src/hooks/useAcordos.ts
 * Hook centralizado para busca e métricas de acordos.
 * Usa o service layer para queries e cálculos — sem lógica duplicada aqui.
 */
import { useEffect, useState, useCallback } from 'react';
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

export function useAcordos(filtros?: FiltrosAcordo) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchAcordos = useCallback(async () => {
    if (!perfil || !empresa?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { data, count } = await fetchAcordosService({
        ...filtros,
        empresa_id: filtros?.empresa_id ?? empresa?.id,
      });
      setAcordos(data);
      setTotalCount(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar acordos');
      console.error('[useAcordos]', e);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, empresa?.id, JSON.stringify(filtros)]);

  useEffect(() => { fetchAcordos(); }, [fetchAcordos]);

  return { acordos, totalCount, loading, error, refetch: fetchAcordos };
}

/** Hook de métricas do dashboard — usa calcularMetricasDashboard do service */
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
    if (!perfil || !empresa?.id) return;
    async function fetchMetricas() {
      const { data, error } = await supabase
        .from('acordos')
        .select('status, valor, vencimento')
        .eq('empresa_id', empresa.id);

      if (error) { console.error('[useDashboardMetricas]', error); setLoading(false); return; }
      if (data) {
        setMetricas(calcularMetricasDashboard(
          data as { status: string; valor: unknown; vencimento: string }[]
        ));
      }
      setLoading(false);
    }
    fetchMetricas();
  }, [perfil, empresa?.id]);

  return { metricas, loading };
}
