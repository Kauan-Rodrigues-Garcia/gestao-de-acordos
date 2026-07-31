/**
 * layout.ts — onde cada elemento fica dentro do card.
 *
 * As posições são **percentuais de um card de proporção fixa**, nunca pixels.
 * É isso que faz o preview do líder no monitor de 24" ser igual ao que aparece
 * no notebook do operador.
 *
 * Puro e sem React de propósito: o arrasto é a parte que mais erra por conta
 * de sinal trocado ou coordenada relativa ao elemento errado, e assim dá para
 * testar sem montar tela nenhuma.
 */

export type ElementoId = 'titulo' | 'mensagem' | 'midia' | 'pessoas';

export interface PosicaoElemento {
  /** Centro do elemento, em % da largura do card. */
  x: number;
  /** Centro do elemento, em % da altura do card. */
  y: number;
  /** 1 = tamanho natural. */
  escala: number;
}

export type LayoutComemoracao = Partial<Record<ElementoId, PosicaoElemento>>;

/** Na ordem em que aparecem no card, de cima para baixo. */
export const ELEMENTOS: readonly { id: ElementoId; nome: string }[] = [
  { id: 'midia',    nome: 'GIF / troféu' },
  { id: 'titulo',   nome: 'Título' },
  { id: 'pessoas',  nome: 'Fotos e nomes' },
  { id: 'mensagem', nome: 'Mensagem' },
];

/**
 * Arranjo de fábrica, de cima para baixo:
 *
 *     GIF  →  título  →  foto e nome  →  mensagem
 *
 * A ordem é a da leitura: a imagem chama a atenção, o título diz o que
 * aconteceu, a foto diz de quem é a conquista, e a mensagem fecha com o
 * detalhe. Comemoração criada sem editar o layout cai aqui.
 */
export const LAYOUT_PADRAO: Required<LayoutComemoracao> = {
  midia:    { x: 50, y: 22, escala: 1 },
  titulo:   { x: 50, y: 48, escala: 1 },
  pessoas:  { x: 50, y: 68, escala: 1 },
  mensagem: { x: 50, y: 89, escala: 1 },
};

/**
 * Margem mínima até a borda, em % do card.
 *
 * Impede o líder de arrastar o GIF pela metade para fora, achar que ficou
 * estiloso, e na tela dos outros virar um GIF cortado.
 */
export const MARGEM_PCT = 6;

export const ESCALA_MIN = 0.5;
export const ESCALA_MAX = 1.8;

function limitar(valor: number, minimo: number, maximo: number): number {
  if (!Number.isFinite(valor)) return minimo;
  return Math.min(maximo, Math.max(minimo, valor));
}

/** Prende a posição dentro do card. */
export function limitarNoCard(pos: PosicaoElemento): PosicaoElemento {
  return {
    x: limitar(pos.x, MARGEM_PCT, 100 - MARGEM_PCT),
    y: limitar(pos.y, MARGEM_PCT, 100 - MARGEM_PCT),
    escala: limitar(pos.escala, ESCALA_MIN, ESCALA_MAX),
  };
}

/** Posição em vigor de um elemento — a salva, ou a de fábrica. */
export function posicaoDe(layout: LayoutComemoracao | null | undefined, elemento: ElementoId): PosicaoElemento {
  return limitarNoCard(layout?.[elemento] ?? LAYOUT_PADRAO[elemento]);
}

/** Grava a posição de um elemento, presa ao card. */
export function definirPosicao(
  layout: LayoutComemoracao,
  elemento: ElementoId,
  pos: PosicaoElemento,
): LayoutComemoracao {
  return { ...layout, [elemento]: limitarNoCard(pos) };
}

/**
 * Onde o elemento fica depois de arrastar `dx`/`dy` pixels a partir de `origem`.
 *
 * Recebe a posição de ONDE O ARRASTO COMEÇOU e o deslocamento TOTAL do mouse,
 * não o incremento desde o último evento. A versão incremental acumulava o
 * erro do arredondamento a cada `pointermove` e travava assim que o elemento
 * encostava na margem: o valor preso pelo limite virava a base do próximo
 * passo, e o arrasto "parava" mesmo com o mouse ainda andando.
 *
 * Card de tamanho zero devolveria Infinity — nesse caso a origem é mantida.
 */
export function posicaoArrastada(
  origem: PosicaoElemento,
  deslocamento: { dx: number; dy: number },
  tamanhoCard: { largura: number; altura: number },
): PosicaoElemento {
  if (tamanhoCard.largura <= 0 || tamanhoCard.altura <= 0) return limitarNoCard(origem);
  return limitarNoCard({
    x: origem.x + (deslocamento.dx / tamanhoCard.largura) * 100,
    y: origem.y + (deslocamento.dy / tamanhoCard.altura) * 100,
    escala: origem.escala,
  });
}

/** Troca a escala de um elemento, respeitando os limites. */
export function escalarElemento(
  layout: LayoutComemoracao,
  elemento: ElementoId,
  escala: number,
): LayoutComemoracao {
  const atual = posicaoDe(layout, elemento);
  return { ...layout, [elemento]: limitarNoCard({ ...atual, escala }) };
}

/** O layout voltou a ser o de fábrica? Usado para não gravar JSON à toa. */
export function ehLayoutPadrao(layout: LayoutComemoracao | null | undefined): boolean {
  if (!layout || Object.keys(layout).length === 0) return true;
  return ELEMENTOS.every(({ id }) => {
    const a = posicaoDe(layout, id);
    const b = LAYOUT_PADRAO[id];
    return a.x === b.x && a.y === b.y && a.escala === b.escala;
  });
}

/**
 * Layout → objeto pronto para a coluna JSONB.
 *
 * O TypeScript não aceita uma interface como `Json` sem índice de string, e
 * afrouxar `PosicaoElemento` para `Record<string, unknown>` perderia a
 * checagem justamente onde ela vale. A conversão é segura por construção: só
 * há números aqui dentro.
 */
export function layoutParaJson(layout: LayoutComemoracao): Record<string, Record<string, number>> {
  const saida: Record<string, Record<string, number>> = {};
  for (const { id } of ELEMENTOS) {
    const pos = layout[id];
    if (pos) saida[id] = { x: pos.x, y: pos.y, escala: pos.escala };
  }
  return saida;
}

/**
 * JSON do banco → layout confiável.
 *
 * Vem de uma coluna JSONB, então pode ter qualquer coisa dentro: número fora
 * da faixa, campo faltando, valor de uma versão futura. Tudo que não for
 * reconhecido volta para o padrão em vez de quebrar a tela.
 */
export function layoutDoJson(valor: unknown): LayoutComemoracao {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const bruto = valor as Record<string, unknown>;
  const saida: LayoutComemoracao = {};

  for (const { id } of ELEMENTOS) {
    const item = bruto[id];
    if (!item || typeof item !== 'object') continue;
    const { x, y, escala } = item as Record<string, unknown>;
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    saida[id] = limitarNoCard({
      x, y,
      escala: typeof escala === 'number' ? escala : 1,
    });
  }
  return saida;
}
