/**
 * src/lib/notificacoes-rota.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Para onde uma notificação leva quando clicada.
 *
 * Toda notificação deve levar a algum lugar — antes só as de acordo levavam, e
 * o resto abria um detalhe sem saída.
 *
 * A ordem de decisão importa:
 *
 *   1. `acordo_id` — comportamento que já existia, e é o mais específico
 *      (leva ao acordo em si, não à aba);
 *   2. `rota` — gravada pelo produtor da notificação (migration 20260731a);
 *   3. palpite pelo título — só para as linhas antigas, gravadas antes de
 *      existir a coluna `rota`. Os títulos são texto fixo do próprio código.
 */
import { ROUTE_PATHS } from '@/lib/index';
import type { Notificacao } from '@/lib/supabase';

/** Destino das notificações de importação do analítico. */
export const ROTA_ANALITICO = ROUTE_PATHS.ANALITICO;
/** A aba "Recebimento diário" vive dentro do Analítico, atrás deste parâmetro. */
export const ROTA_DIARIO = `${ROUTE_PATHS.ANALITICO}?aba=diario`;
/** Chat de solicitação de atendimento. */
export const ROTA_SOLICITACOES = ROUTE_PATHS.SOLICITACOES_WHATSAPP;

/** Só o que o cálculo lê. */
type Alvo = Pick<Notificacao, 'titulo' | 'rota' | 'acordo_id'>;

/**
 * Palpite para linhas gravadas antes da coluna `rota`.
 *
 * O diário é testado ANTES do analítico: o título "Recebimento diário
 * atualizado" não contém "analítico", mas a mensagem dele fala em "Analítico ›
 * Recebimento diário" — testar na ordem errada mandaria o diário para a aba
 * errada se um dia a busca passar a olhar a mensagem.
 */
function palpitePeloTitulo(titulo: string): string | null {
  const t = titulo.toLowerCase();
  if (t.includes('diário') || t.includes('diario'))        return ROTA_DIARIO;
  if (t.includes('analítico') || t.includes('analitico'))  return ROTA_ANALITICO;
  if (t.includes('mensagem') || t.includes('solicitaç') || t.includes('solicitac')) {
    return ROTA_SOLICITACOES;
  }
  return null;
}

/**
 * Caminho interno para onde a notificação leva, ou `null` se não houver destino.
 *
 * @param isPaguePlay muda só o destino de acordo: na PaguePlay a lista de
 *   acordos é o próprio dashboard, no BookPlay é `/acordos`.
 */
export function rotaDaNotificacao(n: Alvo, isPaguePlay: boolean): string | null {
  if (n.acordo_id) {
    return isPaguePlay
      ? `${ROUTE_PATHS.DASHBOARD}?highlight=${n.acordo_id}`
      : `${ROUTE_PATHS.ACORDOS}?highlight=${n.acordo_id}`;
  }
  if (n.rota) return n.rota;
  return palpitePeloTitulo(n.titulo ?? '');
}
