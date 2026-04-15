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
  empresa_id?: string;
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
  // Buscamos TODOS os registros e depois deduplicamos client-side.
  // Motivo: precisamos mostrar a parcela MAIS RECENTE de cada grupo
  // (ex: após Reagendar criar parcela 2, ela substitui parcela 1 na lista).
  let query = supabase
    .from('acordos')
    .select('*, perfis(id, nome, email, perfil, setor_id), setores(id, nome)', { count: 'exact' })
    .order('vencimento', { ascending: true });

  if (filtros?.apenas_hoje) query = query.eq('vencimento', getTodayISO());
  if (filtros?.status)      query = query.eq('status', filtros.status);
  if (filtros?.tipo)        query = query.eq('tipo', filtros.tipo);
  if (filtros?.operador_id) query = query.eq('operador_id', filtros.operador_id);
  if (filtros?.setor_id)    query = query.eq('setor_id', filtros.setor_id);
  if (filtros?.empresa_id)  query = query.eq('empresa_id', filtros.empresa_id);
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

  // ── Deduplicar: por acordo_grupo_id manter apenas o de maior numero_parcela ──
  // Isso garante que reagendamentos (parcela 2, 3…) apareçam na lista
  // substituindo a parcela anterior, e não criem linhas duplicadas.
  const todos = (data as Acordo[]) || [];
  const deduped: Acordo[] = [];
  const grupos = new Map<string, Acordo>();
  for (const a of todos) {
    if (!a.acordo_grupo_id) {
      // Sem grupo → sempre exibir
      deduped.push(a);
    } else {
      const existente = grupos.get(a.acordo_grupo_id);
      if (!existente || (a.numero_parcela ?? 1) > (existente.numero_parcela ?? 1)) {
        grupos.set(a.acordo_grupo_id, a);
      }
    }
  }
  // Adicionar a parcela mais recente de cada grupo
  grupos.forEach(a => deduped.push(a));
  // Re-ordenar por vencimento (a deduplicação bagunça a ordem)
  deduped.sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  return {
    data: deduped,
    count: deduped.length,
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

  const pagos            = acordos.filter(a => a.status === 'pago');
  const verificarPendentes = acordos.filter(a => a.status === 'verificar_pendente');
  const naoPagos         = acordos.filter(a => a.status === 'nao_pago');
  const vencidos         = acordos.filter(a =>
    !['pago', 'nao_pago'].includes(a.status) && a.vencimento < hoje
  );

  return {
    total:             acordos.length,
    pagos:             pagos.length,
    pendentes:         verificarPendentes.length,
    vencidos:          vencidos.length,
    em_acompanhamento: 0,
    cancelados:        naoPagos.length,
    valorTotal:    sumSafe(acordos.map(a => a.valor)),
    valorPago:     sumSafe(pagos.map(a => a.valor)),
    valorPendente: sumSafe(verificarPendentes.map(a => a.valor)),
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
  const abertosNoMes = noMes.filter(a => !['pago', 'nao_pago'].includes(a.status));
  const vencidosNoMes = noMes.filter(a =>
    !['pago', 'nao_pago'].includes(a.status) && a.vencimento < hoje
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

/**
 * Verifica se um NR já existe para a empresa em acordos ATIVOS (pendente ou pago).
 * Acordos com status `nao_pago` são considerados inativos e NÃO bloqueiam o NR.
 *
 * @param nr           - Valor do NR a verificar (nr_cliente para Bookplay, instituicao para PaguePay)
 * @param empresaId    - ID da empresa
 * @param campo        - Coluna a verificar: 'nr_cliente' (Bookplay) | 'instituicao' (PaguePay)
 * @param acordoIdExcluir - ID do acordo atual a ignorar (útil na edição)
 */
export async function verificarNrDuplicado(
  nr: string,
  empresaId: string,
  acordoIdExcluirOuCampo?: string,
  campoParam?: 'nr_cliente' | 'instituicao'
): Promise<{
  duplicado: boolean;
  statusExistente?: string;
  acordoIdExistente?: string;
  operadorIdExistente?: string;
  operadorNomeExistente?: string;
}> {
  if (!nr?.trim()) return { duplicado: false };

  // Compatibilidade retroativa: se o 3º argumento parecer um UUID, é o acordoIdExcluir
  // Se não for UUID, é o campo (forma antiga da assinatura nunca usou campo como 3º arg,
  // mas garantimos via campoParam explícito).
  const acordoIdExcluir = acordoIdExcluirOuCampo ?? undefined;
  const campo: 'nr_cliente' | 'instituicao' = campoParam ?? 'nr_cliente';

  const colSelect = `id, status, operador_id, ${campo}, perfis(nome)`;

  let query = supabase
    .from('acordos')
    .select(colSelect)
    .eq(campo, nr.trim())
    .eq('empresa_id', empresaId)
    .neq('status', 'nao_pago')   // acordos não-pagos NÃO bloqueiam reutilização do NR
    .limit(1);

  if (acordoIdExcluir) {
    query = query.neq('id', acordoIdExcluir);
  }

  const { data } = await query;
  if (data && data.length > 0) {
    const item = data[0] as any;
    return {
      duplicado: true,
      statusExistente: item.status,
      acordoIdExistente: item.id,
      operadorIdExistente: item.operador_id,
      operadorNomeExistente: (item.perfis as any)?.nome ?? null,
    };
  }
  return { duplicado: false };
}

/**
 * Verifica um lote de NRs em uma única query — usado na importação em massa.
 * Retorna um Map: nr → { acordoId, operadorId, operadorNome }
 * Apenas acordos ativos (status ≠ nao_pago) são considerados duplicados.
 *
 * @param nrs      - Lista de NRs a verificar
 * @param empresaId
 * @param campo    - Coluna: 'nr_cliente' (Bookplay, padrão) | 'instituicao' (PaguePay)
 */
export async function verificarNrsDuplicadosEmLote(
  nrs: string[],
  empresaId: string,
  campo: 'nr_cliente' | 'instituicao' = 'nr_cliente'
): Promise<Map<string, { acordoId: string; operadorId: string; operadorNome: string }>> {
  const resultado = new Map<string, { acordoId: string; operadorId: string; operadorNome: string }>();
  const nrsTrimados = [...new Set(nrs.map(n => n.trim()).filter(Boolean))];
  if (!nrsTrimados.length) return resultado;

  const colSelect = `id, ${campo}, operador_id, perfis(nome)`;

  const { data } = await supabase
    .from('acordos')
    .select(colSelect)
    .eq('empresa_id', empresaId)
    .neq('status', 'nao_pago')
    .in(campo, nrsTrimados);

  if (data) {
    for (const item of data as any[]) {
      const val = item[campo];
      if (val) {
        resultado.set(val.trim(), {
          acordoId: item.id,
          operadorId: item.operador_id,
          operadorNome: item.perfis?.nome ?? 'Operador desconhecido',
        });
      }
    }
  }
  return resultado;
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
    pendentes_hoje:       hoje_arr.filter(a => a.status === 'verificar_pendente').length,
    vencidos:             acordos.filter(a => a.vencimento < hoje && !['pago','nao_pago'].includes(a.status)).length,
    valor_previsto_hoje:  sumSafe(hoje_arr.map(a => a.valor)),
    valor_recebido_hoje:  sumSafe(hoje_arr.filter(a => a.status === 'pago').map(a => a.valor)),
    em_acompanhamento:    0,
  };
}
