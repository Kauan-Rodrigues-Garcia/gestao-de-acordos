/**
 * scroll-conversa.ts — regras de rolagem da conversa do pedido.
 *
 * Separado do componente porque o problema que resolvem é sutil e vale ter
 * teste: `scrollIntoView` rola TODOS os ancestrais roláveis do elemento, e a
 * conversa vive dentro de um card no meio de uma página longa. Cada mensagem
 * nova arrastava a página inteira — a tela "se mexia sozinha".
 *
 * A regra aqui é a do WhatsApp: quem está no fim acompanha, quem subiu para ler
 * o histórico fica onde está.
 */

/**
 * Distância do fim, em pixels, ainda contada como "está no fim".
 *
 * Não é zero porque o fim exato quase nunca é atingido: altura fracionária,
 * zoom do navegador e a animação do `smooth` param a um ou dois pixels do
 * limite. Com folga zero o leitor seria descolado do fim sem ter rolado nada.
 */
export const FOLGA_FIM_PX = 64;

/** O mínimo que interessa de um elemento rolável — facilita o teste. */
export interface AreaRolavel {
  scrollTop:    number;
  scrollHeight: number;
  clientHeight: number;
}

/** O leitor está no fim da conversa (ou perto o bastante)? */
export function estaNoFim(el: AreaRolavel, folga = FOLGA_FIM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= folga;
}

/**
 * O elemento que realmente rola dentro de um `<ScrollArea>` do Radix.
 *
 * A raiz é `overflow-hidden`; quem tem barra é o viewport interno. Sem descer
 * até ele não há como rolar sem envolver a janela.
 */
export function viewportDaArea(raiz: HTMLElement | null | undefined): HTMLElement | null {
  return raiz?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null;
}

/**
 * Leva o viewport ao fim — e só ele.
 *
 * Mexe no `scrollTop` do próprio elemento em vez de pedir a um filho que se
 * mostre: o navegador não sobe a cadeia de ancestrais, então a página em volta
 * não se move.
 */
export function rolarAoFim(el: HTMLElement, comportamento: ScrollBehavior = 'smooth'): void {
  const topo = el.scrollHeight;
  if (typeof el.scrollTo === 'function') {
    el.scrollTo({ top: topo, behavior: comportamento });
    return;
  }
  // jsdom/happy-dom não implementam scrollTo; a atribuição direta basta.
  el.scrollTop = topo;
}

/**
 * Deve rolar depois de a lista mudar?
 *
 * Três casos, nesta ordem:
 *   • primeira carga  → sim, sempre (a conversa abre no fim, como um mensageiro)
 *   • acabei de falar → sim, mesmo que eu estivesse lendo o histórico
 *   • chegou de fora  → só se eu já estava no fim
 */
export function deveRolar(params: {
  primeiraCarga: boolean;
  ultimaEhMinha: boolean;
  grudadoNoFim:  boolean;
}): boolean {
  return params.primeiraCarga || params.ultimaEhMinha || params.grudadoNoFim;
}
