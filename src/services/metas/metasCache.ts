/**
 * metasCache.ts — as metas do mês, guardadas por pouco tempo.
 *
 * O painel de Analytics lia três consultas de `metas` (a principal, as de
 * equipe e as de operador) e a lista de nomes a CADA acordo salvo na empresa,
 * por cada painel aberto — ~6 mil vezes por dia cada uma em 17/09/2026. Meta
 * muda quando alguém salva a tela de Metas; `upsertMetas` e `excluirMetas`
 * descartam o que estava guardado.
 */
import { invalidarCache } from '@/lib/cacheCurto';

export const VALIDADE_METAS_MS = 90 * 1000;
export const PREFIXO_METAS = 'metas:';

export function invalidarMetasGuardadas(): void {
  invalidarCache(PREFIXO_METAS);
}
