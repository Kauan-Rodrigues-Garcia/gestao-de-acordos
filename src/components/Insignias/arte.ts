/**
 * arte.ts — o rosto de cada insígnia, com os desenhos das próprias gincanas:
 * a cabeça do zumbi que a pessoa pegou, a do Rei do Pop com o chapéu, a da
 * bruxa que ela derrubou e a da Bruxa do Pântano.
 *
 * Vira uma imagem (`data:` PNG) recortada no desenho, guardada: a lista do
 * pessoal mostra centenas de medalhas, e `<img>` com a mesma URL é mais barato
 * que um canvas por medalha. Só entra no pedaço do álbum, que baixa no clique.
 */
import { ZUMBIS } from './desenhos/zumbis';
import { cabecaDoZumbi } from './desenhos/pixels';
import { CHEFAO } from './desenhos/chefaoArte';
import { BRUXAS } from './desenhos/bruxas/arte';
import { cabecaDaBruxa, canvasDaImagem } from './desenhos/bruxas/pixels';
import { cabecaMC } from './desenhos/bruxas/chefona/arte';
import type { IdInsignia } from './insignias';

export interface Rosto {
  url: string;
  largura: number;
  altura: number;
}

const cache = new Map<string, Rosto | null>();

function canvasDoImageData(d: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = d.width;
  c.height = d.height;
  c.getContext('2d')?.putImageData(d, 0, 0);
  return c;
}

/** Corta a borda transparente: cada desenho fica do tamanho do que tem. */
function recortar(origem: HTMLCanvasElement): Rosto | null {
  const ctx = origem.getContext('2d');
  if (!ctx || origem.width === 0 || origem.height === 0) return null;
  const { data, width, height } = ctx.getImageData(0, 0, origem.width, origem.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] === 0) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')?.drawImage(origem, x0, y0, w, h, 0, 0, w, h);
  return { url: c.toDataURL('image/png'), largura: w, altura: h };
}

function desenhar(id: IdInsignia, desenho: number): HTMLCanvasElement {
  switch (id) {
    case 'zumbi':    return canvasDoImageData(cabecaDoZumbi(ZUMBIS[desenho] ?? ZUMBIS[0], false));
    case 'reiDoPop': return canvasDoImageData(cabecaDoZumbi(CHEFAO, false));
    case 'bruxas':   return cabecaDaBruxa(BRUXAS[desenho] ?? BRUXAS[0], false);
    case 'pantano':  return canvasDaImagem(cabecaMC(), false);
  }
}

/**
 * O rosto da insígnia. `desenho`: qual zumbi/bruxa (o da conquista mais
 * recente); sem conquista, o primeiro, que aparece só em silhueta.
 */
export function rostoDaInsignia(id: IdInsignia, desenho: number | null): Rosto | null {
  const chave = `${id}:${desenho ?? 0}`;
  if (!cache.has(chave)) {
    try {
      cache.set(chave, recortar(desenhar(id, desenho ?? 0)));
    } catch {
      cache.set(chave, null); // sem canvas (teste, navegador velho): a medalha fica só com a fita
    }
  }
  return cache.get(chave) ?? null;
}

/** Os nomes dos desenhos, para o texto da conquista. */
export function nomeDoDesenho(id: IdInsignia, desenho: number | null): string | null {
  if (desenho == null) return null;
  if (id === 'zumbi') return ZUMBIS[desenho]?.nome ?? null;
  if (id === 'bruxas') return BRUXAS[desenho]?.nome ?? null;
  return null;
}
