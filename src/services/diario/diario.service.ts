/**
 * diario.service.ts
 * CRUD e lógica de negócio para diario_recebimentos (PaguePlay).
 *
 * Responsabilidades:
 *  • Merge incremental ao confirmar importação (dedupe por chave_unica no dia)
 *  • Busca com filtros (dia, operador, apenas órfãos)
 *  • Marcar visto (lógica de "novos" do operador)
 *  • Notificar operadores vinculados após a importação
 *  • Remover linhas (órfãos) e limpar o dia
 *
 * Diferente do analítico, NÃO há vínculo com acordos tabulados —
 * é uma lista informativa por operador.
 */

import { supabase } from '@/lib/supabase';
import type { DiarioRecebimento } from '@/lib/supabase';
import { PP_HO_PERCENTUAL } from '@/lib/index';
import { ROTA_DIARIO } from '@/lib/notificacoes-rota';
import type {
  OperadorResolvidoMap,
  ResumoOperadorAnalitico,
  LinhaRecebidaDia,
} from '@/services/analitico/analitico.service';
import type { LinhaDiario } from './diarioComum';
import { dayKeyDiario } from './diarioComum';

// Reexporta a resolução de operadores do analítico — o fluxo de vínculo
// (match automático case-insensitive + vínculo manual) é o mesmo.
export { resolverOperadores } from '@/services/analitico/analitico.service';
export type {
  OperadorResolvidoMap,
  OperadorMatchDetalhe,
  PerfilResumido,
  ResultadoResolucao,
} from '@/services/analitico/analitico.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return dayKeyDiario(d);
}

// ── Importação (merge incremental por dia) ────────────────────────────────────

export interface NovoPorOperador {
  operadorId: string;
  /** Pagamentos novos inseridos nesta importação */
  novosPagamentos: number;
  /** Total recebido nos pagamentos novos */
  totalNovo: number;
}

export interface ResultadoImportacaoDiario {
  inseridos: number;
  duplicados: number;
  /** Linhas já existentes cujo valor foi corrigido para cima (o mesmo
   *  NR/dia recebeu novas parcelas desde a importação anterior). */
  atualizados: number;
  erros: string[];
  importIndex: number;
  novosPorOperador: NovoPorOperador[];
}

/**
 * Persiste linhas no banco usando INSERT ... ON CONFLICT DO NOTHING.
 * Chave de unicidade: (empresa_id, dia_referencia, chave_unica).
 *
 * Cada linha é gravada no SEU próprio dia (dia_referencia = data de pagamento
 * da linha), então um relatório que contém recebimentos de vários dias é
 * distribuído corretamente entre as abas de cada dia. Linhas sem data caem no
 * `dia` informado (moda do relatório).
 *
 * O import_index (base do aviso "+N novos") é incremental POR DIA: importações
 * sucessivas do mesmo dia adicionam apenas os pagamentos novos.
 */
export async function importarLoteDiario(
  empresaId: string,
  importadoPorId: string,
  loteId: string,
  dia: string,               // 'yyyy-MM-dd' — dia de referência padrão (moda)
  linhas: LinhaDiario[],
  operadoresMap: OperadorResolvidoMap,
): Promise<ResultadoImportacaoDiario> {
  if (!linhas.length) {
    return { inseridos: 0, duplicados: 0, atualizados: 0, erros: [], importIndex: 0, novosPorOperador: [] };
  }

  // Dia de referência de cada linha: a própria data de pagamento; sem data,
  // usa o dia informado (moda do relatório).
  const diaDaLinha = (l: LinhaDiario): string =>
    l.data_pagamento ? toISO(l.data_pagamento) : dia;

  // Próximo índice de importação POR DIA presente no lote
  const diasNoLote = [...new Set(linhas.map(diaDaLinha))];
  const importIndexPorDia: Record<string, number> = {};
  for (const d of diasNoLote) {
    const { data: maxRow } = await supabase
      .from('diario_recebimentos')
      .select('import_index')
      .eq('empresa_id', empresaId)
      .eq('dia_referencia', d)
      .order('import_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    importIndexPorDia[d] = ((maxRow?.import_index as number | undefined) ?? 0) + 1;
  }

  const rows = linhas.map(l => {
    const diaRef = diaDaLinha(l);
    return {
      empresa_id:       empresaId,
      operador_id:      operadoresMap[l.operador_usuario] ?? null,
      operador_usuario: l.operador_usuario,
      cliente_codigo:   l.cliente_codigo || null,
      nome_cliente:     l.nome_cliente || null,
      acordo_codigo:    l.acordo_codigo || null,
      // Só envia `instituicao` quando há valor (BookPlay) — ver analitico.service.
      ...(l.instituicao ? { instituicao: l.instituicao } : {}),
      forma_pagamento:  l.forma_pagamento,
      valor_recebido:   l.valor_recebido,
      data_pagamento:   l.data_pagamento ? toISO(l.data_pagamento) : null,
      dia_referencia:   diaRef,
      prox_contato:     l.prox_contato ? toISO(l.prox_contato) : null,
      tabulacao:        l.tabulacao || null,
      id_baixa:         l.id_baixa || null,
      chave_unica:      l.chave_unica,
      import_index:     importIndexPorDia[diaRef],
      visto:            false,
      importado_por_id: importadoPorId,
      lote_id:          loteId,
    };
  });

  const CHUNK = 200;
  let inseridos = 0;
  let duplicados = 0;
  const erros: string[] = [];
  const porOperador = new Map<string, NovoPorOperador>();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('diario_recebimentos')
      .upsert(chunk, {
        onConflict: 'empresa_id,dia_referencia,chave_unica',
        ignoreDuplicates: true,
      })
      .select('id, operador_id, valor_recebido');

    if (error) {
      erros.push(`Chunk ${i / CHUNK + 1}: ${error.message}`);
    } else {
      inseridos += (data?.length ?? 0);
      duplicados += chunk.length - (data?.length ?? 0);
      for (const r of (data ?? []) as { operador_id: string | null; valor_recebido: number }[]) {
        if (!r.operador_id) continue;
        const atual = porOperador.get(r.operador_id) ?? {
          operadorId: r.operador_id, novosPagamentos: 0, totalNovo: 0,
        };
        atual.novosPagamentos += 1;
        atual.totalNovo       += Number(r.valor_recebido) || 0;
        porOperador.set(r.operador_id, atual);
      }
    }
  }

  // ── Reconciliação: o relatório é a verdade do (NR, dia) ────────────────────
  // A chave é única por (dia, operador|NR|dia): se a linha já existia com
  // valor diferente (nova parcela do mesmo dia, ou correção no ERP), o
  // ignoreDuplicates descartava a linha nova — o valor é igualado ao arquivo.
  let atualizados = 0;
  if (duplicados > 0) {
    const porChave = new Map(rows.map(r => [`${r.dia_referencia}::${r.chave_unica}`, r]));
    for (const d of diasNoLote) {
      const chavesDia = rows.filter(r => r.dia_referencia === d).map(r => r.chave_unica);
      for (let i = 0; i < chavesDia.length; i += CHUNK) {
        const { data: existentes } = await supabase
          .from('diario_recebimentos')
          .select('id, dia_referencia, chave_unica, valor_recebido')
          .eq('empresa_id', empresaId)
          .eq('dia_referencia', d)
          .in('chave_unica', chavesDia.slice(i, i + CHUNK));
        for (const ex of (existentes ?? []) as {
          id: string; dia_referencia: string; chave_unica: string; valor_recebido: number;
        }[]) {
          const alvo = porChave.get(`${ex.dia_referencia}::${ex.chave_unica}`);
          if (!alvo || Math.abs(alvo.valor_recebido - (Number(ex.valor_recebido) || 0)) <= 0.005) continue;
          const { error: errUp } = await supabase
            .from('diario_recebimentos')
            .update({ valor_recebido: alvo.valor_recebido })
            .eq('id', ex.id);
          if (errUp) erros.push(`Atualização ${ex.chave_unica}: ${errUp.message}`);
          else atualizados++;
        }
      }
    }
  }

  return {
    inseridos,
    duplicados,
    atualizados,
    erros,
    // Índice do dia de referência (moda) — usado só como informação no modal
    importIndex: importIndexPorDia[dia] ?? Math.max(...Object.values(importIndexPorDia)),
    novosPorOperador: [...porOperador.values()],
  };
}

// ── Revínculo de órfãos (operador criado após importação anterior) ────────────

export interface ResultadoRevinculoDiario {
  revinculados: number;
  novosPorOperador: NovoPorOperador[];
}

/**
 * Preenche o operador_id de linhas órfãs (operador_id = null) do dia cujo
 * operador já existe no sistema agora.
 *
 * Mesma causa do analítico: a dedupe usa (empresa_id, dia_referencia,
 * chave_unica), sem o operador_id. Se o relatório foi importado antes de o
 * operador ser criado, as linhas ficam órfãs e reimportar não corrige o
 * vínculo (ignoreDuplicates). Esta função reconcilia essas linhas e as marca
 * como não vistas, para que o operador seja notificado e as veja como novas.
 *
 * Retorna os totais por operador revinculado (para alimentar a notificação,
 * já que essas linhas não entram no `novosPorOperador` da importação, que só
 * conta as linhas efetivamente inseridas nesta chamada).
 */
export async function revincularOrfaosDiario(
  empresaId: string,
  dia: string,               // 'yyyy-MM-dd'
  operadoresMap: OperadorResolvidoMap,
): Promise<ResultadoRevinculoDiario> {
  const porOperador = new Map<string, NovoPorOperador>();
  let revinculados = 0;

  for (const [usuario, operadorId] of Object.entries(operadoresMap)) {
    if (!operadorId) continue;
    const { data, error } = await supabase
      .from('diario_recebimentos')
      .update({ operador_id: operadorId, visto: false })
      .eq('empresa_id', empresaId)
      .eq('dia_referencia', dia)
      .eq('operador_usuario', usuario)
      .is('operador_id', null)
      .select('id, valor_recebido');
    if (error || !data?.length) continue;

    revinculados += data.length;
    const atual = porOperador.get(operadorId) ?? {
      operadorId, novosPagamentos: 0, totalNovo: 0,
    };
    for (const r of data as { valor_recebido: number }[]) {
      atual.novosPagamentos += 1;
      atual.totalNovo       += Number(r.valor_recebido) || 0;
    }
    porOperador.set(operadorId, atual);
  }

  return { revinculados, novosPorOperador: [...porOperador.values()] };
}

// ── Busca ────────────────────────────────────────────────────────────────────

export interface FiltrosDiario {
  empresaId: string;
  dia: string;                     // 'yyyy-MM-dd'
  /** undefined = todos; null = somente órfãos; string = operador específico */
  operadorId?: string | null;
}

export async function buscarDiario(
  filtros: FiltrosDiario,
): Promise<{ data: DiarioRecebimento[]; error: string | null }> {
  function buildQuery(from: number, to: number) {
    let q = supabase
      .from('diario_recebimentos')
      .select('*, perfis(id, nome, usuario)')
      .eq('empresa_id', filtros.empresaId)
      .eq('dia_referencia', filtros.dia)
      .order('data_pagamento', { ascending: true })
      .order('cliente_codigo', { ascending: true })
      .range(from, to);

    if (filtros.operadorId !== undefined) {
      q = filtros.operadorId === null
        ? q.is('operador_id', null)
        : q.eq('operador_id', filtros.operadorId);
    }
    return q;
  }

  // Pagina em blocos de 1000 para superar o limite padrão do PostgREST.
  const PAGE = 1000;
  let allData: DiarioRecebimento[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE - 1);
    if (error) return { data: [], error: error.message };
    if (data?.length) allData = allData.concat(data as DiarioRecebimento[]);
    if (!data?.length || data.length < PAGE) break;
    offset += PAGE;
  }

  return { data: allData, error: null };
}

// ── Marcar como visto ─────────────────────────────────────────────────────────

/**
 * Marca como vistas todas as linhas não vistas do operador.
 * Um acordo só é considerado "lido" quando o operador abre a aba
 * após a importação — importações seguintes destacam apenas os não vistos.
 */
export async function marcarVistoDiario(
  empresaId: string,
  operadorId: string,
): Promise<void> {
  await supabase
    .from('diario_recebimentos')
    .update({ visto: true })
    .eq('empresa_id', empresaId)
    .eq('operador_id', operadorId)
    .eq('visto', false);
}

// ── Remover linhas ────────────────────────────────────────────────────────────

export async function removerLinhaDiario(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('diario_recebimentos').delete().eq('id', id);
  return { error: error?.message ?? null };
}

/** Remove todos os órfãos (sem operador) de um dia específico.
 *  Linhas "(sem vínculo)" — importadas sem nome de operador — são preservadas:
 *  elas alimentam o card consolidado e o total do setor. */
export async function removerOrfaosDoDia(
  empresaId: string,
  dia: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('diario_recebimentos')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('dia_referencia', dia)
    .is('operador_id', null)
    .neq('operador_usuario', '');
  return { error: error?.message ?? null };
}

/** Remove TODOS os registros de um dia (usado pelo líder para reimportar do zero). */
export async function limparDadosDoDia(
  empresaId: string,
  dia: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('diario_recebimentos')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('dia_referencia', dia);
  return { error: error?.message ?? null };
}

/**
 * Remove TODOS os registros de recebimento diário da empresa.
 * Usado na limpeza automática de fim de dia (reset diário): a partir das 23h,
 * o primeiro líder/admin que entra zera a tabela para o dia seguinte começar
 * limpo. Retorna quantas linhas foram apagadas.
 */
export async function limparTodoDiario(
  empresaId: string,
): Promise<{ removidos: number; error: string | null }> {
  const { data, error } = await supabase
    .from('diario_recebimentos')
    .delete()
    .eq('empresa_id', empresaId)
    .select('id');
  return { removidos: data?.length ?? 0, error: error?.message ?? null };
}

// ── Notificar operadores após importação ─────────────────────────────────────

/**
 * Notifica apenas os operadores vinculados que receberam algum valor
 * nesta importação (in-app; a notificação nativa do SO é disparada pelo
 * cliente via realtime em useNotificacoes).
 */
export async function notificarImportacaoDiario(
  empresaId: string,
  dia: string,               // 'yyyy-MM-dd'
  novosPorOperador: { operadorId: string; novosPagamentos: number; totalNovo: number }[],
): Promise<void> {
  const comValor = novosPorOperador.filter(n => n.totalNovo > 0);
  if (!comValor.length) return;

  const diaLabel = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR');
  const notifs = comValor.map(n => ({
    usuario_id: n.operadorId,
    empresa_id: empresaId,
    titulo:     'Recebimento diário atualizado',
    mensagem:
      `Seus valores recebidos de ${diaLabel} foram atualizados: ` +
      `${n.novosPagamentos} pagamento${n.novosPagamentos !== 1 ? 's' : ''} novo${n.novosPagamentos !== 1 ? 's' : ''}. ` +
      'Acesse Analítico › Recebimento diário para conferir.',
    lida: false,
    // Destino do clique: já abre na sub-aba certa (migration 20260731a).
    rota: ROTA_DIARIO,
  }));

  const CHUNK = 100;
  for (let i = 0; i < notifs.length; i += CHUNK) {
    await supabase.from('notificacoes').insert(notifs.slice(i, i + CHUNK));
  }
}

// ── Resumo MENSAL do recebimento diário (Painel Líder — PaguePlay) ────────────
//
// As abas Desempenho Equipes / Quartis / Gráfico recebimento do Painel Líder
// são alimentadas pelo relatório de recebimento diário: cada linha já é
// gravada no seu próprio dia (dia_referencia), então somar o mês dá o
// acumulado por operador. TODAS as linhas do relatório contam no total GERAL
// do setor; mas acordos FORA DO VÍNCULO (prox_contato ≤ dia do pagamento —
// mesma regra do card "Acordos ignorados" da aba do dia), os órfãos e os
// "(sem vínculo)" NÃO contam para o operador nem para a equipe — apenas no
// geral. A referência é o dia_referencia da linha (não "hoje"): importar o
// mensal dias depois não pode reclassificar pagamentos que estavam dentro do
// vínculo quando aconteceram.

export interface ResumoMensalDiario {
  /** Acumulado do mês por operador vinculado, SEM os fora do vínculo — mesmo
   *  formato do analítico, para reusar DesempenhoEquipes/QuartisOperadores
   *  sem alteração. total_ho é calculado (recebido × PP_HO_PERCENTUAL): o
   *  relatório diário não traz a coluna de H.O. */
  resumos: ResumoOperadorAnalitico[];
  /** Valores que contam SÓ no geral, somados por setor: órfãos,
   *  "(sem vínculo)" e fora do vínculo. Setor = do operador (fora do
   *  vínculo) ou de quem importou (órfãos/sem vínculo). */
  orfaosPorSetor: Record<string, { total: number; qtd: number }>;
  /** Linhas cruas para o gráfico por dia (data_pagamento = dia_referencia). */
  linhasDia: LinhaRecebidaDia[];
  error: string | null;
}

export async function buscarResumoMensalDiario(
  empresaId: string,
  mes: string,   // 'yyyy-MM'
): Promise<ResumoMensalDiario> {
  // 1) RPC agregada no banco (migration 20260721g): uma requisição pequena —
  //    uma linha por (operador|órfão, dia) — em vez de todas as linhas do mês
  //    paginadas + tabela de perfis. Se a migration ainda não foi aplicada,
  //    cai no caminho antigo (varredura das linhas).
  const rpc = await buscarResumoMensalDiarioRpc(empresaId, mes);
  if (rpc) return rpc;

  return buscarResumoMensalDiarioLinhas(empresaId, mes);
}

interface RowResumoRpc {
  operador_id: string | null;
  operador_usuario: string;
  operador_nome: string | null;
  /** Setor onde o valor conta no GERAL: do operador (linha vinculada) ou de
   *  quem importou (órfã/sem vínculo). */
  setor_geral: string | null;
  dia_referencia: string;
  /** prox_contato ≤ dia_referencia: conta só no geral, nunca no operador/equipe. */
  fora_vinculo: boolean;
  total_recebido: number;
  total_pagamentos: number;
}

/** Caminho rápido via fn_diario_resumo_mensal; null = função ausente no banco. */
async function buscarResumoMensalDiarioRpc(
  empresaId: string,
  mes: string,
): Promise<ResumoMensalDiario | null> {
  const { data, error } = await supabase.rpc('fn_diario_resumo_mensal', {
    p_empresa_id: empresaId,
    p_mes:        mes,
  });
  if (error) {
    // Migration não aplicada → fallback silencioso; outros erros são reais
    if (/function|does not exist|schema cache/i.test(error.message)) return null;
    return { resumos: [], orfaosPorSetor: {}, linhasDia: [], error: error.message };
  }

  const rows = (data ?? []) as unknown as RowResumoRpc[];
  // Banco ainda com a v1 da função (migration 20260721f, sem fora_vinculo):
  // cai na varredura de linhas, que aplica a regra corretamente no cliente.
  if (rows.length > 0 && !('fora_vinculo' in rows[0])) return null;

  const porOperador = new Map<string, ResumoOperadorAnalitico>();
  const orfaosPorSetor: Record<string, { total: number; qtd: number }> = {};
  const linhasDia: LinhaRecebidaDia[] = [];

  for (const r of rows) {
    const valor = Number(r.total_recebido) || 0;
    const qtd   = Number(r.total_pagamentos) || 0;
    // Fora do vínculo, órfão e "(sem vínculo)" contam SÓ no geral
    const contaNoOperador = !!r.operador_id && !r.fora_vinculo;

    linhasDia.push({
      operador_id:      contaNoOperador ? r.operador_id : null,
      setor_id:         contaNoOperador ? null : (r.setor_geral ?? null),
      importado_por_id: null,
      valor_recebido:   valor,
      data_pagamento:   r.dia_referencia,
    });

    if (contaNoOperador) {
      const atual = porOperador.get(r.operador_id!) ?? {
        operador_id:      r.operador_id!,
        operador_usuario: r.operador_usuario,
        operador_nome:    r.operador_nome,
        total_recebido:   0,
        total_ho:         0,
        total_pagamentos: 0,
      };
      atual.total_recebido   += valor;
      atual.total_pagamentos += qtd;
      porOperador.set(r.operador_id!, atual);
    } else if (r.setor_geral) {
      const acc = orfaosPorSetor[r.setor_geral]
        ?? (orfaosPorSetor[r.setor_geral] = { total: 0, qtd: 0 });
      acc.total += valor;
      acc.qtd   += qtd;
    }
  }

  const resumos = [...porOperador.values()]
    .map(r => ({ ...r, total_ho: r.total_recebido * PP_HO_PERCENTUAL }))
    .sort((a, b) => b.total_recebido - a.total_recebido);

  return { resumos, orfaosPorSetor, linhasDia, error: null };
}

/** Fallback sem a RPC: varre as linhas do mês paginadas (caminho antigo). */
async function buscarResumoMensalDiarioLinhas(
  empresaId: string,
  mes: string,   // 'yyyy-MM'
): Promise<ResumoMensalDiario> {
  const [y, m] = mes.split('-').map(Number);
  const primeiro = `${mes}-01`;
  const fim      = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

  interface Row {
    operador_id: string | null;
    operador_usuario: string;
    valor_recebido: number;
    dia_referencia: string;
    prox_contato: string | null;
    importado_por_id: string | null;
  }

  const PAGE = 1000;
  const rows: Row[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('diario_recebimentos')
      .select('operador_id, operador_usuario, valor_recebido, dia_referencia, prox_contato, importado_por_id')
      .eq('empresa_id', empresaId)
      .gte('dia_referencia', primeiro)
      .lte('dia_referencia', fim)
      .range(offset, offset + PAGE - 1);
    if (error) return { resumos: [], orfaosPorSetor: {}, linhasDia: [], error: error.message };
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data?.length || data.length < PAGE) break;
    offset += PAGE;
  }

  // Perfis: nome/usuario dos operadores + setor (do operador p/ fora do
  // vínculo; do importador p/ órfãos)
  const { data: perfis } = await supabase
    .from('perfis')
    .select('id, nome, usuario, setor_id')
    .eq('empresa_id', empresaId);
  const perfilMap = new Map(
    ((perfis ?? []) as { id: string; nome: string; usuario: string; setor_id: string | null }[])
      .map(p => [p.id, p]));

  const porOperador = new Map<string, ResumoOperadorAnalitico>();
  const orfaosPorSetor: Record<string, { total: number; qtd: number }> = {};
  const linhasDia: LinhaRecebidaDia[] = [];

  for (const r of rows) {
    const valor = Number(r.valor_recebido) || 0;
    // Fora do vínculo (prox_contato ≤ dia do pagamento — regra dos "Acordos
    // ignorados"): conta SÓ no geral, nunca no operador/equipe. Órfãos e
    // "(sem vínculo)" idem.
    const foraVinculo = r.prox_contato != null && r.prox_contato <= r.dia_referencia;
    const contaNoOperador = !!r.operador_id && !foraVinculo;

    // Setor do geral: do operador (fora do vínculo) ou de quem importou
    const setorGeral = contaNoOperador
      ? null
      : (perfilMap.get(r.operador_id ?? '')?.setor_id
         ?? perfilMap.get(r.importado_por_id ?? '')?.setor_id
         ?? null);

    linhasDia.push({
      operador_id:      contaNoOperador ? r.operador_id : null,
      setor_id:         setorGeral,
      importado_por_id: r.importado_por_id,
      valor_recebido:   valor,
      data_pagamento:   r.dia_referencia,
    });

    if (contaNoOperador) {
      const perfil = perfilMap.get(r.operador_id!);
      const atual = porOperador.get(r.operador_id!) ?? {
        operador_id:      r.operador_id!,
        operador_usuario: perfil?.usuario ?? r.operador_usuario,
        operador_nome:    perfil?.nome ?? null,
        total_recebido:   0,
        total_ho:         0,
        total_pagamentos: 0,
      };
      atual.total_recebido   += valor;
      atual.total_pagamentos += 1;
      porOperador.set(r.operador_id!, atual);
    } else {
      if (!setorGeral) continue;
      const acc = orfaosPorSetor[setorGeral] ?? (orfaosPorSetor[setorGeral] = { total: 0, qtd: 0 });
      acc.total += valor;
      acc.qtd   += 1;
    }
  }

  const resumos = [...porOperador.values()]
    .map(r => ({ ...r, total_ho: r.total_recebido * PP_HO_PERCENTUAL }))
    .sort((a, b) => b.total_recebido - a.total_recebido);

  return { resumos, orfaosPorSetor, linhasDia, error: null };
}
