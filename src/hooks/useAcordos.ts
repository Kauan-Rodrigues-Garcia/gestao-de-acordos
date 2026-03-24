/**
 * src/hooks/useAcordos.ts
 * Hook centralizado para busca e métricas de acordos.
 * Usa o service layer para queries e cálculos — sem lógica duplicada aqui.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase, Acordo } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { getTodayISO } from '@/lib/index';
import {
  type FiltrosAcordo,
  calcularMetricasDashboard,
  type MetricasDashboard,
} from '@/services/acordos.service';

export type { FiltrosAcordo };

export function useAcordos(filtros?: FiltrosAcordo) {
  const { perfil } = useAuth();
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchAcordos = useCallback(async () => {
    if (!perfil) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('acordos')
        .select('*, perfis(id, nome, email, perfil, setor_id), setores(id, nome)')
        .order('vencimento', { ascending: true });

      if (filtros?.apenas_hoje) query = query.eq('vencimento', getTodayISO());
      if (filtros?.status)      query = query.eq('status', filtros.status);
      if (filtros?.tipo)        query = query.eq('tipo', filtros.tipo);
      if (filtros?.operador_id) query = query.eq('operador_id', filtros.operador_id);
      if (filtros?.setor_id)    query = query.eq('setor_id', filtros.setor_id);
      if (filtros?.vencimento)  query = query.eq('vencimento', filtros.vencimento);
      if (filtros?.data_inicio) query = query.gte('vencimento', filtros.data_inicio);
      if (filtros?.data_fim)    query = query.lte('vencimento', filtros.data_fim);
      if (filtros?.busca) {
        query = query.or(
          `nome_cliente.ilike.%${filtros.busca}%,nr_cliente.ilike.%${filtros.busca}%,whatsapp.ilike.%${filtros.busca}%`
        );
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setAcordos((data as Acordo[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar acordos');
      console.error('[useAcordos]', e);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, JSON.stringify(filtros)]);

  useEffect(() => { fetchAcordos(); }, [fetchAcordos]);

  return { acordos, loading, error, refetch: fetchAcordos };
}

/** Hook de métricas do dashboard — usa calcularMetricasDashboard do service */
export function useDashboardMetricas() {
  const { perfil } = useAuth();
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
    if (!perfil) return;
    async function fetchMetricas() {
      const { data, error } = await supabase
        .from('acordos')
        .select('status, valor, vencimento');

      if (error) { console.error('[useDashboardMetricas]', error); setLoading(false); return; }
      if (data) {
        setMetricas(calcularMetricasDashboard(
          data as { status: string; valor: unknown; vencimento: string }[]
        ));
      }
      setLoading(false);
    }
    fetchMetricas();
  }, [perfil]);

  return { metricas, loading };
}
