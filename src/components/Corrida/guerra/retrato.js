/*
 * retrato.js — a cabeça do Cavalo da Guerra para a medalha do álbum de
 * insígnias (23/10/2026): o mesmo desenho do chefe (`cavaloDaGuerra.js`), em
 * fúria (olhos acesos, crina de fogo alta), recortado da cabeça até a crina.
 * A medalha do topo (`Insignias/arte.ts`) e a que sai dele quando cai
 * (`palcoGuerra.js`) usam esta.
 */
import { CW, CH, MARGEM_ALTO, MARGEM_TRAS, CAVALEIROS, criarDestino, construirCavalo } from './cavaloDaGuerra.js';

/** O recorte, no desenho do cavalo (o modelo de 170×140): a cabeça, os chifres e a crina por cima. */
const RECORTE = { x0: 100, x1: 162, y0: -24, y1: 60 };

/** Um canvas com a cabeça dele (o canto vazio fica transparente; quem usa corta a borda). */
export function retratoDoCavaloDaGuerra() {
  const d = criarDestino();
  construirCavalo({ t: 0.35, modo: 'parado', p: 0, furia: 1, jaw: 0.35, cab: 0, by: 0, feridas: [], num: '' }, CAVALEIROS.guerra, d);
  const x0 = Math.max(0, RECORTE.x0 + MARGEM_TRAS), y0 = Math.max(0, RECORTE.y0 + MARGEM_ALTO);
  const w = Math.min(CW, RECORTE.x1 + MARGEM_TRAS) - x0, h = Math.min(CH, RECORTE.y1 + MARGEM_ALTO) - y0;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(d.cv, x0, y0, w, h, 0, 0, w, h);
  return c;
}

let guardado;
/** O retrato pronto para `<img>` (borda transparente cortada), guardado: { url, largura, altura } ou null. */
export function retratoUrl() {
  if (guardado !== undefined) return guardado;
  try {
    const c = retratoDoCavaloDaGuerra(), x = c.getContext('2d'), { data, width, height } = x.getImageData(0, 0, c.width, c.height);
    let a = width, b = height, e = -1, f = -1;
    for (let y = 0; y < height; y++) for (let k = 0; k < width; k++) if (data[(y * width + k) * 4 + 3]) { if (k < a) a = k; if (k > e) e = k; if (y < b) b = y; if (y > f) f = y; }
    if (e < 0) return (guardado = null);
    const w = e - a + 1, h = f - b + 1, o = document.createElement('canvas'); o.width = w; o.height = h;
    o.getContext('2d').drawImage(c, a, b, w, h, 0, 0, w, h);
    guardado = { url: o.toDataURL('image/png'), largura: w, altura: h };
  } catch { guardado = null; }
  return guardado;
}
