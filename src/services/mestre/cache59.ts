/**
 * cache59.ts — as leituras do Painel Diretoria que saem do relatório 59.
 *
 * ## Por que (17/09/2026)
 *
 * Cada aba do painel buscava tudo de novo ao montar, e trocar de aba desmonta a
 * anterior. Ir da Visão Geral a Setores e voltar refazia `fn_mestre_diretoria_*`
 * inteiras — funções que agregam o mês do 59 e levavam de 0,5 a 6 s cada,
 * medidas em produção. O 59 muda quando alguém importa um lote, cerca de uma vez
 * por dia: a mesma pergunta, repetida em minutos, tinha a mesma resposta.
 *
 * Em cima de `cacheCurto`, que já compartilha busca em curso e expira sozinho.
 * O que este módulo acrescenta é o prefixo comum, para que UMA chamada descarte
 * todas as leituras do 59 de uma vez:
 *
 *   - o «Atualizar» do cabeçalho do painel;
 *   - toda gravação do mestre (promover lote, vincular equipe, trocar fonte,
 *     definir código) — quem grava vê o efeito sem esperar a validade.
 *
 * ## Duas validades
 *
 * `VALIDADE_59_MS` para o que só lê o 59. `VALIDADE_58_MS`, mais curta, para o
 * que cruza com o 58 (`analitico_recebimentos`): esse muda a cada importação de
 * setor, que acontece várias vezes ao dia, e uma conferência de cinco minutos
 * atrás pode acusar uma diferença que já foi resolvida.
 */
import { espiarCache, invalidarCache, lerComCache } from '@/lib/cacheCurto';

const PREFIXO = 'mestre59:';

/** Leituras que dependem só do 59. */
export const VALIDADE_59_MS = 5 * 60_000;
/** Leituras que cruzam o 59 com o 58, que muda várias vezes ao dia. */
export const VALIDADE_58_MS = 60_000;

type Parte = string | number | null | undefined;

function chave(partes: readonly Parte[]): string {
  return PREFIXO + partes.map(p => (p === null || p === undefined ? '-' : String(p))).join('|');
}

/** Lê do cache, ou busca e guarda. Erro não é guardado. */
export function lerDo59<T>(
  partes: readonly Parte[],
  buscar: () => Promise<T>,
  validadeMs: number = VALIDADE_59_MS,
): Promise<T> {
  return lerComCache(chave(partes), validadeMs, buscar);
}

/** O valor guardado, se ainda válido — para a tela abrir pronta, sem esqueleto. */
export function espiarDo59<T>(
  partes: readonly Parte[],
  validadeMs: number = VALIDADE_59_MS,
): T | undefined {
  return espiarCache<T>(chave(partes), validadeMs);
}

/** Descarta todas as leituras do 59, inclusive as buscas em curso. */
export function esquecerLeiturasDo59(): void {
  invalidarCache(PREFIXO);
}
