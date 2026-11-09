/**
 * Quando o botão de reagendar (o calendário) aparece — uma regra só, para a
 * lista da BookPlay e a da PaguePlay.
 *
 * ## O que estava errado (28/09/2026)
 *
 * «Tem acordo que não aparece o botão mesmo sem eu reagendar.»
 *
 *   - PaguePlay: o grupo contava como «já reagendado» se a PÁGINA tivesse
 *     qualquer parcela de número > 1 dele. A parcela 2 paga escondia o próprio
 *     botão, mesmo sem a 3 existir. O complemento vinha do banco olhando só o
 *     mês seguinte ao filtro — próxima marcada para outro mês não contava.
 *   - BookPlay: a lista nem tinha o botão. O agendamento só aparecia no modal
 *     ao marcar pago; fechado o modal, não havia como voltar.
 *
 * Medido: 290 acordos parcelados da BookPlay e 85 da PaguePlay com a última
 * parcela PAGA e a próxima nunca criada.
 *
 * ## A regra
 *
 * O botão aparece quando a parcela está PAGA, é de um tipo que tem
 * reparcelamento (`isTipoParcelado` — recorrentes não têm), ainda não é a
 * última, e a próxima (mesmo `acordo_grupo_id`, número + 1) NÃO existe. É a
 * mesma pergunta que o modal faz ao marcar pago e que o salvar refaz antes de
 * gravar.
 */
import { isTipoParcelado } from '@/components/AcordoDetalheInline/helpers';

export interface ParcelaParaAgendar {
  id: string;
  status: string;
  tipo: string;
  parcelas?: number | null;
  numero_parcela?: number | null;
  acordo_grupo_id?: string | null;
}

/** A parcela PODE precisar de agendamento (falta só saber se a próxima existe). */
export function candidataAReagendar(a: ParcelaParaAgendar, isPP: boolean): boolean {
  const total = a.parcelas ?? 1;
  const numero = a.numero_parcela ?? 1;
  return a.status === 'pago'
    && !!a.acordo_grupo_id
    && total > 1
    && numero < total
    && isTipoParcelado(a.tipo, isPP);
}

export function chaveParcela(grupo: string, numero: number): string {
  return `${grupo}:${numero}`;
}

/**
 * Das candidatas, as que ainda não têm a próxima parcela.
 *
 * @param existentes `grupo:numero` de toda parcela que existe nos grupos das
 *                   candidatas (vem do banco, não só da página exibida).
 */
export function pendentesDeAgendamento(
  acordos: readonly ParcelaParaAgendar[],
  existentes: ReadonlySet<string>,
  isPP: boolean,
): Set<string> {
  const saida = new Set<string>();
  for (const a of acordos) {
    if (!candidataAReagendar(a, isPP)) continue;
    if (!existentes.has(chaveParcela(a.acordo_grupo_id!, (a.numero_parcela ?? 1) + 1))) saida.add(a.id);
  }
  return saida;
}
