/**
 * modelos.ts — os três arranjos prontos do card.
 *
 * Arrastar cada elemento no braço é poderoso e é péssimo como PRIMEIRO passo:
 * quem só quer avisar que a equipe bateu a meta não devia precisar diagramar
 * nada. O modelo resolve o caso comum em um clique; o arrasto continua ali para
 * quem quiser ajustar.
 *
 * Cada modelo devolve um `LayoutComemoracao` completo — as mesmas posições em %
 * que o arrasto grava. Modelo não é um modo à parte do editor: é um atalho que
 * escreve no mesmo lugar, e por isso os dois convivem sem conflito.
 *
 * Puro e sem React, como o `layout.ts`, para ter teste sem montar tela.
 */
import { LAYOUT_PADRAO, limitarNoCard, type LayoutComemoracao } from './layout';

export type ModeloId = 'midia_topo' | 'texto_sobre' | 'midia_lado';

export interface Modelo {
  id:        ModeloId;
  nome:      string;
  descricao: string;
  layout:    LayoutComemoracao;
}

/**
 * No `texto_sobre` a mídia é o fundo do card, então cresce.
 *
 * O texto por cima já se defende com o contorno escuro (`SOMBRA_TEXTO` no
 * `CardComemoracao`), o mesmo recurso de legenda de vídeo — funciona sobre
 * imagem clara e escura sem precisar de caixa atrás.
 *
 * A ordem de empilhamento sai de graça: os elementos são irmãos absolutos e a
 * mídia é a primeira do DOM, então o texto cai por cima naturalmente.
 */
export const MODELOS: readonly Modelo[] = [
  {
    id: 'midia_topo',
    nome: 'GIF em cima',
    descricao: 'Imagem no topo, texto embaixo.',
    layout: LAYOUT_PADRAO,
  },
  {
    id: 'texto_sobre',
    nome: 'Texto sobre o GIF',
    descricao: 'Imagem ao fundo, texto por cima.',
    layout: {
      midia:    { x: 50, y: 50, escala: 1.6 },
      titulo:   { x: 50, y: 34, escala: 1 },
      pessoas:  { x: 50, y: 58, escala: 0.9 },
      mensagem: { x: 50, y: 82, escala: 1 },
    },
  },
  {
    id: 'midia_lado',
    nome: 'GIF ao lado',
    descricao: 'Imagem à esquerda, texto à direita.',
    layout: {
      midia:    { x: 26, y: 50, escala: 1 },
      titulo:   { x: 68, y: 28, escala: 0.85 },
      pessoas:  { x: 68, y: 55, escala: 0.85 },
      mensagem: { x: 68, y: 80, escala: 0.9 },
    },
  },
];

export const MODELO_PADRAO: ModeloId = 'midia_topo';

const MODELOS_POR_ID = new Map<string, Modelo>(MODELOS.map((m) => [m.id, m]));

/**
 * Id do banco → modelo que sabemos desenhar.
 *
 * Mesma tolerância do `efeitoValido`: um modelo gravado por uma versão mais
 * nova não pode impedir a comemoração de acontecer nesta.
 */
export function modeloValido(valor: string | null | undefined): ModeloId {
  return MODELOS_POR_ID.has(valor ?? '') ? (valor as ModeloId) : MODELO_PADRAO;
}

/** Layout de um modelo, já preso dentro do card. */
export function layoutDoModelo(id: string | null | undefined): LayoutComemoracao {
  const modelo = MODELOS_POR_ID.get(modeloValido(id));
  const saida: LayoutComemoracao = {};
  for (const [elemento, pos] of Object.entries(modelo?.layout ?? LAYOUT_PADRAO)) {
    saida[elemento as keyof LayoutComemoracao] = limitarNoCard(pos);
  }
  return saida;
}

/**
 * Qual modelo este layout representa, ou null se foi mexido à mão.
 *
 * Serve para o rótulo da tela dizer "personalizado" depois de um arrasto, em
 * vez de seguir mostrando o modelo escolhido como se nada tivesse mudado.
 */
export function modeloDoLayout(layout: LayoutComemoracao | null | undefined): ModeloId | null {
  if (!layout || Object.keys(layout).length === 0) return MODELO_PADRAO;

  for (const modelo of MODELOS) {
    const alvo = layoutDoModelo(modelo.id);
    const igual = (Object.keys(alvo) as (keyof LayoutComemoracao)[]).every((elemento) => {
      const a = layout[elemento];
      const b = alvo[elemento];
      if (!a || !b) return false;
      return a.x === b.x && a.y === b.y && a.escala === b.escala;
    });
    if (igual) return modelo.id;
  }
  return null;
}
