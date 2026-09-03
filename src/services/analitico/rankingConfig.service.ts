/**
 * rankingConfig.service.ts — a regra do ranking do Analítico, por setor.
 *
 * Três decisões da gerência do setor moram aqui:
 *
 *   • o CRITÉRIO da ordenação (recebimento, percentual da meta, ou equipes);
 *   • quais equipes/subgrupos participam;
 *   • quais pessoas ficam de fora, uma a uma.
 *
 * ## Sem linha no banco é um estado válido
 *
 * Setor que nunca foi configurado devolve `CONFIG_RANKING_PADRAO`: ordena por
 * recebimento, todo mundo dentro. É exatamente o que o ranking fazia antes
 * desta configuração existir — ninguém precisa abrir a tela de config para o
 * placar continuar funcionando.
 *
 * Por isso `buscarRankingConfig` nunca devolve `null` por "não achou": `null`
 * é reservado para a tabela ausente (migration pendente), e aí a tela esconde
 * o botão de configurar em vez de oferecer um formulário que não salva.
 */

import { supabase } from '@/lib/supabase';

/** Como o ranking ordena. */
export type CriterioRanking =
  /** Maior recebimento primeiro. O comportamento histórico. */
  | 'recebimento'
  /** Maior percentual da meta/projeção primeiro — quem tem meta menor disputa igual. */
  | 'percentual'
  /** O pódio deixa de ser de pessoas e passa a ser de equipes/subgrupos. */
  | 'equipes';

export const CRITERIOS_RANKING: readonly CriterioRanking[] =
  ['recebimento', 'percentual', 'equipes'];

export interface RankingConfig {
  criterio: CriterioRanking;
  /** Ids de equipe/subgrupo que participam. VAZIO = todos participam. */
  gruposIncluidos: string[];
  /** Ids de pessoas que ficam de fora. VAZIO = ninguém excluído. */
  perfisExcluidos: string[];
}

export const CONFIG_RANKING_PADRAO: RankingConfig = {
  criterio:        'recebimento',
  gruposIncluidos: [],
  perfisExcluidos: [],
};

/** Linha crua, antes de virar `RankingConfig`. */
interface LinhaConfig {
  criterio: string | null;
  grupos_incluidos: string[] | null;
  perfis_excluidos: string[] | null;
}

/** Critério vindo do banco, com o padrão para valor desconhecido. */
function lerCriterio(bruto: string | null | undefined): CriterioRanking {
  return CRITERIOS_RANKING.includes(bruto as CriterioRanking)
    ? (bruto as CriterioRanking)
    : 'recebimento';
}

/**
 * A configuração de um setor.
 *
 * `null` = a tabela não existe neste banco ainda. Qualquer outro caso — sem
 * linha, linha incompleta — devolve config utilizável.
 */
export async function buscarRankingConfig(
  empresaId: string,
  setorId: string,
): Promise<RankingConfig | null> {
  const { data, error } = await supabase
    .from('analitico_ranking_config')
    .select('criterio, grupos_incluidos, perfis_excluidos')
    .eq('empresa_id', empresaId)
    .eq('setor_id', setorId)
    .maybeSingle();

  if (error) return null;
  if (!data) return CONFIG_RANKING_PADRAO;

  const linha = data as LinhaConfig;
  return {
    criterio:        lerCriterio(linha.criterio),
    gruposIncluidos: linha.grupos_incluidos ?? [],
    perfisExcluidos: linha.perfis_excluidos ?? [],
  };
}

/**
 * Grava a configuração do setor.
 *
 * `upsert` com conflito em `setor_id`, que é a PK: um setor tem uma regra, e
 * salvar duas vezes reescreve a mesma linha em vez de acumular histórico que
 * ninguém lê.
 */
export async function salvarRankingConfig(
  empresaId: string,
  setorId: string,
  config: RankingConfig,
  atualizadoPor?: string | null,
): Promise<{ ok: boolean; erro: string | null }> {
  const { error } = await supabase
    .from('analitico_ranking_config')
    .upsert({
      setor_id:         setorId,
      empresa_id:       empresaId,
      criterio:         config.criterio,
      grupos_incluidos: config.gruposIncluidos,
      perfis_excluidos: config.perfisExcluidos,
      atualizado_em:    new Date().toISOString(),
      atualizado_por:   atualizadoPor ?? null,
    }, { onConflict: 'setor_id' });

  return { ok: !error, erro: error?.message ?? null };
}
