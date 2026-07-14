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
  /** Linhas já existentes cujo valor foi corrigido para cima (novas parcelas
   *  do mesmo NR desde a última importação). */
  atualizados: number;
  erros: string[];
}

/**
 * Persiste linhas no banco usando INSERT ... ON CONFLICT DO NOTHING.
 * Chave de unicidade: (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario).
 * Operadores não encontrados têm operador_id = null (visíveis só para líder+).
 *
 * Reconciliação: quando a linha já existe MAS o valor do relatório é MAIOR
 * (o NR recebeu novas parcelas e a consolidação cai na mesma chave), o valor
 * é atualizado — antes o ignoreDuplicates descartava a linha nova e a
 * diferença nunca entrava no sistema (card menor que o total do relatório).
 * Só aumenta, nunca diminui: um relatório parcial (de um dia) não rebaixa o
 * acumulado do mês já importado.
 */
export async function importarLoteAnalitico(
  empresaId: string,
  importadoPorId: string,
  loteId: string,
  linhas: LinhaRelatorio[],
  operadoresMap: OperadorResolvidoMap,
  /** BookPlay: setor da importação — dá dono às linhas SEM operador (órfãos),
   *  que passam a contar no card do setor. Requer a migration 20260712a. */
  setorImportacaoId?: string | null,
): Promise<ResultadoImportacao> {
  if (!linhas.length) return { inseridos: 0, duplicados: 0, atualizados: 0, erros: [] };

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
  let atualizados = 0;
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

  // ── Setor da importação (BookPlay) ──────────────────────────────────────────
  // Carimba o setor nas linhas do lote e nos órfãos que já existiam sem setor
  // (dedupe). Se a coluna ainda não existe (migration 20260712a pendente), os
  // updates falham em silêncio e tudo continua funcionando como antes.
  if (setorImportacaoId) {
    await supabase
      .from('analitico_recebimentos')
      .update({ setor_id: setorImportacaoId })
      .eq('empresa_id', empresaId)
      .eq('lote_id', loteId);

    const codigosOrfaos = [...new Set(rows.filter(r => !r.operador_id).map(r => r.codigo))];
    for (let i = 0; i < codigosOrfaos.length; i += CHUNK) {
      await supabase
        .from('analitico_recebimentos')
        .update({ setor_id: setorImportacaoId })
        .eq('empresa_id', empresaId)
        .is('operador_id', null)
        .is('setor_id', null)
        .in('codigo', codigosOrfaos.slice(i, i + CHUNK));
    }
  }

  // ── Reconciliação por NR: o relatório é a VERDADE do mês ───────────────────
  // Para cada (operador, NR, mês) presente no relatório, a SOMA das linhas no
  // banco tem que ser igual ao valor do relatório. Isso cobre todos os casos
  // em que a dedupe deixava o total divergir do arquivo:
  //   • novas parcelas do NR caindo na mesma chave (linha descartada);
  //   • NR dividido em várias linhas por importações parciais antigas;
  //   • duplicata com chave diferente (forma/data da 1ª parcela mudou).
  // O ajuste é aplicado na linha de mesma chave (ou na de maior valor),
  // preservando tabulação e "visto" das demais.
  type ExRow = {
    id: string; codigo: string; operador_usuario: string; mes_referencia: string;
    data_pagamento: string; forma_pagamento: string; valor_recebido: number; total_ho: number;
  };
  type RowImport = (typeof rows)[number];
  const grupoDe = (r: { operador_usuario: string; codigo: string; mes_referencia: string }) =>
    `${r.operador_usuario}::${r.codigo}::${r.mes_referencia}`;

  // Agrega as linhas do relatório por grupo (operador, NR, mês). Um NR pode vir
  // em VÁRIAS linhas no mês (datas/formas diferentes) — cada uma vira uma linha
  // no banco (chave de dedupe distinta). O alvo da reconciliação tem que ser a
  // SOMA dessas linhas, senão comparamos o total do banco contra uma parcela só
  // e o delta fica negativo à toa ("banco tem 2× o relatório").
  // Deduplica por (data_pagamento, forma_pagamento) — mesmo critério do banco —
  // para não contar em dobro uma duplicata exata do arquivo.
  type AlvoAgg = { rep: RowImport; valor: number; ho: number };
  const alvoPorGrupo = new Map<string, AlvoAgg>();
  const chavesVistasPorGrupo = new Map<string, Set<string>>();
  for (const r of rows) {
    const k  = grupoDe(r);
    const dk = `${r.data_pagamento}::${r.forma_pagamento}`;
    let vistas = chavesVistasPorGrupo.get(k);
    if (!vistas) { vistas = new Set(); chavesVistasPorGrupo.set(k, vistas); }
    const cur = alvoPorGrupo.get(k);
    if (!cur) {
      alvoPorGrupo.set(k, { rep: r, valor: r.valor_recebido, ho: r.total_ho });
      vistas.add(dk);
    } else if (!vistas.has(dk)) {
      cur.valor += r.valor_recebido;
      cur.ho    += r.total_ho;
      vistas.add(dk);
    }
  }

  const codigos = [...new Set(rows.map(r => r.codigo))];
  const meses   = [...new Set(rows.map(r => r.mes_referencia))];
  const existentes: ExRow[] = [];
  for (let i = 0; i < codigos.length; i += CHUNK) {
    const { data } = await supabase
      .from('analitico_recebimentos')
      .select('id, codigo, operador_usuario, mes_referencia, data_pagamento, forma_pagamento, valor_recebido, total_ho')
      .eq('empresa_id', empresaId)
      .in('mes_referencia', meses)
      .in('codigo', codigos.slice(i, i + CHUNK));
    existentes.push(...((data ?? []) as ExRow[]));
  }

  const dbPorGrupo = new Map<string, ExRow[]>();
  for (const ex of existentes) {
    const k = grupoDe(ex);
    if (!alvoPorGrupo.has(k)) continue;
    const lista = dbPorGrupo.get(k);
    if (lista) lista.push(ex); else dbPorGrupo.set(k, [ex]);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  for (const [k, agg] of alvoPorGrupo) {
    const alvo = agg.rep;                 // linha representante (chave/detalhe)
    const doBanco = dbPorGrupo.get(k) ?? [];
    if (!doBanco.length) continue; // linha nem inseriu (erro já reportado no chunk)

    const somaDb = doBanco.reduce((s, x) => s + (Number(x.valor_recebido) || 0), 0);
    const delta  = agg.valor - somaDb;    // SOMA do relatório no grupo vs soma do banco
    if (Math.abs(delta) <= 0.005) continue;

    const chaveIgual = doBanco.find(x =>
      x.data_pagamento === alvo.data_pagamento && x.forma_pagamento === alvo.forma_pagamento);
    const linha = chaveIgual
      ?? doBanco.reduce((a, b) => (Number(a.valor_recebido) >= Number(b.valor_recebido) ? a : b));

    const novoValor = round2((Number(linha.valor_recebido) || 0) + delta);
    if (novoValor < 0) {
      erros.push(
        `NR ${alvo.codigo} (${alvo.operador_usuario}): banco tem ${somaDb.toFixed(2)} em ` +
        `${doBanco.length} linha(s), relatório diz ${agg.valor.toFixed(2)} — ` +
        `ajuste manual necessário (use "Limpar mês" e reimporte).`,
      );
      continue;
    }
    const somaHoDb = doBanco.reduce((s, x) => s + (Number(x.total_ho) || 0), 0);
    const novoHo   = round2(Math.max((Number(linha.total_ho) || 0) + (agg.ho - somaHoDb), 0));

    const { error: errUp } = await supabase
      .from('analitico_recebimentos')
      .update({
        valor_recebido: novoValor,
        total_ho:       novoHo,
        // Detalhamento completo só faz sentido quando o NR está numa linha única
        ...(doBanco.length === 1 ? { pagamentos_detalhados: alvo.pagamentos_detalhados } : {}),
      })
      .eq('id', linha.id);
    if (errUp) erros.push(`Atualização ${alvo.codigo}: ${errUp.message}`);
    else atualizados++;
  }

  return { inseridos, duplicados, atualizados, erros };
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

// ── Total dos órfãos (sem operador) por setor ─────────────────────────────────
// Órfão pertence ao setor da importação (setor_id da linha; linhas antigas caem
// no setor de quem importou). O card "Total recebido" do setor e o painel do
// setor em Desempenho Equipes somam esses valores — sem isso o card fica menor
// que o total do relatório sempre que o arquivo traz operadores sem conta.

export async function buscarTotalOrfaosPorSetor(
  empresaId: string,
  mes: string,   // 'yyyy-MM'
): Promise<Record<string, { total: number; qtd: number }>> {
  const [y, m] = mes.split('-').map(Number);
  const primeiro = `${mes}-01`;
  const fim      = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

  interface RowOrfao { valor_recebido: number; setor_id?: string | null; importado_por_id: string | null }
  const buscar = async (comSetor: boolean): Promise<RowOrfao[] | null> => {
    const cols = comSetor
      ? 'valor_recebido, setor_id, importado_por_id'
      : 'valor_recebido, importado_por_id';
    const PAGE = 1000;
    const linhas: RowOrfao[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('analitico_recebimentos')
        .select(cols)
        .eq('empresa_id', empresaId)
        .is('operador_id', null)
        .gte('data_pagamento', primeiro)
        .lte('data_pagamento', fim)
        .range(offset, offset + PAGE - 1);
      if (error) return null;
      linhas.push(...((data ?? []) as unknown as RowOrfao[]));
      if (!data?.length || data.length < PAGE) break;
      offset += PAGE;
    }
    return linhas;
  };

  // Coluna setor_id pode não existir ainda (migration 20260712a) → fallback
  const linhas = (await buscar(true)) ?? (await buscar(false));
  if (!linhas?.length) return {};

  const { data: perfis } = await supabase
    .from('perfis')
    .select('id, setor_id')
    .eq('empresa_id', empresaId);
  const setorDoPerfil = new Map(
    ((perfis ?? []) as { id: string; setor_id: string | null }[]).map(p => [p.id, p.setor_id]));

  const porSetor: Record<string, { total: number; qtd: number }> = {};
  for (const l of linhas) {
    const sid = l.setor_id ?? setorDoPerfil.get(l.importado_por_id ?? '') ?? null;
    if (!sid) continue;
    const acc = porSetor[sid] ?? (porSetor[sid] = { total: 0, qtd: 0 });
    acc.total += Number(l.valor_recebido) || 0;
    acc.qtd   += 1;
  }
  return porSetor;
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

/** Busca equipes da empresa e gera mapa operadorId → equipe (inclui setor_id).
 *  `equipesExtrasPorOperador` traz as equipes em que o operador é CLONE
 *  (equipe_operadores_clones): o recebimento dele conta nelas também. */
export async function buscarEquipesComOperadores(empresaId: string): Promise<{
  equipes: EquipeAnalitico[];
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  equipesExtrasPorOperador: Record<string, string[]>;
}> {
  const { data } = await supabase
    .from('perfis')
    .select('id, equipe_id, setor_id, equipes(id, nome, setor_id)')
    .eq('empresa_id', empresaId)
    .eq('ativo', true);

  // Equipes vêm da tabela, não dos perfis: uma equipe formada SÓ por clones
  // (ex.: "Digital Amauri" dentro do Play 5) não tem nenhum perfil apontando
  // para ela e sumia da lista — ficava sem card e sem setor no consolidado.
  const { data: equipesData } = await supabase
    .from('equipes')
    .select('id, nome, setor_id')
    .eq('empresa_id', empresaId);

  // Clones (tabela pode não existir — migration 20260712a pendente → vazio)
  const { data: clones } = await supabase
    .from('equipe_operadores_clones')
    .select('equipe_id, operador_id')
    .eq('empresa_id', empresaId);
  const equipesExtrasPorOperador: Record<string, string[]> = {};
  // Equipes que têm gente: membro de verdade OU clone. Sem isso, equipe vazia
  // de propósito passaria a aparecer zerada no painel.
  const comGente = new Set<string>();
  for (const c of ((clones ?? []) as { equipe_id: string; operador_id: string }[])) {
    (equipesExtrasPorOperador[c.operador_id] ??= []).push(c.equipe_id);
    comGente.add(c.equipe_id);
  }

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
    if (p.equipe_id) comGente.add(p.equipe_id);
  }

  const equipes: EquipeAnalitico[] = ((equipesData ?? []) as {
    id: string; nome: string; setor_id: string | null;
  }[])
    .filter(e => comGente.has(e.id))
    .map(e => ({ id: e.id, nome: e.nome, setor_id: e.setor_id ?? null }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return { equipes, operadorEquipeMap, equipesExtrasPorOperador };
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
