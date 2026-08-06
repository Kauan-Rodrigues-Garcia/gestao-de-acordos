/**
 * vencimentos.ts — como uma parcela leva à data da próxima.
 * ─────────────────────────────────────────────────────────────────────────────
 * Vivia dentro de `components/ModalReagendar.tsx`. Saiu de lá quando o modal de
 * ADICIONAR parcelas passou a precisar da mesma regra para montar um lote: duas
 * telas calculando vencimento por conta própria acabariam divergindo, e a data
 * de cobrança é exatamente o tipo de coisa que ninguém confere até o cliente
 * reclamar.
 *
 * `ModalReagendar` reexporta estas funções, então os imports antigos seguem
 * valendo.
 */

/** Último dia do mês seguinte ao de `dateStr` (YYYY-MM-DD). */
export function ultimoDiaProxMes(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const lastDay = new Date(nextY, nextM, 0).getDate();
  return `${nextY}-${String(nextM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** `dateStr` + 30 dias corridos (YYYY-MM-DD). */
export function trintaDiasDepois(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 30);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Mesmo dia do mês seguinte, saturando em meses curtos (31 → 28/29/30). */
export function mesmoDiaProxMes(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const alvoMes   = m === 12 ? 1 : m + 1;
  const alvoAno   = m === 12 ? y + 1 : y;
  const ultimoDia = new Date(alvoAno, alvoMes, 0).getDate();
  const dia       = Math.min(d, ultimoDia);
  return `${alvoAno}-${String(alvoMes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Vencimento sugerido para a PRÓXIMA parcela.
 *
 *   • PaguePlay — sempre o último dia do mês seguinte (o boleto fecha no fim
 *     do mês). Não muda.
 *
 *   • BookPlay — 30 dias corridos na PRIMEIRA vez (parcela 1 → 2). Da 2ª em
 *     diante, o mesmo DIA do mês seguinte: se o operador puxou a parcela 2
 *     para o dia 20, a 3 tem de cair no dia 20 também, e não voltar para o dia
 *     original do acordo nem escorregar um dia por mês (30 dias a partir do
 *     dia 20 de agosto daria 19 de setembro).
 */
export function vencimentoSugerido(
  dateStr: string, isPaguePlay: boolean, proximaNumero = 2,
): string {
  if (isPaguePlay) return ultimoDiaProxMes(dateStr);
  return proximaNumero <= 2 ? trintaDiasDepois(dateStr) : mesmoDiaProxMes(dateStr);
}

/**
 * Datas de um LOTE de parcelas a partir de um primeiro vencimento.
 *
 * A primeira usa a data informada; as demais avançam de mês em mês mantendo o
 * dia (BookPlay) ou caindo no fim do mês (PaguePlay). Diferente de
 * `vencimentoSugerido`, aqui não há o caso "+30 dias": esse existe para a
 * transição da parcela 1 para a 2 de um acordo já tabulado, e num lote novo o
 * operador está escolhendo a data de partida.
 */
export function datasDoLote(
  primeiroVencimento: string, quantidade: number, isPaguePlay: boolean,
): string[] {
  if (quantidade <= 0 || !primeiroVencimento) return [];
  const datas = [primeiroVencimento];
  for (let i = 1; i < quantidade; i++) {
    const anterior = datas[i - 1];
    datas.push(isPaguePlay ? ultimoDiaProxMes(anterior) : mesmoDiaProxMes(anterior));
  }
  return datas;
}
