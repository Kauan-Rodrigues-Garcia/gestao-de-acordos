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
 *   1. **Vencimento nunca no passado.** Não se agenda uma cobrança automática
 *      para ontem — a autorização passa a valer da assinatura em diante. Uma
 *      data anterior a hoje é sempre digitação errada.
 *   2. **Sempre 1 parcela.** O acordo aqui é a AUTORIZAÇÃO, não o carnê: quem
 *      parcela é a recorrência, e lançar "10x" criava dez linhas de tabulação
 *      para um acordo que o sistema cobra sozinho.
 *   3. **A comissão não sai daqui.** Ela é calculada na aba Pix Automático, que
 *      tem tabela, meta e percentual próprios (`pix_automatico_acordos`).
 *      Lançar só na lista de acordos deixa o dinheiro fora da comissão — foi
 *      exatamente o que aconteceu no Play 3, com um lote inteiro registrado no
 *      lugar errado.
 *
 * O aviso pós-gravação existe por causa do item 3: o acordo está salvo e certo
 * na lista, mas o trabalho ainda não acabou.
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
