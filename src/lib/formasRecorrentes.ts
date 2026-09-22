/**
 * formasRecorrentes.ts — PIX Automático e Cartão Recorrente, e por que eles não
 * são acordos como os outros.
 *
 * ## O que muda
 *
 * As duas formas são cobranças que o banco/adquirente puxa sozinho, mês a mês,
 * a partir de uma autorização que o cliente assina. Três consequências, e as
 * três foram pedidas em 05/09/2026:
 *
 *   1. **Vencimento só no mês corrente, de hoje em diante.** Não se agenda uma
 *      cobrança automática para ontem — a autorização passa a valer da
 *      assinatura em diante. E, desde 22/09/2026, também não para o mês que
 *      vem: o registro no Pix Automático cai no mês em que é feito, e um
 *      acordo de outubro lançado em setembro contava a comissão no mês errado.
 *      Ver `erroVencimentoRecorrente`.
 *   2. **Sempre 1 parcela, sem reparcelamento.** O acordo aqui é a AUTORIZAÇÃO,
 *      não o carnê: quem parcela é a recorrência, e lançar "10x" criava dez
 *      linhas de tabulação para um acordo que o sistema cobra sozinho. Por isso
 *      o acordo recorrente também não recebe parcela nova, não reagenda a
 *      "próxima" e não muda a quantidade na edição (22/09/2026).
 *   3. **A comissão não sai daqui.** Ela é calculada na aba Pix Automático, que
 *      tem tabela, meta e percentual próprios (`pix_automatico_acordos`).
 *      Lançar só na lista de acordos deixa o dinheiro fora da comissão — foi
 *      exatamente o que aconteceu no Play 3, com um lote inteiro registrado no
 *      lugar errado.
 *
 * Por causa do item 3, desde 14/09/2026 o acordo recorrente é registrado
 * sozinho no Pix Automático ao salvar (`pixAutomaticoDoAcordo.service`), com o
 * VALOR TOTAL confirmado no formulário — só a parcela não entra, nem como valor
 * nem como parcela de acordo existente. O aviso pós-gravação ficou para quando o
 * registro automático não acontece.
 *
 * Desde 22/09/2026 o mesmo registro acontece quando o acordo é MARCADO PAGO
 * depois: quem lançava como "Não pago" (que não entra no Pix) e depois virava
 * para "Pago" ficava de fora, e os acordos anteriores a 14/09 também.
 */

/** Os `value` de `TIPOS_BOOKPLAY` que seguem a regra da recorrência. */
export const FORMAS_RECORRENTES = ['pix_automatico', 'cartao_recorrente'] as const;

export type FormaRecorrente = (typeof FORMAS_RECORRENTES)[number];

/** O tipo escolhido é PIX Automático ou Cartão Recorrente? */
export function ehFormaRecorrente(tipo: string | null | undefined): boolean {
  return !!tipo && (FORMAS_RECORRENTES as readonly string[]).includes(tipo);
}

/** Nome da forma para as frases da tela. */
export function nomeDaFormaRecorrente(tipo: string): string {
  return tipo === 'pix_automatico' ? 'PIX Automático' : 'Cartão Recorrente';
}

/** Último dia do mês de `hoje` (`yyyy-MM-dd`), o teto do vencimento recorrente. */
export function ultimoDiaDoMesDe(hoje: string): string {
  const [ano, mes] = hoje.split('-').map(Number);
  // Dia 0 do mês seguinte é o último deste — `mes` já é o seguinte no Date.
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${hoje.slice(0, 7)}-${String(ultimo).padStart(2, '0')}`;
}

/**
 * O vencimento cabe na regra da recorrência? Devolve a frase do erro, ou `null`.
 *
 * Aceita de `hoje` até o último dia do mês corrente — item 1 do cabeçalho. As
 * datas são `yyyy-MM-dd`, e a comparação de texto vale como comparação de data.
 */
export function erroVencimentoRecorrente(
  tipo: string, vencimento: string, hoje: string,
): string | null {
  if (vencimento < hoje) {
    return `${nomeDaFormaRecorrente(tipo)} não pode ser agendado para uma data passada — `
      + 'use uma data de hoje até o fim do mês.';
  }
  if (vencimento > ultimoDiaDoMesDe(hoje)) {
    return `${nomeDaFormaRecorrente(tipo)} só pode ser lançado no mês atual — `
      + 'use uma data de hoje até o fim do mês.';
  }
  return null;
}
