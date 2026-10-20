/**
 * galatico.ts — o Alfabeto Galáctico Padrão, a língua do Encantamento.
 *
 * É o alfabeto da mesa de encantamento do Minecraft (que veio do Commander
 * Keen): cada letra vira um símbolo. A Bruxa do Pântano conjura nele o
 * Encantamento — a mesa aparece embaixo dela, as runas voam para o livro e
 * giram em volta, a frase dela se escreve em runas no alto, e a tela
 * distorce (`feiticos.ts`).
 *
 * Os símbolos são caracteres Unicode. No canvas eles viram pixel: o glifo é
 * desenhado pequeno e o contorno suave é cortado (`glifo`), então a runa sai
 * com a mesma cara de pixel art do resto.
 */

export const GALATICO: Readonly<Record<string, string>> = {
  a: 'ᔑ', b: 'ʖ', c: 'ᓵ', d: '↸', e: 'ᒷ', f: '⎓', g: '⊣', h: '⍑', i: '╎', j: '⋮',
  k: 'ꖌ', l: 'ꖎ', m: 'ᒲ', n: 'リ', o: '𝙹', p: '!¡', q: 'ᑑ', r: '∷', s: 'ᓭ', t: 'ℸ̣',
  u: '⚍', v: '⍊', w: '∴', x: '/̇', y: '||', z: '⨅',
};

/** O que ela conjura no Encantamento (em runas, ninguém lê: «o Gestão é meu»). */
export const ENCANTO = 'O GESTAO E MEU';

const SEM_ACENTO = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** «Acordos» → «ᔑᓵ𝙹∷↸𝙹ᓭ». O que não é letra fica como está. */
export function paraGalatico(texto: string): string {
  return [...SEM_ACENTO(texto)].map(ch => GALATICO[ch.toLowerCase()] ?? ch).join('');
}

/** As letras de uma palavra que têm runa (para o anel em volta dela). */
export function letrasComRuna(texto: string): string[] {
  return [...SEM_ACENTO(texto).toLowerCase()].filter(ch => ch in GALATICO);
}

// ── O glifo em pixel (só no navegador) ─────────────────────────────────────

const FONTES = '"Segoe UI Symbol", "Segoe UI Historic", Gadugi, Ebrima, "Yu Gothic", "Cambria Math", '
  + '"Noto Sans Symbols 2", "Noto Sans Canadian Aboriginal", "Noto Sans Vai", "Noto Sans JP", sans-serif';

const cache = new Map<string, HTMLCanvasElement | null>();

/**
 * A runa de uma letra num canvas do tamanho exato dela, com cor chapada (sem
 * meio-tom: o pixel acende ou não). `null` fora do navegador.
 */
export function glifo(letra: string, cor: string, px = 11): HTMLCanvasElement | null {
  const chave = `${letra}|${cor}|${px}`;
  if (cache.has(chave)) return cache.get(chave)!;
  const simbolo = GALATICO[letra.toLowerCase()];
  let saida: HTMLCanvasElement | null = null;
  if (simbolo && typeof document !== 'undefined') {
    const w = px * 3, h = px * 2;
    const rascunho = document.createElement('canvas');
    rascunho.width = w;
    rascunho.height = h;
    const c = rascunho.getContext('2d', { willReadFrequently: true });
    if (c) {
      c.font = `700 ${px}px ${FONTES}`;
      c.textBaseline = 'top';
      c.fillStyle = '#fff';
      c.fillText(simbolo, 2, 2);
      const { data } = c.getImageData(0, 0, w, h);
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      const aceso = (i: number) => data[i * 4 + 3] > 110;
      for (let i = 0; i < w * h; i++) {
        if (!aceso(i)) continue;
        const x = i % w, y = Math.floor(i / w);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      if (x1 >= 0) {
        saida = document.createElement('canvas');
        saida.width = x1 - x0 + 1;
        saida.height = y1 - y0 + 1;
        const o = saida.getContext('2d')!;
        o.fillStyle = cor;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) if (aceso(y * w + x)) o.fillRect(x - x0, y - y0, 1, 1);
        }
      }
    }
  }
  cache.set(chave, saida);
  return saida;
}
