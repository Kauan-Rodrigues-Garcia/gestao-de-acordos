/**
 * rankingQuitacao.service.ts — o banco do Ranking de quitação (migrations
 * 20261006120000 e 20261111150500).
 *
 *   ranking_quitacao_setores  — em que setor a aba existe, os prêmios e a
 *                               config (disputa, critério, destaques…). A
 *                               tela lê direto (policy de leitura por empresa).
 *   fn_ranking_quitacao       — o ranking do setor no mês. A conta é a mesma
 *                               do Modo TV (`fn_ranking_quitacao_calcular`).
 *   fn_ranking_quitacao_importar      — grava a foto do mês (substitui) e
 *                                       avisa as TVs e a aba.
 *   fn_ranking_quitacao_definir_setor — liga/desliga o setor, prêmios e config.
 *
 * O pacote é lido por `normalizarRanking` (ranking.ts), o mesmo leitor da TV.
 *
 * As tabelas e funções ainda não estão nos tipos gerados: daí `tabelaSemTipo`
 * e `rpcSemTipo`.
 */
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';
import type { AcordoQuitado } from './relatorioQuitacao';
import { lerConfig, normalizarRanking, type ConfigRanking, type RankingQuitacao } from './ranking';

export { PREMIOS_PADRAO } from './ranking';
export type { PosicaoRanking, RankingQuitacao } from './ranking';

export interface SetorDoRanking {
  setor_id: string;
  ativo: boolean;
  premios: number[];
  config: ConfigRanking;
}

/** Coluna/função que ainda não existe = migration 20261111150500 não aplicada. */
export function semMigrationDoRanking(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
  return /does not exist|não existe|schema cache|PGRST20[0-9]|42703|42883|p_config/i.test(m);
}

type LinhaSetor = { setor_id: string; ativo: boolean; premios: (number | string)[]; config?: unknown };

export async function listarSetoresDoRanking(empresaId: string): Promise<SetorDoRanking[]> {
  let { data, error } = await tabelaSemTipo<LinhaSetor>('ranking_quitacao_setores')
    .select('setor_id, ativo, premios, config')
    .eq('empresa_id', empresaId);
  // Antes de 20261111150500 não há `config`: lê sem ela.
  if (error && semMigrationDoRanking(error)) {
    ({ data, error } = await tabelaSemTipo<LinhaSetor>('ranking_quitacao_setores')
      .select('setor_id, ativo, premios')
      .eq('empresa_id', empresaId));
  }
  if (error) throw new Error(error.message);
  // NUMERIC chega como texto do PostgREST em alguns casos.
  return (data ?? []).map(s => ({
    setor_id: s.setor_id, ativo: s.ativo, premios: (s.premios ?? []).map(Number), config: lerConfig(s.config),
  }));
}

/**
 * Liga/desliga o setor e, se vierem, grava prêmios e config. Sem `config` a
 * chamada é a mesma de antes da migration — ligar e desligar continuam
 * funcionando com ela pendente.
 */
export async function definirSetorDoRanking(
  empresaId: string, setorId: string, ativo: boolean, premios?: number[], config?: Record<string, unknown>,
): Promise<void> {
  const args: Record<string, unknown> = {
    p_empresa_id: empresaId, p_setor_id: setorId, p_ativo: ativo, p_premios: premios ?? null,
  };
  if (config) args.p_config = config;
  const { error } = await rpcSemTipo('fn_ranking_quitacao_definir_setor', args);
  if (error) {
    if (config && semMigrationDoRanking(error)) {
      throw new Error('A configuração nova do ranking (equipes, critério, destaques) chega com a migration 20261111150500, que ainda não foi aplicada no banco.');
    }
    throw new Error(error.message);
  }
}

export async function buscarRanking(empresaId: string, setorId: string, mes: string): Promise<RankingQuitacao> {
  const { data, error } = await rpcSemTipo<unknown>(
    'fn_ranking_quitacao', { p_empresa_id: empresaId, p_setor_id: setorId, p_mes: mes },
  );
  if (error) throw new Error(error.message);
  return normalizarRanking(data);
}

export interface SetorNaPrevia {
  setor_id: string;
  setor_nome: string;
  /** Quitações do setor já gravadas no mês. */
  no_banco: number;
  /** Quitações do setor no arquivo escolhido. */
  no_arquivo: number;
}

/**
 * Por setor, o que o mês tem gravado e o que o arquivo traz
 * (`fn_ranking_quitacao_previa`, 20261112210000). `null` quando a função
 * ainda não existe no banco: a importação continua, sem a conferência.
 */
export async function previaDaImportacao(
  empresaId: string, mes: string, operadores: (string | null)[],
): Promise<SetorNaPrevia[] | null> {
  const { data, error } = await rpcSemTipo<{ setor_id: string; setor_nome: string; no_banco: number | string; no_arquivo: number | string }[]>(
    'fn_ranking_quitacao_previa',
    { p_empresa_id: empresaId, p_mes: mes, p_operadores: operadores.filter((x): x is string => !!x) },
  );
  if (error) {
    if (semMigrationDoRanking(error)) return null;
    throw new Error(error.message);
  }
  return (data ?? []).map(s => ({
    setor_id: s.setor_id, setor_nome: s.setor_nome, no_banco: Number(s.no_banco) || 0, no_arquivo: Number(s.no_arquivo) || 0,
  }));
}

/** Grava os acordos quitados do mês (substitui a importação anterior). Devolve quantos entraram. */
export async function importarRanking(
  empresaId: string,
  mes: string,
  acordos: (AcordoQuitado & { operador_id: string | null })[],
): Promise<number> {
  const { data, error } = await rpcSemTipo<number>('fn_ranking_quitacao_importar', {
    p_empresa_id: empresaId, p_mes: mes, p_linhas: acordos,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
