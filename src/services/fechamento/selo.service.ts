/**
 * selo.service.ts — o selo do fechamento: os números oficiais de um mês fechado.
 *
 * O selo (`fechamento_mes` + `fechamento_mes_numeros`, migration
 * 20261029201000) é gravado pelo banco no dia 1º às 00:02 e de novo nos dias 2
 * a 5, quando o relatório do último dia muda algum número (20261031200000).
 * Nunca é alterado nem apagado: cada correção é uma VERSÃO nova, com motivo e
 * autor. Só o super admin sela à mão (`fn_fechamento_mes_selar`).
 *
 * Até 31/10/2026 nenhuma tela lia o selo. A aba Fechamento › Selo do mês é a
 * primeira (chave `fechamento_sub_selo`).
 */
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';

export type NivelSelo = 'setor' | 'equipe' | 'operador';

export interface VersaoSelo {
  versao: number;
  origem: 'virada' | 'manual';
  motivo: string | null;
  seladoEm: string;
  seladoPorNome: string | null;
  /** Total da empresa no relatório e contagens do retrato. */
  resumo: {
    relatorio_total?: number;
    relatorio_total_ho?: number;
    relatorio_pagamentos?: number;
    sem_operador?: number;
    retrato_pessoas?: number;
  };
}

export interface NumeroSelo {
  nivel: NivelSelo;
  alvoId: string;
  nome: string | null;
  setorId: string | null;
  equipeId: string | null;
  recebido: number;
  recebidoHo: number;
  pagamentos: number;
  /** Só no operador: o ajuste manual, fora de `recebido`. */
  ajuste: number | null;
  meta: number | null;
}

interface LinhaVersao {
  versao: number; origem: 'virada' | 'manual'; motivo: string | null;
  selado_em: string; selado_por_nome: string | null; resumo: VersaoSelo['resumo'] | null;
}

interface LinhaNumero {
  nivel: NivelSelo; alvo_id: string; nome: string | null; setor_id: string | null;
  equipe_id: string | null; recebido: number | string; recebido_ho: number | string;
  pagamentos: number | string; ajuste: number | string | null; meta: number | string | null;
}

const num = (v: number | string | null | undefined): number => Number(v) || 0;
const numOuNulo = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

/** As versões do selo do mês, da mais recente para a mais antiga. Vazio = não selado. */
export async function listarVersoesDoSelo(empresaId: string, mes: string): Promise<VersaoSelo[]> {
  const { data, error } = await tabelaSemTipo<LinhaVersao>('fechamento_mes')
    .select('versao, origem, motivo, selado_em, selado_por_nome, resumo')
    .eq('empresa_id', empresaId).eq('mes', mes)
    .order('versao', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(v => ({
    versao: v.versao, origem: v.origem, motivo: v.motivo,
    seladoEm: v.selado_em, seladoPorNome: v.selado_por_nome, resumo: v.resumo ?? {},
  }));
}

/** Os números de uma versão do selo. */
export async function buscarNumerosDoSelo(
  empresaId: string, mes: string, versao: number,
): Promise<NumeroSelo[]> {
  const { data, error } = await tabelaSemTipo<LinhaNumero>('fechamento_mes_numeros')
    .select('nivel, alvo_id, nome, setor_id, equipe_id, recebido, recebido_ho, pagamentos, ajuste, meta')
    .eq('empresa_id', empresaId).eq('mes', mes).eq('versao', String(versao));
  if (error) throw new Error(error.message);
  return (data ?? []).map(n => ({
    nivel: n.nivel, alvoId: n.alvo_id, nome: n.nome, setorId: n.setor_id, equipeId: n.equipe_id,
    recebido: num(n.recebido), recebidoHo: num(n.recebido_ho), pagamentos: num(n.pagamentos),
    ajuste: numOuNulo(n.ajuste), meta: numOuNulo(n.meta),
  }));
}

/**
 * Sela o mês de novo (super admin, com motivo). Devolve a versão vigente: a
 * mesma de antes quando nenhum número mudou.
 */
export async function selarDeNovo(
  empresaId: string, mes: string, motivo: string,
): Promise<{ versao: number | null; erro: string | null }> {
  const { data, error } = await rpcSemTipo<number>('fn_fechamento_mes_selar', {
    p_empresa_id: empresaId, p_mes: mes, p_motivo: motivo,
  });
  if (error) return { versao: null, erro: error.message };
  return { versao: data ?? null, erro: null };
}

/**
 * As linhas que o alcance da aba mostra: sem setor em foco, tudo; com setor,
 * o setor, as equipes dele e as pessoas dele — pelo LUGAR guardado no selo
 * (onde estavam no mês). Exportada para os testes.
 */
export function numerosDoAlcance(
  numeros: readonly NumeroSelo[], nivel: NivelSelo, setorId: string | null,
): NumeroSelo[] {
  return numeros
    .filter(n => n.nivel === nivel)
    .filter(n => !setorId || (nivel === 'setor' ? n.alvoId === setorId : n.setorId === setorId))
    .sort((a, b) => b.recebido - a.recebido || (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'));
}
