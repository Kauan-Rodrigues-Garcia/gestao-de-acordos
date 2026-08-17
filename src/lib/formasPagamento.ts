/**
 * formasPagamento.ts — vocabulário visual das formas de pagamento do relatório.
 *
 * `forma_detalhe` é o rótulo CRU do ERP ("Pix Automático", "Boleto Negociação",
 * "Cartão de Crédito", "Recorrente"…): muda entre os dois tenants e ganha
 * variações novas sem avisar. Por isso o casamento é por palavra-chave, e não
 * por igualdade — um rótulo inédito continua caindo numa cor e num ícone
 * plausíveis em vez de virar fatia cinza sem identidade no gráfico.
 *
 * ## Por que virou módulo de `lib`
 *
 * Isto morava em `pages/PainelDiretoria/types.ts`. Saiu de lá quando a aba
 * Analítico passou a desenhar as MESMAS formas: duas telas pintando "Pix" de
 * verdes diferentes é o começo de dois vocabulários para o mesmo relatório —
 * o mesmo problema que `escopoAnalitico.ts` resolveu para os totais.
 */

import { Landmark, QrCode, CreditCard, type LucideIcon } from 'lucide-react';

/** Rótulo consolidado quando o ERP não informa a forma detalhada (PaguePlay). */
export const ROTULO_CARTAO      = 'Cartão';
export const ROTULO_BOLETO_PIX  = 'Pix/Boleto';
/** Linha sem operador cadastrado (órfã) nas quebras por operador/equipe. */
export const ROTULO_SEM_OPERADOR = 'Sem operador';

/** Cor da forma. Uma família por meio de pagamento, tom por variação. */
export function corDaForma(rotulo: string): string {
  const n = rotulo.toLowerCase();
  if (n.includes('cart'))      return n.includes('recorrente') ? '#f97316' : '#f59e0b';
  // "Recorrente" sozinho (sem a palavra cartão) aparece no relatório BookPlay:
  // é o mesmo dinheiro do cartão recorrente e merece a mesma cor.
  if (n.includes('recorrente')) return '#f97316';
  if (n.includes('pix'))        return n.includes('autom') ? '#10b981' : '#22c55e';
  if (n.includes('boleto'))     return '#6366f1';
  return '#94a3b8';
}

/**
 * O tipo é `LucideIcon`, não `ComponentType<{ className }>`: quem chama passa
 * também `style` para colorir o ícone com a cor da forma de pagamento, e a
 * assinatura estreita rejeitava isso.
 */
export function iconeDaForma(rotulo: string): LucideIcon {
  const n = rotulo.toLowerCase();
  if (n.includes('cart') || n.includes('recorrente')) return CreditCard;
  if (n.includes('pix'))  return QrCode;
  return Landmark;
}

/**
 * Rótulo exibível de uma linha do analítico.
 *
 * O detalhado do ERP manda quando existe (BookPlay); na PaguePlay a coluna não
 * vem e sobra o consolidado do enum. É a MESMA regra de `agregarAnalitico` —
 * escrevê-la de novo em cada tela é como o dashboard passou a chamar de "Cartão"
 * o que a aba Analítico chamava de "Cartão de Crédito".
 */
export function rotuloDaForma(
  forma: 'boleto_pix' | 'cartao',
  detalhe?: string | null,
): string {
  const d = (detalhe ?? '').trim();
  if (d) return d;
  return forma === 'cartao' ? ROTULO_CARTAO : ROTULO_BOLETO_PIX;
}
