/**
 * composicaoCache.ts — quando a composição de equipes deixa de valer.
 *
 * `buscarEquipesComOperadores` guarda a resposta por empresa e mês por
 * `VALIDADE_COMPOSICAO_MS` (ver `cacheCurto.ts`). Quem MUDA a composição —
 * líder, clone, situação, transferência, equipe — chama
 * `invalidarComposicaoEquipes()` depois de gravar, e a própria tela enxerga a
 * mudança na releitura seguinte. As outras abas enxergam em até a validade.
 *
 * Módulo separado de propósito: os serviços que gravam não precisam importar o
 * `analitico.service` inteiro só para avisar.
 */
import { invalidarCache } from '@/lib/cacheCurto';

/**
 * Cinco minutos. Um acordo salvo por qualquer operador fazia todo painel
 * aberto reler a composição — seis consultas por releitura, 21 mil vezes por
 * dia (17/09/2026: virou 90 s). Em 09/10/2026, com a máquina sem memória, a
 * composição ainda era o maior bloco de leituras repetidas: a de `perfis`
 * com equipes (57 ms) rodou 7.938 vezes em 26 h, mais `setores`, `equipes`,
 * `equipe_membros` e `perfis_transferencias`. Equipe muda poucas vezes por
 * dia, e quem grava invalida na hora; as outras abas veem em até 5 min.
 */
export const VALIDADE_COMPOSICAO_MS = 5 * 60 * 1000;

export const PREFIXO_COMPOSICAO = 'composicao:';

export function chaveComposicao(empresaId: string, mes: string | null): string {
  return `${PREFIXO_COMPOSICAO}${empresaId}:${mes ?? 'hoje'}`;
}

/** Descarta a composição guardada de todas as empresas e meses. */
export function invalidarComposicaoEquipes(): void {
  invalidarCache(PREFIXO_COMPOSICAO);
}
