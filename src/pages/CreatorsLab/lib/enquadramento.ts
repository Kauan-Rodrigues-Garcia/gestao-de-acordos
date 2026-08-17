/**
 * enquadramento.ts — a câmera que se aproxima da máquina.
 * ─────────────────────────────────────────────────────────────────────────────
 * Quando a partida começa, o gabinete sai do meio da página e vem para a
 * frente, centralizado e ampliado; quando acaba, volta ao lugar. É a mesma
 * conta nos dois sentidos — o caminho de volta é o de ida ao contrário.
 *
 * A conta mora aqui, e não dentro do componente, porque é geometria pura:
 * dado onde o elemento está e do tamanho da tela, quanto transladar e quanto
 * ampliar. Dá para provar sem navegador, e é onde os erros aparecem — escala
 * que encolhe em vez de crescer, gabinete que sai pela borda em tela baixa,
 * divisão por zero num elemento ainda sem medida.
 */

export interface Retangulo {
  /** Coordenadas em relação à janela, como as de `getBoundingClientRect`. */
  x: number; y: number; largura: number; altura: number;
}

export interface Viewport { largura: number; altura: number }

export interface Enquadramento {
  /** Translação em pixels, para aplicar ANTES da escala. */
  x: number; y: number;
  escala: number;
}

/** Ampliação máxima. Passando disso o desenho do gabinete começa a borrar. */
export const ESCALA_MAX = 2.4;

/** Respiro entre o gabinete ampliado e a borda da janela. */
export const MARGEM_PADRAO = 24;

/**
 * Duração da aproximação, em segundos.
 *
 * Curta demais vira corte; longa demais vira espera. Um segundo e pouco é o
 * tempo de um travelling curto de cinema.
 */
export const DURACAO_CAMERA = 1.15;

/**
 * A curva pedida: começa devagar, acelera no meio, desacelera no fim.
 *
 * É a `easeInOutQuint`. A versão cúbica (`0.65, 0, 0.35, 1`) também é
 * simétrica, mas o meio dela não chega a "acelerar" de forma perceptível — a
 * quinta potência é o que dá o empurrão no miolo sem tornar o começo brusco.
 */
export const EASE_CAMERA: [number, number, number, number] = [0.83, 0, 0.17, 1];

/** O enquadramento neutro: o gabinete no lugar dele, sem ampliação. */
export const SEM_ENQUADRAMENTO: Enquadramento = { x: 0, y: 0, escala: 1 };

/**
 * Quanto transladar e ampliar para o gabinete ocupar a tela.
 *
 * Pressupõe `transform-origin: center` e a ordem `translate(x, y) scale(e)` —
 * que é exatamente a ordem que o framer-motion aplica com `x`, `y` e `scale`.
 * Por isso a translação é calculada sobre o tamanho ORIGINAL: a ampliação
 * acontece depois, em torno do centro que a translação já colocou no lugar.
 *
 * A escala nunca fica abaixo de 1. Em tela baixa — celular deitado, janela
 * espremida — o cabimento daria menos que o tamanho natural, e "aproximar"
 * afastando seria pior que não aproximar.
 */
export function enquadrar(
  alvo: Retangulo,
  tela: Viewport,
  margem = MARGEM_PADRAO,
): Enquadramento {
  // Elemento ainda sem medida (não montado, ou `display: none`): não há o que
  // enquadrar, e dividir por zero devolveria `Infinity` para o `transform`.
  if (alvo.largura <= 0 || alvo.altura <= 0) return SEM_ENQUADRAMENTO;

  const util = {
    largura: Math.max(tela.largura - margem * 2, 1),
    altura:  Math.max(tela.altura  - margem * 2, 1),
  };

  const cabe = Math.min(util.largura / alvo.largura, util.altura / alvo.altura);
  const escala = Math.min(Math.max(cabe, 1), ESCALA_MAX);

  return {
    x: tela.largura / 2 - (alvo.x + alvo.largura / 2),
    y: tela.altura  / 2 - (alvo.y + alvo.altura  / 2),
    escala,
  };
}

/** `mm:ss` a partir de milissegundos. Usado no ranking e no relógio da partida. */
export function formatarDuracao(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}
