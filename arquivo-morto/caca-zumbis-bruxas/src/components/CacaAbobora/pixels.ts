/**
 * pixels.ts — os quadros dos zumbis prontos para o canvas (`ImageData`), com
 * a sombra no chão. Guardados por zumbi: monta uma vez, pinta sempre.
 */
import { ALTURA, QUADROS, TODOS_OS_QUADROS, montarQuadro, type Imagem, type NomeParte, type Zumbi } from './zumbis';

/** A sombra no chão, embaixo dos pés (a última linha do sprite). */
const SOMBRA = { y: ALTURA - 1, de: 6, ate: 16 };

export function imagemParaPixels(img: Imagem, comSombra: boolean): ImageData {
  const dados = new ImageData(img.largura, img.altura);
  const px = dados.data;
  if (comSombra) {
    for (let x = SOMBRA.de; x <= SOMBRA.ate; x++) {
      const o = (SOMBRA.y * img.largura + x) * 4;
      px[o + 3] = x === SOMBRA.de || x === SOMBRA.ate ? 40 : 72;
    }
  }
  img.cores.forEach((c, i) => {
    if (!c) return;
    const n = parseInt(c.slice(1), 16);
    px[i * 4] = (n >> 16) & 255;
    px[i * 4 + 1] = (n >> 8) & 255;
    px[i * 4 + 2] = n & 255;
    px[i * 4 + 3] = 255;
  });
  return dados;
}

const cache = new Map<string, ImageData[]>();

/** Os quadros do zumbi (parado e andando, na ordem de `TODOS_OS_QUADROS`), prontos para `putImageData`. */
export function quadrosDoZumbi(z: Zumbi): ImageData[] {
  let q = cache.get(z.id);
  if (!q) {
    q = TODOS_OS_QUADROS.map(quadro => imagemParaPixels(montarQuadro(z, quadro), true));
    cache.set(z.id, q);
  }
  return q;
}

/** Só a cabeça — o ícone da faixa e do painel. Morta: olho apagado. */
export function cabecaDoZumbi(z: Zumbi, morta: boolean): ImageData {
  const chave = `${z.id}:cabeca:${morta}`;
  let q = cache.get(chave);
  if (!q) {
    q = [imagemParaPixels(montarQuadro(z, QUADROS[0], (p: NomeParte) => p === 'cabeca', { morta }), false)];
    cache.set(chave, q);
  }
  return q[0];
}

