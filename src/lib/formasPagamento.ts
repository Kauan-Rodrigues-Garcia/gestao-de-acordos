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

// ── Famílias: o que o painel mostra antes de alguém abrir ───────────────────

/**
 * A família de uma forma de pagamento, ou `null` se ela não pertence a nenhuma.
 *
 * O ERP escreve a variação no rótulo: «Boleto Bancário», «Boleto Negociação»,
 * «Cartão de Crédito», «Cartão Site Parcial + Boleto», «Recorrente». Para quem
 * lê o painel são três meios — boleto, cartão e cartão recorrente — e a
 * variação só interessa a quem abrir o grupo para investigar.
 *
 * A ORDEM dos testes é a regra, não detalhe de implementação:
 *
 * 1. «recorrente» ANTES de «cart», senão «Cartão Recorrente» cairia em Cartão
 *    e o recorrente — que é a assinatura, dinheiro de comportamento diferente —
 *    desapareceria dentro do meio avulso.
 * 2. «cart» ANTES de «boleto», senão «Cartão Site Parcial + Boleto» viraria
 *    boleto. O dinheiro entrou por cartão; o boleto ali é a outra metade da
 *    negociação, não o meio da linha.
 *
 * Rótulo que não casa fica SOZINHO, com o nome que o ERP deu. Um grupo
 * «Outros» esconderia a forma nova exatamente no mês em que ela apareceu.
 */
export function familiaDaForma(rotulo: string): { chave: string; rotulo: string } | null {
  const n = rotulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (n.includes('recorrente')) return { chave: 'cartao_recorrente', rotulo: 'Cartão recorrente' };
  if (n.includes('cart'))       return { chave: 'cartao',            rotulo: 'Cartão' };
  if (n.includes('boleto'))     return { chave: 'boleto',            rotulo: 'Boleto' };
  return null;
}

/** O mínimo que uma linha precisa ter para ser agrupada. */
export interface LinhaDeForma {
  forma: string;
  valor: number;
  qtd: number;
  valorAnterior: number;
}

export interface GrupoDeFormas<T extends LinhaDeForma = LinhaDeForma> {
  chave: string;
  rotulo: string;
  valor: number;
  qtd: number;
  valorAnterior: number;
  /** As formas cruas, da maior para a menor. Uma só = o grupo não abre. */
  itens: T[];
}

/**
 * As formas do relatório, agrupadas por família e ordenadas por valor.
 *
 * Genérica no tipo da linha de propósito: a quebra por setor vai trazer os
 * mesmos rótulos com colunas a mais, e reagrupá-los com outra regra é como as
 * duas telas passariam a discordar sobre quanto entrou por cartão.
 *
 * Não muta a lista recebida nem as linhas dela — os totais do grupo são
 * calculados em objeto novo, e `itens` guarda as referências originais.
 */
export function agruparFormas<T extends LinhaDeForma>(formas: T[]): GrupoDeFormas<T>[] {
  const porChave = new Map<string, GrupoDeFormas<T>>();

  for (const f of formas) {
    const familia = familiaDaForma(f.forma);
    // Prefixo `cru:` para a forma solta nunca colidir com uma chave de família.
    const chave = familia?.chave ?? `cru:${f.forma}`;
    let g = porChave.get(chave);
    if (!g) {
      g = {
        chave,
        rotulo: familia?.rotulo ?? f.forma,
        valor: 0, qtd: 0, valorAnterior: 0,
        itens: [],
      };
      porChave.set(chave, g);
    }
    g.valor         += f.valor;
    g.qtd           += f.qtd;
    g.valorAnterior += f.valorAnterior;
    g.itens.push(f);
  }

  const grupos = [...porChave.values()];
  for (const g of grupos) g.itens.sort((a, b) => b.valor - a.valor);
  return grupos.sort((a, b) => b.valor - a.valor);
}
