/**
 * rankingCriterio.ts — quem entra no ranking, e em que ordem.
 *
 * Módulo puro de propósito: a decisão "este operador participa?" e a decisão
 * "quem vem antes?" são as duas coisas do ranking que alguém vai contestar
 * olhando a tela ("por que fulano está na frente?"), e resposta contestável
 * precisa de teste, não de `useMemo` no meio de um componente de 1200 linhas.
 *
 * ## Os três critérios
 *
 * `recebimento` — maior valor primeiro. É como o ranking sempre funcionou.
 *
 * `percentual` — maior percentual da meta primeiro. Existe porque comparar
 * valor bruto entre pessoas com metas diferentes premia quem tem a meta maior
 * antes de premiar quem produziu mais em relação ao que se esperava dela.
 *
 * `equipes` — o pódio deixa de ser de pessoas e passa a ser de equipes e
 * subgrupos, somados.
 *
 * ## Por que `esperado` viaja junto com `pct`
 *
 * Para agregar percentual de um grupo não serve a média dos percentuais das
 * pessoas: numa equipe com uma meta de R$ 100 mil a 90% e uma de R$ 5 mil a
 * 200%, a média diz 145% e a equipe está longe de bater. O certo é somar o
 * recebido, somar o esperado, e dividir — e para isso o esperado de cada
 * pessoa tem que chegar aqui.
 */

import type { ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';
import type { CriterioRanking, RankingConfig } from '@/services/analitico/rankingConfig.service';

/** Um operador do ranking, já com grupo e percentual resolvidos. */
export interface LinhaRanking extends ResumoOperadorAnalitico {
  /** Subgrupo da pessoa, ou a equipe quando não há subgrupo. `null` = sem equipe. */
  grupoId: string | null;
  grupoNome: string | null;
  /**
   * `recebido ÷ esperado × 100`. `null` = sem meta.
   *
   * Sem meta NÃO é 0%: quem não tem meta não está atrasado, está sem régua. A
   * ordenação por percentual joga esses para o fim em vez de para o fundo.
   */
  pct: number | null;
  /** Quanto já deveria ter entrado até hoje. `null` quando não há meta. */
  esperado: number | null;
}

/** Uma equipe/subgrupo no ranking agregado. */
export interface LinhaGrupoRanking {
  grupoId: string | null;
  grupoNome: string;
  totalRecebido: number;
  totalPagamentos: number;
  /** Percentual do GRUPO: recebido somado ÷ esperado somado. `null` = ninguém com meta. */
  pct: number | null;
  /** Quantas pessoas do grupo entraram na conta. */
  operadores: number;
}

/**
 * Esta pessoa participa do ranking?
 *
 * Duas perguntas, nesta ordem:
 *
 * 1. O grupo dela está entre os que participam? Lista VAZIA significa "todos" —
 *    é o estado inicial, e é o que mantém o ranking funcionando em setor que
 *    nunca abriu a configuração.
 * 2. Ela foi excluída individualmente? A exclusão nominal vence a inclusão do
 *    grupo: é o caso "a equipe toda disputa, menos o supervisor".
 */
export function participaDoRanking(linha: LinhaRanking, config: RankingConfig): boolean {
  if (config.perfisExcluidos.includes(linha.operador_id)) return false;
  if (config.gruposIncluidos.length === 0) return true;
  return linha.grupoId !== null && config.gruposIncluidos.includes(linha.grupoId);
}

/** As linhas que disputam, na ordem em que chegaram. */
export function filtrarParticipantes(
  linhas: LinhaRanking[], config: RankingConfig,
): LinhaRanking[] {
  return linhas.filter(l => participaDoRanking(l, config));
}

/**
 * Ordena os operadores pelo critério.
 *
 * `equipes` cai no mesmo caminho de `recebimento` porque, quando o critério é
 * de grupo, esta lista deixa de ser o pódio e vira o detalhamento de dentro de
 * cada grupo — e lá dentro a leitura útil continua sendo o valor.
 *
 * Empate no percentual desempata pelo recebimento, e não por ordem de chegada:
 * duas pessoas a 120% aparecendo em ordem aleatória a cada carregamento é o
 * tipo de coisa que faz a tela parecer quebrada.
 */
export function ordenarLinhas(
  linhas: LinhaRanking[], criterio: CriterioRanking,
): LinhaRanking[] {
  const ordenadas = [...linhas];

  if (criterio === 'percentual') {
    ordenadas.sort((a, b) => {
      // Sem meta vai para o fim, sempre — inclusive quando os dois estão sem.
      if (a.pct === null && b.pct === null) return b.total_recebido - a.total_recebido;
      if (a.pct === null) return 1;
      if (b.pct === null) return -1;
      if (b.pct !== a.pct) return b.pct - a.pct;
      return b.total_recebido - a.total_recebido;
    });
    return ordenadas;
  }

  ordenadas.sort((a, b) => b.total_recebido - a.total_recebido);
  return ordenadas;
}

/**
 * Soma as linhas por equipe/subgrupo, já ordenadas pelo critério.
 *
 * Quem está sem grupo (`grupoId` nulo) entra como um grupo próprio, com o nome
 * que a tela passar. Descartá-los faria o pódio de equipes somar menos que o
 * total do setor — a diferença apareceria em outra aba e ninguém saberia de
 * onde veio.
 */
export function agregarGrupos(
  linhas: LinhaRanking[],
  criterio: CriterioRanking,
  nomeSemGrupo = 'Sem equipe',
): LinhaGrupoRanking[] {
  const acc = new Map<string, {
    grupoId: string | null; grupoNome: string;
    recebido: number; pagamentos: number; esperado: number; comMeta: number; operadores: number;
  }>();

  for (const l of linhas) {
    const chave = l.grupoId ?? '__sem_grupo__';
    const atual = acc.get(chave) ?? {
      grupoId:   l.grupoId,
      grupoNome: l.grupoNome ?? nomeSemGrupo,
      recebido: 0, pagamentos: 0, esperado: 0, comMeta: 0, operadores: 0,
    };
    atual.recebido   += l.total_recebido;
    atual.pagamentos += Number(l.total_pagamentos) || 0;
    atual.operadores += 1;
    if (l.esperado !== null && l.esperado > 0) {
      atual.esperado += l.esperado;
      atual.comMeta  += 1;
    }
    acc.set(chave, atual);
  }

  const grupos: LinhaGrupoRanking[] = [...acc.values()].map(g => ({
    grupoId:         g.grupoId,
    grupoNome:       g.grupoNome,
    totalRecebido:   g.recebido,
    totalPagamentos: g.pagamentos,
    // Só há percentual de grupo quando ALGUÉM lá dentro tem meta. Um grupo
    // inteiro sem meta é "sem régua", não 0%.
    pct: g.comMeta > 0 && g.esperado > 0
      ? Math.round((g.recebido / g.esperado) * 100)
      : null,
    operadores: g.operadores,
  }));

  grupos.sort((a, b) => {
    if (criterio === 'percentual') {
      if (a.pct === null && b.pct === null) return b.totalRecebido - a.totalRecebido;
      if (a.pct === null) return 1;
      if (b.pct === null) return -1;
      if (b.pct !== a.pct) return b.pct - a.pct;
    }
    return b.totalRecebido - a.totalRecebido;
  });

  return grupos;
}

/** Rótulo do critério para a tela — um lugar só, para as duas abas dizerem igual. */
export const LABEL_CRITERIO: Record<CriterioRanking, string> = {
  recebimento: 'Recebimento',
  percentual:  'Percentual da meta',
  equipes:     'Equipes',
};

/** Explicação curta do critério, para o seletor de configuração. */
export const DESCRICAO_CRITERIO: Record<CriterioRanking, string> = {
  recebimento: 'Maior valor recebido no mês vem primeiro.',
  percentual:  'Maior percentual da meta/projeção vem primeiro. Quem não tem meta fica no fim.',
  equipes:     'O pódio é de equipes e subgrupos somados, não de pessoas.',
};
