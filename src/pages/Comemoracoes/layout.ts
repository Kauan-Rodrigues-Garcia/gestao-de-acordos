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

export const ELEMENTOS: readonly { id: ElementoId; nome: string }[] = [
  { id: 'titulo',   nome: 'Título' },
  { id: 'mensagem', nome: 'Mensagem' },
  { id: 'midia',    nome: 'GIF / troféu' },
  { id: 'pessoas',  nome: 'Fotos e nomes' },
];

/**
 * Arranjo de fábrica — a pilha central que a fase 1 usava.
 *
 * Comemoração criada antes do editor tem `layout` vazio e cai aqui, então
 * continua aparecendo igual.
 */
export const LAYOUT_PADRAO: Required<LayoutComemoracao> = {
  midia:    { x: 50, y: 24, escala: 1 },
  titulo:   { x: 50, y: 45, escala: 1 },
  mensagem: { x: 50, y: 60, escala: 1 },
  pessoas:  { x: 50, y: 79, escala: 1 },
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

/**
 * Move um elemento por um deslocamento em pixels.
 *
 * O deslocamento chega em pixels (é o que o mouse dá) e sai em % — por isso
 * precisa do tamanho renderizado do card. Card de largura zero devolveria
 * Infinity, então a conversão é ignorada nesse caso.
 */
export function moverElemento(
  layout: LayoutComemoracao,
  elemento: ElementoId,
  deslocamento: { dx: number; dy: number },
  tamanhoCard: { largura: number; altura: number },
): LayoutComemoracao {
  const atual = posicaoDe(layout, elemento);
  if (tamanhoCard.largura <= 0 || tamanhoCard.altura <= 0) return layout;

  return {
    ...layout,
    [elemento]: limitarNoCard({
      x: atual.x + (deslocamento.dx / tamanhoCard.largura) * 100,
      y: atual.y + (deslocamento.dy / tamanhoCard.altura) * 100,
      escala: atual.escala,
    }),
  };
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
