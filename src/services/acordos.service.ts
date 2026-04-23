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
  equipe_id?: string;
  empresa_id?: string;
  data_inicio?: string;
  data_fim?: string;
  busca?: string;
  vencimento?: string;
  apenas_hoje?: boolean;
  page?: number;
  perPage?: number;
}

/**
 * Resolve a lista de operador_id pertencentes a uma equipe.
 * Usado para filtrar acordos por equipe (equipe_id está em perfis, não em acordos).
 */
async function resolverOperadoresDaEquipe(
  equipe_id: string,
  empresa_id?: string,
): Promise<string[]> {
  let q = supabase.from('perfis').select('id').eq('equipe_id', equipe_id);
  if (empresa_id) q = q.eq('empresa_id', empresa_id);
  const { data } = await q;
  return ((data as { id: string }[]) ?? []).map(m => m.id);
}

/** Busca acordos com filtros opcionais e suporte a paginação server-side */
export async function fetchAcordos(filtros?: FiltrosAcordo): Promise<{ data: Acordo[], count: number }> {
  // ── Estratégia de paginação ────────────────────────────────────────────────
  // A deduplicação por acordo_grupo_id (manter apenas a parcela mais recente
  // de cada grupo) é feita diretamente no banco via a view `acordos_deduplicados`.
  //
  // Isso garante que:
  //   - O `count` retornado é EXATO (sem parcelas duplicadas)
  //   - A paginação server-side é correta em qualquer volume
  //   - Não há overhead de busca de lotes ampliados no cliente
  //
  // A view usa DISTINCT ON (acordo_grupo_id) ORDER BY numero_parcela DESC,
  // mantendo sempre a parcela mais recente. Acordos sem grupo passam intactos.

  const paginar = !!(filtros?.page && filtros?.perPage);
  const perPage = filtros?.perPage ?? 20;
  const page    = filtros?.page ?? 1;

  let query = supabase
    .from('acordos_deduplicados')
    .select('*, perfis(id, nome, email, perfil, setor_id), setores(id, nome)', { count: 'exact' })
    .order('vencimento', { ascending: true });

  if (filtros?.apenas_hoje) query = query.eq('vencimento', getTodayISO());
  if (filtros?.status)      query = query.eq('status', filtros.status);
  if (filtros?.tipo)        query = query.eq('tipo', filtros.tipo);
  if (filtros?.operador_id) query = query.eq('operador_id', filtros.operador_id);
  if (filtros?.setor_id)    query = query.eq('setor_id', filtros.setor_id);
  // equipe_id existe em perfis, não em acordos — resolve operadores da equipe e filtra por IN
  if (filtros?.equipe_id) {
    const membros = await resolverOperadoresDaEquipe(filtros.equipe_id, filtros.empresa_id);
    if (membros.length === 0) {
      // Equipe sem membros — retorna vazio imediatamente
      return { data: [], count: 0 };
    }
    query = query.in('operador_id', membros);
  }
  if (filtros?.empresa_id)  query = query.eq('empresa_id', filtros.empresa_id);
  if (filtros?.vencimento)  query = query.eq('vencimento', filtros.vencimento);
  if (filtros?.data_inicio) query = query.gte('vencimento', filtros.data_inicio);
  if (filtros?.data_fim)    query = query.lte('vencimento', filtros.data_fim);

  if (filtros?.busca) {
    query = query.or(
      `nome_cliente.ilike.%${filtros.busca}%,nr_cliente.ilike.%${filtros.busca}%,whatsapp.ilike.%${filtros.busca}%`
    );
  }

  // Paginação server-side: agora precisa e diretamente sobre a view deduplicada
  if (paginar) {
    const from = (page - 1) * perPage;
    const to   = from + perPage - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: (data as Acordo[]) || [],
    count: count ?? 0,
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
    const item = data[0] as {
      id: string;
      status: string;
      operador_id: string;
      perfis?: { nome?: string | null } | null;
    };
    return {
      duplicado: true,
      statusExistente: item.status,
      acordoIdExistente: item.id,
      operadorIdExistente: item.operador_id,
      operadorNomeExistente: item.perfis?.nome ?? null,
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
): Promise<Map<string, {
  acordoId: string;
  operadorId: string;
  operadorNome: string;
  operadorSetorId: string | null;
  operadorEquipeId: string | null;
}>> {
  const resultado = new Map<string, {
    acordoId: string;
    operadorId: string;
    operadorNome: string;
    operadorSetorId: string | null;
    operadorEquipeId: string | null;
  }>();
  const nrsTrimados = [...new Set(nrs.map(n => n.trim()).filter(Boolean))];
  if (!nrsTrimados.length) return resultado;

  // Inclui setor_id/equipe_id do dono para alimentar a classificação
  // Direto/Extra SEM depender de RLS aplicada sobre a tabela `perfis` no
  // contexto do classificador (bug corrigido em 2026-04-22).
  const colSelect = `id, ${campo}, operador_id, perfis(nome, setor_id, equipe_id)`;

  const { data } = await supabase
    .from('acordos')
    .select(colSelect)
    .eq('empresa_id', empresaId)
    .neq('status', 'nao_pago')
    .in(campo, nrsTrimados);

  if (data) {
    type DupRow = {
      id: string;
      operador_id: string;
      perfis?: {
        nome?: string | null;
        setor_id?: string | null;
        equipe_id?: string | null;
      } | null;
      nr_cliente?: string | null;
      instituicao?: string | null;
    };
    for (const item of data as DupRow[]) {
      const val = item[campo];
      if (val) {
        resultado.set(val.trim(), {
          acordoId: item.id,
          operadorId: item.operador_id,
          operadorNome: item.perfis?.nome ?? 'Operador desconhecido',
          operadorSetorId:  item.perfis?.setor_id  ?? null,
          operadorEquipeId: item.perfis?.equipe_id ?? null,
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
