/**
 * src/services/acordos.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Service layer para operações com acordos.
 * Centraliza queries, filtros, cálculos e validações.
 */
import { supabase, Acordo } from '@/lib/supabase';
import { safeNum, sumSafe } from '@/lib/money';
import { getTodayISO } from '@/lib/index';

export interface FiltrosAcordo {
  status?: string;
  tipo?: string;
  operador_id?: string;
  setor_id?: string;
  data_inicio?: string;
  data_fim?: string;
  busca?: string;
  vencimento?: string;
  apenas_hoje?: boolean;
  page?: number;
  perPage?: number;
}

/** Busca acordos com filtros opcionais e suporte a paginação */
export async function fetchAcordos(filtros?: FiltrosAcordo): Promise<{ data: Acordo[], count: number }> {
  let query = supabase
    .from('acordos')
    .select('*, perfis(id, nome, email, perfil, setor_id), setores(id, nome)', { count: 'exact' })
    .order('vencimento', { ascending: true });

  if (filtros?.apenas_hoje) query = query.eq('vencimento', getTodayISO());
  if (filtros?.status)      query = query.eq('status', filtros.status);
  if (filtros?.tipo)        query = query.eq('tipo', filtros.tipo);
  if (filtros?.operador_id) query = query.eq('operador_id', filtros.operador_id);
  if (filtros?.setor_id)    query = query.eq('setor_id', filtros.setor_id);
  if (filtros?.vencimento)  query = query.eq('vencimento', filtros.vencimento);
  if (filtros?.data_inicio) query = query.gte('vencimento', filtros.data_inicio);
  if (filtros?.data_fim)    query = query.lte('vencimento', filtros.data_fim);

  if (filtros?.page && filtros?.perPage) {
    const from = (filtros.page - 1) * filtros.perPage;
    const to = from + filtros.perPage - 1;
    query = query.range(from, to);
  }

  if (filtros?.busca) {
    query = query.or(
      `nome_cliente.ilike.%${filtros.busca}%,nr_cliente.ilike.%${filtros.busca}%,whatsapp.ilike.%${filtros.busca}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    data: (data as Acordo[]) || [],
    count: count || 0
  };
}

// ─── Cálculos agregados ──────────────────────────────────────────────────

export interface MetricasAcordos {
  total:              number;
  pagos:              number;
  pendentes:          number;
  vencidos:           number;
  em_acompanhamento:  number;
  cancelados:         number;
  valorTotal:         number;
  valorPago:          number;
  valorPendente:      number;
  valorVencido:       number;
}

/** Calcula métricas a partir de uma lista de acordos (sem query extra) */
export function calcularMetricas(acordos: Acordo[]): MetricasAcordos {
  const hoje = getTodayISO();

  const pagos           = acordos.filter(a => a.status === 'pago');
  const pendentes       = acordos.filter(a => a.status === 'pendente');
  const emAcompanhamento = acordos.filter(a => a.status === 'em_acompanhamento');
  const cancelados      = acordos.filter(a => a.status === 'cancelado');
  const vencidos        = acordos.filter(a =>
    !['pago', 'cancelado'].includes(a.status) && a.vencimento < hoje
  );

  return {
    total:             acordos.length,
    pagos:             pagos.length,
    pendentes:         pendentes.length + emAcompanhamento.length,
    vencidos:          vencidos.length,
    em_acompanhamento: emAcompanhamento.length,
    cancelados:        cancelados.length,
    valorTotal:    sumSafe(acordos.map(a => a.valor)),
    valorPago:     sumSafe(pagos.map(a => a.valor)),
    valorPendente: sumSafe([...pendentes, ...emAcompanhamento].map(a => a.valor)),
    valorVencido:  sumSafe(vencidos.map(a => a.valor)),
  };
}

export interface MetricasMes {
  inicioMes: string;
  fimMes:    string;
  acordosNoMes:     Acordo[];
  valorPrevisto:    number;  // todos os acordos com vencimento no mês
  valorRecebido:    number;  // pagos com vencimento no mês
  valorAReceber:    number;  // pendentes/acompanhamento com vencimento no mês
  pagosNoMes:       number;
  pendentesNoMes:   number;
  vencidosNoMes:    number;
}

/** Calcula métricas do mês corrente para uma lista de acordos */
export function calcularMetricasMes(acordos: Acordo[]): MetricasMes {
  const hoje = getTodayISO();
  const d = new Date();
  const inicioMes = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  const fimMes    = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];

  const noMes = acordos.filter(a =>
    a.vencimento >= inicioMes && a.vencimento <= fimMes
  );
  const pagosNoMes   = noMes.filter(a => a.status === 'pago');
  const abertosNoMes = noMes.filter(a => !['pago', 'cancelado'].includes(a.status));
  const vencidosNoMes = noMes.filter(a =>
    !['pago', 'cancelado'].includes(a.status) && a.vencimento < hoje
  );

  return {
    inicioMes,
    fimMes,
    acordosNoMes:   noMes,
    valorPrevisto:  sumSafe(noMes.map(a => a.valor)),
    valorRecebido:  sumSafe(pagosNoMes.map(a => a.valor)),
    valorAReceber:  sumSafe(abertosNoMes.map(a => a.valor)),
    pagosNoMes:     pagosNoMes.length,
    pendentesNoMes: abertosNoMes.length,
    vencidosNoMes:  vencidosNoMes.length,
  };
}

/** Métricas do dashboard (hoje) */
export interface MetricasDashboard {
  acordos_hoje:       number;
  pagos_hoje:         number;
  pendentes_hoje:     number;
  vencidos:           number;
  valor_previsto_hoje: number;
  valor_recebido_hoje: number;
  em_acompanhamento:  number;
  total_geral:        number;
}

export function calcularMetricasDashboard(
  acordos: { status: string; valor: unknown; vencimento: string }[]
): MetricasDashboard {
  const hoje = getTodayISO();
  const hoje_arr = acordos.filter(a => a.vencimento === hoje);
  return {
    total_geral:          acordos.length,
    acordos_hoje:         hoje_arr.length,
    pagos_hoje:           hoje_arr.filter(a => a.status === 'pago').length,
    pendentes_hoje:       hoje_arr.filter(a => a.status === 'pendente').length,
    vencidos:             acordos.filter(a => a.vencimento < hoje && !['pago','cancelado'].includes(a.status)).length,
    valor_previsto_hoje:  sumSafe(hoje_arr.map(a => a.valor)),
    valor_recebido_hoje:  sumSafe(hoje_arr.filter(a => a.status === 'pago').map(a => a.valor)),
    em_acompanhamento:    acordos.filter(a => a.status === 'em_acompanhamento').length,
  };
}
