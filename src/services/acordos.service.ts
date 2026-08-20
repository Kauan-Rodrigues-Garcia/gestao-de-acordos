/**
 * src/services/acordos.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Service layer para operações com acordos.
 * Centraliza queries, filtros, cálculos e validações.
 */
import { supabase, Acordo } from '@/lib/supabase';
import { safeNum, sumSafe } from '@/lib/money';
import { getTodayISO } from '@/lib/index';
import { mesAtual, primeiroDiaDoMes, ultimoDiaDoMes } from '@/lib/mesReferencia';

export interface FiltrosAcordo {
  status?: string;
  tipo?: string;
  operador_id?: string;
  setor_id?: string;
  equipe_id?: string;
  tag_id?: string;
  empresa_id?: string;
  data_inicio?: string;
  data_fim?: string;
  busca?: string;
  vencimento?: string;
  apenas_hoje?: boolean;
  estado_uf?: string;
  page?: number;
  perPage?: number;
  /** Garante que acordos de hoje apareçam sempre na página 1 via duas queries */
  prioritize_today?: boolean;
}

/**
 * Resolve a lista de operador_id pertencentes a uma equipe.
 * Usado para filtrar acordos por equipe (equipe_id está em perfis, não em acordos).
 *
 * Inclui TAMBÉM os operadores CLONADOS naquela equipe (equipe_operadores_clones):
 * uma equipe pode ser formada só por clones (ex.: Digital Amauri), então sem isso
 * o filtro por equipe retornaria vazio. Dedup por Set. A tabela de clones é
 * tolerada como ausente (migration pendente) — cai só nos membros reais.
 */
async function resolverOperadoresDaEquipe(
  equipe_id: string,
  empresa_id?: string,
): Promise<string[]> {
  let q = supabase.from('perfis').select('id').eq('equipe_id', equipe_id);
  if (empresa_id) q = q.eq('empresa_id', empresa_id);
  const { data } = await q;
  const ids = new Set(((data as { id: string }[]) ?? []).map(m => m.id));

  const clones = await supabase
    .from('equipe_operadores_clones')
    .select('operador_id')
    .eq('equipe_id', equipe_id);
  if (!clones.error) {
    for (const c of (clones.data as { operador_id: string }[]) ?? []) {
      ids.add(c.operador_id);
    }
  }
  return [...ids];
}

/** Busca acordos com filtros opcionais e suporte a paginação server-side */
export async function fetchAcordos(filtros?: FiltrosAcordo): Promise<{ data: Acordo[], count: number }> {
  // Quando há filtro de intervalo de mês usa a tabela direta (sem dedup).
  // Sem filtro de data usa a view deduplicada (DISTINCT ON por grupo).
  // Usa a tabela direta quando há filtro de intervalo de mês OU filtro de data exata
  const hasMonthRange = !!(filtros?.data_inicio && filtros?.data_fim)
    || !!filtros?.vencimento
    || !!filtros?.apenas_hoje;
  // 'acordos' | 'acordos_deduplicados' como union em .from() faz o supabase-js
  // tentar resolver o tipo contra as duas tabelas ao mesmo tempo (instanciação
  // excessivamente profunda). Ambas têm as mesmas colunas/relacionamentos —
  // fixamos o tipo em 'acordos' só para o type-check; o valor real em runtime
  // continua sendo o de sourceTableRuntime.
  const sourceTableRuntime = hasMonthRange ? 'acordos' : 'acordos_deduplicados';
  const sourceTable = sourceTableRuntime as 'acordos';

  const paginar = !!(filtros?.page && filtros?.perPage);
  const perPage = filtros?.perPage ?? 20;
  const page    = filtros?.page ?? 1;

  // Resolve membros da equipe UMA VEZ (usado pelas duas queries abaixo)
  let membrosEquipe: string[] | null = null;
  if (filtros?.equipe_id) {
    membrosEquipe = await resolverOperadoresDaEquipe(filtros.equipe_id, filtros.empresa_id);
    if (membrosEquipe.length === 0) return { data: [], count: 0 };
  }

  // Helper: aplica todos os filtros exceto vencimento exato / apenas_hoje
  // (esses são gerenciados individualmente em cada branch)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any): any => {
    if (filtros?.status)      q = q.eq('status', filtros.status);
    if (filtros?.tipo)        q = q.eq('tipo', filtros.tipo);
    if (filtros?.operador_id) q = q.eq('operador_id', filtros.operador_id);
    if (filtros?.setor_id)    q = q.eq('setor_id', filtros.setor_id);
    if (filtros?.tag_id)      q = q.contains('tag_ids', [filtros.tag_id]);
    if (membrosEquipe)        q = q.in('operador_id', membrosEquipe);
    if (filtros?.empresa_id)  q = q.eq('empresa_id', filtros.empresa_id);
    // Intervalo de mês: aplicado aqui para que ambas as queries (hoje + resto) respeitem o filtro
    if (filtros?.data_inicio) q = q.gte('vencimento', filtros.data_inicio);
    if (filtros?.data_fim)    q = q.lte('vencimento', filtros.data_fim);
    if (filtros?.estado_uf) q = q.eq('estado_uf', filtros.estado_uf);
    if (filtros?.busca) {
      q = q.or(
        `nome_cliente.ilike.%${filtros.busca}%,nr_cliente.ilike.%${filtros.busca}%,whatsapp.ilike.%${filtros.busca}%,instituicao.ilike.%${filtros.busca}%`
      );
    }
    return q;
  };

  const SELECT = '*, perfis(id, nome, email, perfil, setor_id), setores(id, nome)';

  // ── DOIS-QUERIES: garante acordos de hoje sempre na página 1 ──────────────
  // Funciona mesmo quando os acordos de hoje caem em páginas intermediárias
  // na ordenação cronológica simples (ex.: muitos acordos históricos antes deles).
  // Quando há filtro de data exata, ignorar prioritize_today — o caminho de query única aplica corretamente o filtro
  if (paginar && filtros?.prioritize_today && !filtros?.vencimento) {
    const hoje = getTodayISO();

    // Query A: TODOS os acordos de hoje (sem paginação)
    const { data: dataHoje, error: errA } = await applyFilters(
      supabase.from(sourceTable).select(SELECT).eq('vencimento', hoje).order('criado_em', { ascending: true })
    );
    if (errA) throw errA;
    const acordosHoje = (dataHoje as Acordo[]) ?? [];
    const T = acordosHoje.length;

    // Matemática da página combinada: lista = [hoje[0..T-1], resto[0..]]
    // Para a página N, precisamos de combined[(N-1)*P .. N*P-1]
    //   De hoje:  slice( max(0,(N-1)*P), min(T, N*P) )
    //   Do resto: offset = max(0,(N-1)*P - T), qtd = N*P - max(T,(N-1)*P)
    const todaySlice = acordosHoje.slice(
      Math.max(0, (page - 1) * perPage),
      Math.min(T, page * perPage),
    );
    const restOffset  = Math.max(0, (page - 1) * perPage - T);
    const restNeeded  = page * perPage - Math.max(T, (page - 1) * perPage);

    if (restNeeded <= 0) {
      // Página inteiramente coberta pelos acordos de hoje
      // Ainda precisa do count total do resto para calcular páginas
      const { count: restCount, error: errC } = await applyFilters(
        supabase.from(sourceTable).select('id', { count: 'exact', head: true }).neq('vencimento', hoje)
      );
      if (errC) throw errC;
      return { data: todaySlice, count: T + (restCount ?? 0) };
    }

    // Query B: acordos NÃO de hoje, paginados com offset ajustado
    const { data: dataResto, count: restCount, error: errB } = await applyFilters(
      supabase.from(sourceTable)
        .select(SELECT, { count: 'exact' })
        .neq('vencimento', hoje)
        .order('vencimento', { ascending: true })
        .range(restOffset, restOffset + restNeeded - 1)
    );
    if (errB) throw errB;
    const acordosResto = (dataResto as Acordo[]) ?? [];

    return {
      data: [...todaySlice, ...acordosResto],
      count: T + (restCount ?? 0),
    };
  }

  // ── QUERY ÚNICA (caminho normal) ──────────────────────────────────────────
  let query = applyFilters(
    supabase.from(sourceTable).select(SELECT, { count: 'exact' }).order('vencimento', { ascending: true })
  );

  if (filtros?.apenas_hoje) query = query.eq('vencimento', getTodayISO());
  if (filtros?.vencimento)  query = query.eq('vencimento', filtros.vencimento);

  if (paginar) {
    const from = (page - 1) * perPage;
    query = query.range(from, from + perPage - 1);
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
  // Mês corrente pelo fuso de São Paulo, não pelo da máquina — e pelo mesmo
  // par de funções que o resto do sistema usa para recortar mês.
  const mes = mesAtual();
  const inicioMes = primeiroDiaDoMes(mes);
  const fimMes    = ultimoDiaDoMes(mes);

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
    const item = data[0] as unknown as {
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
    for (const item of data as unknown as DupRow[]) {
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
