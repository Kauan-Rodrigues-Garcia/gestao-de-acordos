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

/**
 * Cinco minutos (era 90 s até 09/10/2026, quando `metas` ainda somava ~35 mil
 * leituras em 26 h). Meta muda quando alguém salva a tela de Metas, e quem
 * salva invalida na hora; as outras abas veem em até 5 min.
 */
export const VALIDADE_METAS_MS = 5 * 60 * 1000;
export const PREFIXO_METAS = 'metas:';

export function invalidarMetasGuardadas(): void {
  invalidarCache(PREFIXO_METAS);
}
