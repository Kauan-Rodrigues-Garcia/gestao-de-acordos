/**
 * analitico.service.ts
 * CRUD e lógica de negócio para analitico_recebimentos (PaguePlay).
 *
 * Responsabilidades:
 *  • Merge incremental ao confirmar importação
 *  • Busca com filtros (mes, operador)
 *  • Marcar visto
 *  • Verificar status de tabulação (nao_tabulado | tabulado | divergente)
 *  • Tabular caso divergente (remove do outro operador, notifica, loga)
 *  • Remover linhas individuais ou em lote (operadores não encontrados)
 */

import { supabase } from '@/lib/supabase';
import type { Acordo, AnaliticoRecebimento, AnaliticoDashboardLinha, StatusTabulacaoAnalitico } from '@/lib/supabase';
import { criarNotificacao } from '@/services/notificacoes.service';
import { enviarParaLixeira } from '@/services/lixeira.service';
import { mesReferencia } from './analiticoParser';
import type { LinhaRelatorio } from './analiticoParser';

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Formata Date para 'yyyy-MM-dd' */
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Normaliza código (remove zeros à esquerda? Não — PaguePlay usa código como veio) */
function normCodigo(c: string): string {
  return c.trim();
}

// ── Resolução de operadores ───────────────────────────────────────────────────

export interface OperadorResolvidoMap {
  [usuario: string]: string | null; // usuario → perfil.id ou null se não encontrado
}

export interface PerfilResumido {
  id: string;
  usuario: string;
  nome: string;
}

export interface OperadorMatchDetalhe {
  id: string;
  usuarioDB: string;  // username exato como está no banco
  nome: string;
}

export interface ResultadoResolucao {
  map: OperadorResolvidoMap;
  matches: Record<string, OperadorMatchDetalhe | null>;
  todosPerfis: PerfilResumido[];
}

/**
 * Busca perfis da empresa e resolve os operadores do arquivo de forma case-insensitive.
 * Retorna o mapa de ids, os detalhes de cada match (para exibição) e todos os perfis
 * ativos da empresa (para seleção manual dos não encontrados).
 */
export async function resolverOperadores(
  empresaId: string,
  usuarios: string[],
): Promise<ResultadoResolucao> {
  const { data } = await supabase
    .from('perfis')
    .select('id, usuario, nome')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('nome');

  const todosPerfis: PerfilResumido[] = (data ?? []).map(p => ({
    id:      p.id,
    usuario: p.usuario ?? '',
    nome:    p.nome ?? '',
  }));

  // Índice lowercase → perfil completo para comparação case-insensitive
  const dbIndex: Record<string, PerfilResumido> = {};
  for (const p of todosPerfis) {
    if (p.usuario) dbIndex[p.usuario.toLowerCase()] = p;
  }

  const map: OperadorResolvidoMap = {};
  const matches: Record<string, OperadorMatchDetalhe | null> = {};

  for (const u of usuarios) {
    const found = dbIndex[u.toLowerCase()] ?? null;
    map[u]     = found?.id ?? null;
    matches[u] = found ? { id: found.id, usuarioDB: found.usuario, nome: found.nome } : null;
  }

  return { map, matches, todosPerfis };
}

// ── Importação (merge incremental) ────────────────────────────────────────────

export interface ResultadoImportacao {
  inseridos: number;
  duplicados: number;
  erros: string[];
}

/**
 * Persiste linhas no banco usando INSERT ... ON CONFLICT DO NOTHING.
 * Chave de unicidade: (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario).
 * Operadores não encontrados têm operador_id = null (visíveis só para líder+).
 */
export async function importarLoteAnalitico(
  empresaId: string,
  importadoPorId: string,
  loteId: string,
  linhas: LinhaRelatorio[],
  operadoresMap: OperadorResolvidoMap,
): Promise<ResultadoImportacao> {
  if (!linhas.length) return { inseridos: 0, duplicados: 0, erros: [] };

  const rows = linhas.map(l => ({
    empresa_id:      empresaId,
    operador_id:     operadoresMap[l.operador_usuario] ?? null,
    operador_usuario: l.operador_usuario,
    codigo:          normCodigo(l.codigo),
    nome_cliente:    l.nome_cliente || null,
    // Só envia `instituicao`/`forma_detalhe` quando há valor (BookPlay). Assim a
    // PaguePlay não referencia as colunas — o import segue funcionando mesmo
    // antes da migration.
    ...(l.instituicao ? { instituicao: l.instituicao } : {}),
    ...(l.forma_detalhe ? { forma_detalhe: l.forma_detalhe } : {}),
    forma_pagamento: l.forma_pagamento,
    valor_recebido:  l.valor_recebido,
    total_ho:        l.total_ho,
    data_pagamento:  toISO(l.data_pagamento),
    mes_referencia:  toISO(mesReferencia(l.data_pagamento)),
    status_tabulacao: 'nao_tabulado' as StatusTabulacaoAnalitico,
    visto:           false,
    importado_por_id: importadoPorId,
    lote_id:         loteId,
    pagamentos_detalhados: (l.pagamentos_detalhados && l.pagamentos_detalhados.length > 1)
      ? l.pagamentos_detalhados.map(p => ({
          tpdoc:    p.tpdoc,
          valor:    p.valor,
          total_ho: p.total_ho,
          data:     toISO(p.data),
        }))
      : null,
  }));

  const CHUNK = 200;
  let inseridos = 0;
  let duplicados = 0;
  const erros: string[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('analitico_recebimentos')
      .upsert(chunk, {
        onConflict: 'empresa_id,codigo,data_pagamento,forma_pagamento,operador_usuario',
        ignoreDuplicates: true,
      })
      .select('id');

    if (error) {
      erros.push(`Chunk ${i / CHUNK + 1}: ${error.message}`);
    } else {
      inseridos += (data?.length ?? 0);
      duplicados += chunk.length - (data?.length ?? 0);
    }
  }

  return { inseridos, duplicados, erros };
}

// ── Revínculo de órfãos (operador criado após importação anterior) ────────────

export interface ResultadoRevinculo {
  revinculados: number;
  operadoresAfetados: string[]; // perfil.id dos operadores que ganharam linhas
}

/**
 * Preenche o operador_id de linhas órfãs (operador_id = null) cujo operador
 * já existe no sistema agora.
 *
 * Por que é necessário: a dedupe de `importarLoteAnalitico` usa a chave
 * (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario), que
 * inclui o *username* mas não o operador_id. Se o relatório for importado antes
 * de o operador ser criado, as linhas ficam órfãs; reimportar o mesmo relatório
 * as trata como duplicadas (ignoreDuplicates) e o vínculo nunca é corrigido.
 * Esta função reconcilia essas linhas a partir do mapa de operadores resolvido.
 *
 * Escopo: toda a empresa (não filtra por mês) — qualquer linha órfã do username
 * passa a apontar para o operador recém-criado.
 */
export async function revincularOrfaosAnalitico(
  empresaId: string,
  operadoresMap: OperadorResolvidoMap,
): Promise<ResultadoRevinculo> {
  const operadoresAfetados = new Set<string>();
  let revinculados = 0;

  for (const [usuario, operadorId] of Object.entries(operadoresMap)) {
    if (!operadorId) continue;
    const { data, error } = await supabase
      .from('analitico_recebimentos')
      .update({ operador_id: operadorId })
      .eq('empresa_id', empresaId)
      .eq('operador_usuario', usuario)
      .is('operador_id', null)
      .select('id');
    if (!error && data?.length) {
      revinculados += data.length;
      operadoresAfetados.add(operadorId);
    }
  }

  return { revinculados, operadoresAfetados: [...operadoresAfetados] };
}

// ── Resumo agregado por operador (visão líder) ────────────────────────────────

export interface ResumoOperadorAnalitico {
  operador_id: string;
  operador_usuario: string;
  operador_nome: string | null;
  total_recebido: number;
  total_ho: number;
  total_pagamentos: number;
}

/** Retorna totais por operador via RPC (sem varrer linhas individuais). */
export async function buscarResumoOperadoresAnalitico(
  empresaId: string,
  mes: string,
): Promise<{ data: ResumoOperadorAnalitico[]; error: string | null }> {
  const { data, error } = await supabase
    .rpc('fn_analitico_resumo_por_operador', {
      p_empresa_id: empresaId,
      p_mes:        mes,
    })
    .order('total_recebido', { ascending: false });
  return { data: (data ?? []) as ResumoOperadorAnalitico[], error: error?.message ?? null };
}

// ── Agregado do mês para o dashboard (ver 20260710c) ─────────────────────────
// Operador recebe só as próprias linhas; líder+ recebe a empresa toda.
// Tolerante à migration ausente: retorna dbAtiva=false e o dashboard esconde.

export async function buscarAnaliticoDashboardMes(
  empresaId: string,
  mes: string,   // 'yyyy-MM'
): Promise<{ data: AnaliticoDashboardLinha[]; dbAtiva: boolean; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('fn_analitico_dashboard_mes', {
      p_empresa_id: empresaId,
      p_mes:        mes,
    });
    if (error) {
      const faltando = /function|does not exist|schema cache/i.test(error.message);
      return { data: [], dbAtiva: !faltando, error: faltando ? null : error.message };
    }
    return { data: (data ?? []) as AnaliticoDashboardLinha[], dbAtiva: true, error: null };
  } catch (err) {
    return { data: [], dbAtiva: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Busca ────────────────────────────────────────────────────────────────────

export interface FiltrosAnalitico {
  empresaId: string;
  mes?: string;       // 'yyyy-MM'
  operadorId?: string | null;
  apenasNaoVistos?: boolean;
}

export async function buscarAnalitico(
  filtros: FiltrosAnalitico,
): Promise<{ data: AnaliticoRecebimento[]; error: string | null }> {
  function buildQuery(from: number, to: number) {
    let q = supabase
      .from('analitico_recebimentos')
      .select('*, perfis(id, nome, usuario)')
      .eq('empresa_id', filtros.empresaId)
      .order('data_pagamento', { ascending: false })
      .range(from, to);

    if (filtros.mes) {
      const [y, m] = filtros.mes.split('-').map(Number);
      const primeiro = `${filtros.mes}-01`;
      const ultimo   = new Date(y, m, 0);
      const fim = `${filtros.mes}-${String(ultimo.getDate()).padStart(2, '0')}`;
      q = q.gte('data_pagamento', primeiro).lte('data_pagamento', fim);
    }
    if (filtros.operadorId !== undefined) {
      if (filtros.operadorId === null) {
        q = q.is('operador_id', null);
      } else {
        q = q.eq('operador_id', filtros.operadorId);
      }
    }
    if (filtros.apenasNaoVistos) {
      q = q.eq('visto', false);
    }
    return q;
  }

  // Pagina em blocos de 1000 para superar o limite padrão do PostgREST (max_rows=1000).
  // Sem isso, queries sem filtro de operador retornam apenas as primeiras 1000 linhas,
  // causando totais incorretos na visão do líder.
  const PAGE = 1000;
  let allData: AnaliticoRecebimento[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE - 1);
    if (error) return { data: [], error: error.message };
    if (data?.length) allData = allData.concat(data as AnaliticoRecebimento[]);
    if (!data?.length || data.length < PAGE) break;
    offset += PAGE;
  }

  return { data: allData, error: null };
}

// ── Marcar como visto ─────────────────────────────────────────────────────────

export async function marcarVistoAnalitico(
  empresaId: string,
  operadorId: string,
  mes?: string,
): Promise<void> {
  let q = supabase
    .from('analitico_recebimentos')
    .update({ visto: true })
    .eq('empresa_id', empresaId)
    .eq('operador_id', operadorId)
    .eq('visto', false);

  if (mes) {
    q = q.eq('mes_referencia', `${mes}-01`);
  }
  await q;
}

// ── Remover linhas ────────────────────────────────────────────────────────────

export async function removerLinhaAnalitico(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('analitico_recebimentos').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export async function removerLinhasSemOperador(
  empresaId: string,
  loteId?: string,
): Promise<{ removidos: number; error: string | null }> {
  let q = supabase
    .from('analitico_recebimentos')
    .delete()
    .eq('empresa_id', empresaId)
    .is('operador_id', null);
  if (loteId) q = q.eq('lote_id', loteId);
  const { count, error } = await (q as ReturnType<typeof q.select>);
  return { removidos: count ?? 0, error: error?.message ?? null };
}

/** Remove TODOS os registros analíticos de um mês (usado pelo líder para reimportar do zero). */
export async function limparDadosDoMes(
  empresaId: string,
  mes: string,
): Promise<{ error: string | null }> {
  const [y, m] = mes.split('-').map(Number);
  const primeiro = `${mes}-01`;
  const fim      = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

  const { error } = await supabase
    .from('analitico_recebimentos')
    .delete()
    .eq('empresa_id', empresaId)
    .gte('data_pagamento', primeiro)
    .lte('data_pagamento', fim);

  return { error: error?.message ?? null };
}

/**
 * Versão escopada por setor de `limparDadosDoMes`: remove só as linhas do mês
 * cujo operador pertence ao setor (ids em `perfilIdsDoSetor`) e os órfãos
 * (sem operador) importados por alguém do setor. Usada por líder/gerência —
 * os dados dos DEMAIS setores ficam intactos.
 */
export async function limparDadosDoMesSetor(
  empresaId: string,
  mes: string,
  perfilIdsDoSetor: string[],
): Promise<{ error: string | null }> {
  if (!perfilIdsDoSetor.length) return { error: null };
  const [y, m] = mes.split('-').map(Number);
  const primeiro = `${mes}-01`;
  const fim      = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

  const { error: errOps } = await supabase
    .from('analitico_recebimentos')
    .delete()
    .eq('empresa_id', empresaId)
    .in('operador_id', perfilIdsDoSetor)
    .gte('data_pagamento', primeiro)
    .lte('data_pagamento', fim);
  if (errOps) return { error: errOps.message };

  const { error: errOrfaos } = await supabase
    .from('analitico_recebimentos')
    .delete()
    .eq('empresa_id', empresaId)
    .is('operador_id', null)
    .in('importado_por_id', perfilIdsDoSetor)
    .gte('data_pagamento', primeiro)
    .lte('data_pagamento', fim);

  return { error: errOrfaos?.message ?? null };
}

/** Remove todos os órfãos (sem operador) de um mês específico.
 *  Com `importadorIds`, remove só os importados por esses perfis (escopo de setor). */
export async function removerOrfaosDoMes(
  empresaId: string,
  mes: string,
  importadorIds?: string[],
): Promise<{ error: string | null }> {
  if (importadorIds && !importadorIds.length) return { error: null };
  const [y, m] = mes.split('-').map(Number);
  const primeiro = `${mes}-01`;
  const ultimo   = new Date(y, m, 0);
  const fim      = `${mes}-${String(ultimo.getDate()).padStart(2, '0')}`;

  let q = supabase
    .from('analitico_recebimentos')
    .delete()
    .eq('empresa_id', empresaId)
    .is('operador_id', null)
    .gte('data_pagamento', primeiro)
    .lte('data_pagamento', fim);
  if (importadorIds) q = q.in('importado_por_id', importadorIds);

  const { error } = await q;
  return { error: error?.message ?? null };
}

// ── Destaques do dia ──────────────────────────────────────────────────────────

export interface DestaqueDiaAnalitico {
  dia: string;             // 'yyyy-MM-dd'
  operador_id: string;
  operador_usuario: string;
  operador_nome: string | null;
  total_recebido: number;
  total_pagamentos: number;
}

/** Retorna o operador com maior total recebido por dia do mês (RPC). */
export async function buscarDestaquesDoMes(
  empresaId: string,
  mes: string,
  equipeId?: string | null,
  setorId?: string | null,
): Promise<{ data: DestaqueDiaAnalitico[]; error: string | null }> {
  const params: Record<string, unknown> = { p_empresa_id: empresaId, p_mes: mes };
  if (equipeId) params['p_equipe_id'] = equipeId;
  if (setorId)  params['p_setor_id']  = setorId;
  const { data, error } = await supabase.rpc('fn_analitico_destaques_dia', params);
  return { data: (data ?? []) as DestaqueDiaAnalitico[], error: error?.message ?? null };
}

// ── Equipes e mapa operador→equipe ────────────────────────────────────────────

export interface EquipeAnalitico {
  id: string;
  nome: string;
  setor_id: string | null;
}

export interface OperadorEquipeInfo {
  equipe_id:   string | null;
  equipe_nome: string;
  setor_id:    string | null;
}

/** Busca equipes da empresa e gera mapa operadorId → equipe (inclui setor_id). */
export async function buscarEquipesComOperadores(empresaId: string): Promise<{
  equipes: EquipeAnalitico[];
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
}> {
  const { data } = await supabase
    .from('perfis')
    .select('id, equipe_id, setor_id, equipes(id, nome, setor_id)')
    .eq('empresa_id', empresaId)
    .eq('ativo', true);

  const equipeMap = new Map<string, { nome: string; setor_id: string | null }>();
  const operadorEquipeMap: Record<string, OperadorEquipeInfo> = {};

  for (const p of (data ?? []) as {
    id: string;
    equipe_id: string | null;
    setor_id: string | null;
    equipes: { id: string; nome: string; setor_id: string | null } | null;
  }[]) {
    const eq = p.equipes;
    operadorEquipeMap[p.id] = {
      equipe_id:   p.equipe_id ?? null,
      equipe_nome: eq?.nome ?? 'Sem equipe',
      // Setor da equipe; quem não tem equipe usa o setor do próprio perfil
      setor_id:    eq?.setor_id ?? p.setor_id ?? null,
    };
    if (p.equipe_id && eq?.nome) {
      equipeMap.set(p.equipe_id, { nome: eq.nome, setor_id: eq.setor_id ?? null });
    }
  }

  const equipes: EquipeAnalitico[] = Array.from(equipeMap.entries())
    .map(([id, v]) => ({ id, nome: v.nome, setor_id: v.setor_id }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return { equipes, operadorEquipeMap };
}

// ── Resumo mensal (snapshot salvo na importação) ──────────────────────────────

export interface ResumoMensalAnalitico {
  total_recebido:   number;
  total_ho:         number;
  total_operadores: number;
  total_pagamentos: number;
  periodo_inicio:   string | null;
  periodo_fim:      string | null;
  atualizado_em:    string | null;
}

export async function buscarResumoMensal(
  empresaId: string,
  mes: string,
): Promise<{ data: ResumoMensalAnalitico | null; error: string | null }> {
  const { data, error } = await supabase
    .from('analitico_resumo_mensal')
    .select('total_recebido, total_ho, total_operadores, total_pagamentos, periodo_inicio, periodo_fim, atualizado_em')
    .eq('empresa_id', empresaId)
    .eq('mes', mes)
    .maybeSingle();
  return { data: data as ResumoMensalAnalitico | null, error: error?.message ?? null };
}

/** Agrega totais do mês diretamente no banco via RPC e salva o snapshot. */
export async function atualizarResumoMensal(
  empresaId: string,
  mes: string,
): Promise<void> {
  await supabase.rpc('fn_analitico_atualizar_resumo', {
    p_empresa_id: empresaId,
    p_mes:        mes,
  });
}

/**
 * Para acordos de cartão com mesmo operador e código, marca como 'pago'
 * sincronizando valor e data de pagamento (analítico tem prioridade).
 * Também atualiza status_tabulacao das linhas correspondentes.
 */
export async function sincronizarCartoesPagos(
  empresaId: string,
  mes: string,
): Promise<{ atualizados: number; error: string | null }> {
  const { data, error } = await supabase.rpc('fn_sincronizar_cartoes_pagos', {
    p_empresa_id: empresaId,
    p_mes:        mes,
  });
  return { atualizados: (data as number) ?? 0, error: error?.message ?? null };
}

// ── Verificar e atualizar status de tabulação ─────────────────────────────────

/**
 * Verifica o status de tabulação de uma linha de recebimento.
 * Cruza com a tabela `acordos` usando campo `instituicao == codigo`.
 * Retorna:
 *   - 'nao_tabulado': nenhum acordo com esse código
 *   - 'tabulado': há acordo do mesmo operador
 *   - 'divergente': há acordo de outro operador
 */
export async function verificarStatusTabulacao(
  empresaId: string,
  codigo: string,
  operadorId: string,
  /** Campo do acordo que casa com o código do relatório.
   *  PaguePlay usa 'instituicao'; BookPlay usa 'nr_cliente' (o NR). */
  campo: 'instituicao' | 'nr_cliente' = 'instituicao',
): Promise<{ status: StatusTabulacaoAnalitico; acordoId: string | null; outroOperadorId: string | null; outroOperadorNome: string | null }> {
  const { data } = await supabase
    .from('acordos')
    .select('id, operador_id, tipo_vinculo, perfis(nome)')
    .eq('empresa_id', empresaId)
    .eq(campo, normCodigo(codigo))
    .in('tipo_vinculo', ['direto'])
    .limit(1)
    .maybeSingle();

  if (!data) return { status: 'nao_tabulado', acordoId: null, outroOperadorId: null, outroOperadorNome: null };

  if (data.operador_id === operadorId) {
    return { status: 'tabulado', acordoId: data.id, outroOperadorId: null, outroOperadorNome: null };
  }

  const nomeOutro = (data.perfis as { nome?: string } | null)?.nome ?? null;
  return {
    status:           'divergente',
    acordoId:         data.id,
    outroOperadorId:  data.operador_id,
    outroOperadorNome: nomeOutro,
  };
}

/** Atualiza status_tabulacao e accord_id de uma linha */
export async function atualizarTabulacao(
  id: string,
  status: StatusTabulacaoAnalitico,
  acordoId: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('analitico_recebimentos')
    .update({ status_tabulacao: status, acordo_id: acordoId })
    .eq('id', id);
  return { error: error?.message ?? null };
}

// ── Caso divergente: transferir sem autorização do líder ─────────────────────

export interface TabularDivergenteParams {
  linhaId: string;
  empresaId: string;
  codigo: string;
  acordoExistenteId: string;
  outroOperadorId: string;
  outroOperadorNome: string;
  novoOperadorId: string;
  novoOperadorNome: string;
  liderId?: string | null;
}

/**
 * Remove o acordo existente do outro operador (para lixeira, motivo transferencia_nr)
 * e atualiza a linha analítica para status 'tabulado'.
 * NÃO exige autorização do líder — diferença vs. fluxo normal.
 * Notifica o outro operador e o líder. Registra em logs_sistema.
 */
export async function tabularDivergente(
  params: TabularDivergenteParams,
): Promise<{ error: string | null }> {
  const {
    linhaId, empresaId, codigo, acordoExistenteId,
    outroOperadorId, outroOperadorNome,
    novoOperadorId, novoOperadorNome, liderId,
  } = params;

  // 1. Buscar o acordo completo para enviar à lixeira
  const { data: acordo, error: errAcordo } = await supabase
    .from('acordos')
    .select('*')
    .eq('id', acordoExistenteId)
    .maybeSingle();

  if (errAcordo || !acordo) {
    return { error: errAcordo?.message ?? 'Acordo não encontrado.' };
  }

  // 2. Enviar para a lixeira (transferência sem autorização)
  const resultLixeira = await enviarParaLixeira({
    acordo: acordo as unknown as Acordo,
    motivo: 'transferencia_nr',
    operadorNome:        outroOperadorNome,
    transferidoParaId:   novoOperadorId,
    transferidoParaNome: novoOperadorNome,
  });

  if (!resultLixeira.ok) {
    return { error: resultLixeira.error ?? 'Falha ao enviar acordo para lixeira.' };
  }

  // 3. Deletar o acordo do outro operador
  await supabase.from('acordos').delete().eq('id', acordoExistenteId);

  // 4. Atualizar a linha analítica para 'nao_tabulado' (operador tabula na sequência)
  await atualizarTabulacao(linhaId, 'nao_tabulado', null);

  // 5. Notificar o outro operador
  await criarNotificacao({
    usuario_id: outroOperadorId,
    empresa_id: empresaId,
    titulo:     'Acordo transferido — Analítico',
    mensagem:
      `Seu acordo do código ${codigo} foi transferido para ${novoOperadorNome} ` +
      `via lançamento no Analítico. Verifique a Lixeira para detalhes.`,
  });

  // 6. Notificar o líder (impacto em comissão)
  if (liderId) {
    await criarNotificacao({
      usuario_id: liderId,
      empresa_id: empresaId,
      titulo:     `Transferência automática — cód. ${codigo}`,
      mensagem:
        `O operador ${novoOperadorNome} reivindicou o código ${codigo} via Analítico. ` +
        `O acordo foi removido de ${outroOperadorNome} e transferido. Verifique o impacto em comissão.`,
    });
  }

  // 7. Registrar em logs_sistema
  await supabase.from('logs_sistema').insert({
    usuario_id:  novoOperadorId,
    acao:        'TRANSFERENCIA_ANALITICO',
    tabela:      'acordos',
    registro_id: acordoExistenteId,
    empresa_id:  empresaId,
    detalhes: {
      codigo,
      de_operador_id:   outroOperadorId,
      de_operador_nome: outroOperadorNome,
      para_operador_id:   novoOperadorId,
      para_operador_nome: novoOperadorNome,
    },
  });

  return { error: null };
}

// ── Notificar todos os usuários após importação ───────────────────────────────

export async function notificarImportacaoAnalitico(
  empresaId: string,
  mes: string,
  importadorNome: string,
  /** Escopo por setor: notifica só os perfis do setor do importador +
   *  os operadores vinculados no lote (que podem ser de outro setor).
   *  Sem setor (PP/importador sem setor cadastrado) → todos, como antes. */
  escopo?: { setorId?: string | null; operadorIds?: string[] },
): Promise<void> {
  let q = supabase
    .from('perfis')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('ativo', true);
  if (escopo?.setorId) q = q.eq('setor_id', escopo.setorId);

  const { data: perfis } = await q;

  const ids = new Set<string>((perfis ?? []).map(p => p.id as string));
  if (escopo?.setorId) for (const id of escopo.operadorIds ?? []) ids.add(id);
  if (!ids.size) return;

  const notifs = [...ids].map(usuarioId => ({
    usuario_id: usuarioId,
    empresa_id: empresaId,
    titulo:     'Analítico atualizado',
    mensagem:   `${importadorNome} importou os recebimentos de ${mes}. Acesse a aba Analítico para ver seus pagamentos.`,
    lida:       false,
  }));

  // Inserir em chunks para não exceder limites
  const CHUNK = 100;
  for (let i = 0; i < notifs.length; i += CHUNK) {
    await supabase.from('notificacoes').insert(notifs.slice(i, i + CHUNK));
  }
}
