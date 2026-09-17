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
 * Noventa segundos: um acordo salvo por qualquer operador fazia todo painel
 * aberto reler a composição — seis consultas por releitura, 21 mil vezes por
 * dia. Com a validade, é no máximo uma releitura a cada minuto e meio por aba.
 */
export const VALIDADE_COMPOSICAO_MS = 90 * 1000;

export const PREFIXO_COMPOSICAO = 'composicao:';

export function chaveComposicao(empresaId: string, mes: string | null): string {
  return `${PREFIXO_COMPOSICAO}${empresaId}:${mes ?? 'hoje'}`;
}

/** Descarta a composição guardada de todas as empresas e meses. */
export function invalidarComposicaoEquipes(): void {
  invalidarCache(PREFIXO_COMPOSICAO);
}
