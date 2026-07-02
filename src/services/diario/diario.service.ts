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
import type { OperadorResolvidoMap } from '@/services/analitico/analitico.service';
import type { LinhaDiario } from './diarioParser';
import { dayKeyDiario } from './diarioParser';

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
  erros: string[];
  importIndex: number;
  novosPorOperador: NovoPorOperador[];
}

/**
 * Persiste linhas no banco usando INSERT ... ON CONFLICT DO NOTHING.
 * Chave de unicidade: (empresa_id, dia_referencia, chave_unica).
 * Importações sucessivas do mesmo dia adicionam apenas os pagamentos novos,
 * marcados com import_index incremental (base do aviso "+N novos").
 */
export async function importarLoteDiario(
  empresaId: string,
  importadoPorId: string,
  loteId: string,
  dia: string,               // 'yyyy-MM-dd'
  linhas: LinhaDiario[],
  operadoresMap: OperadorResolvidoMap,
): Promise<ResultadoImportacaoDiario> {
  if (!linhas.length) {
    return { inseridos: 0, duplicados: 0, erros: [], importIndex: 0, novosPorOperador: [] };
  }

  // Próximo índice de importação do dia
  const { data: maxRow } = await supabase
    .from('diario_recebimentos')
    .select('import_index')
    .eq('empresa_id', empresaId)
    .eq('dia_referencia', dia)
    .order('import_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const importIndex = ((maxRow?.import_index as number | undefined) ?? 0) + 1;

  const rows = linhas.map(l => ({
    empresa_id:       empresaId,
    operador_id:      operadoresMap[l.operador_usuario] ?? null,
    operador_usuario: l.operador_usuario,
    cpf:              l.cpf || null,
    nome_cliente:     l.nome_cliente || null,
    acordo_codigo:    l.acordo_codigo || null,
    forma_pagamento:  l.forma_pagamento,
    valor_recebido:   l.valor_recebido,
    data_pagamento:   l.data_pagamento ? toISO(l.data_pagamento) : null,
    dia_referencia:   dia,
    prox_contato:     l.prox_contato ? toISO(l.prox_contato) : null,
    tabulacao:        l.tabulacao || null,
    id_baixa:         l.id_baixa || null,
    chave_unica:      l.chave_unica,
    import_index:     importIndex,
    visto:            false,
    importado_por_id: importadoPorId,
    lote_id:          loteId,
  }));

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

  return {
    inseridos,
    duplicados,
    erros,
    importIndex,
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
      .order('cpf', { ascending: true })
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

/** Dia mais recente com dados importados (para abrir a aba já no último relatório) */
export async function buscarUltimoDia(
  empresaId: string,
): Promise<{ dia: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('diario_recebimentos')
    .select('dia_referencia')
    .eq('empresa_id', empresaId)
    .order('dia_referencia', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { dia: (data?.dia_referencia as string | undefined) ?? null, error: error?.message ?? null };
}

// ── Resumo do mês (card do líder) ─────────────────────────────────────────────

export interface ResumoMesDiario {
  total_recebido: number;
  total_dias: number;
}

export async function buscarResumoMesDiario(
  empresaId: string,
  mes: string,               // 'yyyy-MM'
): Promise<{ data: ResumoMesDiario | null; error: string | null }> {
  const { data, error } = await supabase.rpc('fn_diario_resumo_mes', {
    p_empresa_id: empresaId,
    p_mes:        mes,
  });
  const row = Array.isArray(data) ? data[0] : data;
  return {
    data: row
      ? { total_recebido: Number(row.total_recebido) || 0, total_dias: Number(row.total_dias) || 0 }
      : null,
    error: error?.message ?? null,
  };
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

/** Remove todos os órfãos (sem operador) de um dia específico. */
export async function removerOrfaosDoDia(
  empresaId: string,
  dia: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('diario_recebimentos')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('dia_referencia', dia)
    .is('operador_id', null);
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
  }));

  const CHUNK = 100;
  for (let i = 0; i < notifs.length; i += CHUNK) {
    await supabase.from('notificacoes').insert(notifs.slice(i, i + CHUNK));
  }
}
