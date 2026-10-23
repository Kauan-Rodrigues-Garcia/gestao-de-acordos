/*
 * O fogo em pixel art da Guerra na Corrida (laboratório de 22–23/10/2026).
 *
 * Tudo é ASSADO uma vez em sprites; quem desenha só cola imagem pronta. Módulo
 * puro (só canvas, nada de DOM do app): o laboratório `lab-guerra-cavalos.html`
 * usa hoje, e o app pode importar o mesmo arquivo quando a guerra for de verdade.
 *
 * Referências:
 * - o fogo do DOOM de PSX (Fabien Sanglard, «How DOOM fire was done»): uma
 *   textura que sobe e esfria por uma paleta curta, do quase branco ao escuro;
 * - a chama clássica de pixel art (tutoriais de fogo do Pedro Medeiros/Saint11):
 *   miolo claro, camadas de cor até a borda, línguas que se soltam no alto e
 *   somem subindo, pontilhado ordenado (Bayer) no lugar de degradê;
 * - a luz das fogueiras dos jogos 16-bit: halo em três degraus. No canvas opaco
 *   da corrida ela SOMA ('lighter'); por cima do Gestão (canvas transparente) só tinge.
 *
 * Paletas: 'fogo' é o fogo da Guerra; 'peste', 'fome' e 'morte' são os fogos
 * fantasmas dos outros três cavaleiros (verde, violeta, ciano).
 */
export const T2 = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function hash(x, y = 0) {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(((y | 0) + 0x9e3779b9) | 0, 0x85ebca77);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function ruido2(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const h = (a, b) => hash(a + s * 31, b + s * 17);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
function tela(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
const R = (x, c, X, Y, w, h) => { x.fillStyle = c; x.fillRect(X, Y, w, h); };

export const PALETAS = {
  fogo: ['#4a0a05', '#7a1408', '#a8200a', '#d2340c', '#f05212', '#ff7a1c', '#ffa22a', '#ffc83e', '#ffe577', '#fff6c4', '#ffffff'],
  peste: ['#06200c', '#0c3a14', '#14581c', '#1e7a24', '#2ea02c', '#52c43c', '#86e05a', '#b8f282', '#e2ffbc', '#f6ffe6', '#ffffff'],
  fome: ['#10061a', '#200a34', '#34104e', '#4c186c', '#682690', '#8a3cb4', '#ac5cd4', '#cc8aec', '#e8bcfa', '#f8e8ff', '#ffffff'],
  morte: ['#03141a', '#062a34', '#0a4250', '#11606c', '#1c828c', '#2ea6aa', '#52c8c2', '#86e2d6', '#bef4ea', '#e8fffa', '#ffffff'],
};
const PAL = Object.fromEntries(Object.entries(PALETAS).map(([k, v]) => [k, v.map(hexRgb)]));
const LUZ_COR = { fogo: [255, 136, 40], peste: [120, 255, 90], fome: [200, 120, 255], morte: [100, 240, 230] };
export const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map(l => l.map(v => v / 16 - 0.47));

/** Intensidade 0..1 → cor da paleta (rgb), com pontilhado na passagem de uma cor para a outra; null = transparente. */
export function corFogo(I, x, y, pal = 'fogo') {
  const P = PAL[pal] ?? PAL.fogo, v = I + BAYER[y & 3][x & 3] * 0.1;
  return v <= 0.05 ? null : P[clamp(Math.floor(v * P.length), 0, P.length - 1)];
}
export function assarIntensidade(w, h, I, pal = 'fogo') {
  const [cv, cx] = tela(w, h), img = cx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = corFogo(I[y * w + x], x, y, pal); if (!k) continue; const o = (y * w + x) * 4; d[o] = k[0]; d[o + 1] = k[1]; d[o + 2] = k[2]; d[o + 3] = 255; }
  cx.putImageData(img, 0, 0); return cv;
}

export const NQ = 8;   // quadros de cada chama (tocam a 12 por segundo)
/** Uma chama em gota: o miolo balança, a textura sobe e duas línguas se soltam e sobem. */
function assarChama(w, h, sem, pal) {
  return Array.from({ length: NQ }, (_, f) => {
    const I = new Float32Array(w * h), fase = f / NQ * T2;
    for (let y = 0; y < h; y++) {
      const v = 1 - (y + 0.5) / h;
      const meio = w / 2 + Math.sin(v * 3.2 + fase) * w * 0.13 * v + Math.sin(v * 7 - fase * 2) * w * 0.04 * v;
      const larg = (w / 2) * Math.pow(1 - v, 0.75) * (0.86 + 0.14 * Math.sin(v * 9 + fase * 2)) * Math.min(1, (v + 0.12) * 4);
      for (let x = 0; x < w; x++) {
        const dx = Math.abs(x + 0.5 - meio) / Math.max(0.6, larg), n = ruido2(x / 2.4, (y + f * h / NQ * 1.6) / 2.4, sem);
        I[y * w + x] = (1 - dx) * (1.08 - v * 0.7) + (n - 0.5) * 0.5 * (0.35 + v);
      }
    }
    for (let k = 0; k < 2; k++) {
      const u = (f / NQ + k * 0.5 + hash(sem, k) * 0.3) % 1, ty = h * 0.45 * (1 - u), tx = w / 2 + Math.sin(fase + k * 2.1) * w * 0.2, r = Math.max(0.7, (1 - u) * w * 0.17);
      for (let y = Math.floor(ty - r); y <= Math.ceil(ty + r); y++) for (let x = Math.floor(tx - r); x <= Math.ceil(tx + r); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dd = Math.hypot(x + 0.5 - tx, y + 0.5 - ty) / r; if (dd < 1) I[y * w + x] = Math.max(I[y * w + x], (1 - dd) * 0.6 * (1 - u * 0.7));
      }
    }
    return assarIntensidade(w, h, I, pal);
  });
}
/** Bola de fogo de borda irregular; o estágio 0..3 vai de quente (miolo branco) a quase brasa. */
function assarBola(r, est, sem, pal) {
  const w = 2 * r + 3, I = new Float32Array(w * w), c = w / 2;
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / (r + 0.6) + (ruido2(x / 1.8, y / 1.8, sem) - 0.5) * 0.45; if (d < 1) I[y * w + x] = (1 - d) * (1.15 - est * 0.25) + 0.12 - est * 0.05; }
  return assarIntensidade(w, w, I, pal);
}
/** Fumaça: três tons (luz no alto, sombra embaixo) e borda pontilhada. */
function assarFumaca(r, claro) {
  const w = 2 * r + 3, [cv, cx] = tela(w, w), c = w / 2;
  const cores = claro ? ['#f2f0ee', '#d8d4d0', '#b8b2ac'] : ['#6a5c56', '#463a35', '#2c2420'];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy) / (r + 0.5) + (ruido2(x / 2, y / 2, r + (claro ? 9 : 3)) - 0.5) * 0.4;
    if (d >= 1 || (d > 0.78 && (x + y) % 2)) continue;
    R(cx, cores[dy < -r * 0.3 && dx < r * 0.2 ? 0 : dy > r * 0.35 ? 2 : 1], x, y, 1, 1);
  }
  return cv;
}
function assarLuz(r, cor) {
  const w = 2 * r + 1, [cv, cx] = tela(w, w), img = cx.createImageData(w, w), d = img.data;
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const q = Math.hypot(x - r, y - r) / r + BAYER[y & 3][x & 3] * 0.12; if (q >= 1) continue;
    const a = q < 0.34 ? 0.34 : q < 0.67 ? 0.19 : 0.08, o = (y * w + x) * 4; d[o] = cor[0]; d[o + 1] = cor[1]; d[o + 2] = cor[2]; d[o + 3] = a * 255;
  }
  cx.putImageData(img, 0, 0); return cv;
}
/** O escudo de fogo: uma bolha pontilhada, de borda fina. */
function assarEscudo(rx, ry) {
  const w = 2 * rx + 1, h = 2 * ry + 1, [cv, cx] = tela(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = Math.hypot((x - rx) / rx, (y - ry) / ry); if (q > 1) continue;
    if (q > 0.965) R(cx, 'rgba(255,150,40,.7)', x, y, 1, 1);
    else if (q > 0.9 && (x + y) % 2 === 0) R(cx, 'rgba(255,190,70,.5)', x, y, 1, 1);
    else if (q > 0.7 && (x + y) % 4 === 0) R(cx, 'rgba(255,177,46,.32)', x, y, 1, 1);
  }
  return cv;
}

const TAMANHOS = [[5, 8], [8, 13], [12, 19], [17, 27], [24, 38]];
const CACHE = {};
export let FUMACA = [], VAPOR = [], ESCUDO = null;
/** Os sprites de uma paleta (assados na primeira vez que alguém pede). */
export function sprites(pal = 'fogo') {
  return CACHE[pal] ??= {
    chamas: TAMANHOS.map(([w, h], t) => [assarChama(w, h, 3 + t, pal), assarChama(w, h, 17 + t, pal)]),
    bolas: [1, 2, 3, 4, 6, 8, 11].map(r => [0, 1, 2, 3].map(e => [assarBola(r, e, 5 + r, pal), assarBola(r, e, 29 + r, pal)])),
    luz: [6, 10, 16, 26, 40, 64].map(r => assarLuz(r, LUZ_COR[pal] ?? LUZ_COR.fogo)),
  };
}
export function assarFogo() {
  FUMACA = [1, 2, 3, 4, 5, 7, 9].map(r => assarFumaca(r, false)); VAPOR = [1, 2, 3, 4, 5].map(r => assarFumaca(r, true));
  ESCUDO = assarEscudo(90, 74); sprites('fogo');
}

/** Uma chama com a base em (x, y). tier 0..4 é o tamanho; off desencontra o quadro de uma para outra. */
export function chama(ctx, x, y, tier, t, off = 0, v = 0, pal = 'fogo') {
  const q = sprites(pal).chamas[tier][v][((Math.floor(t * 12 + off) % NQ) + NQ) % NQ];
  ctx.drawImage(q, Math.round(x - q.width / 2), Math.round(y - q.height + 1));
}
export function luz(ctx, x, y, k, a, somar = false, pal = 'fogo') {
  if (a <= 0.01) return; const s = sprites(pal).luz[k]; ctx.globalAlpha = Math.min(1, a); if (somar) ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height / 2)); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
export const tremula = (t, sem) => 0.8 + 0.2 * Math.sin(t * 19 + sem) * Math.sin(t * 7.3 + sem * 2);

const entre = (a, b) => a + Math.random() * (b - a);
/** Explosão de fogo: a bola do meio, bolas que voam e esfriam, fumaça e brasas. */
export function explosaoFogo(lista, x, y, e = 1, pal = 'fogo') {
  lista.push({ x, y: y - 4 * e, vx: 0, vy: -8, g: 0, vida: 0.55, max: 0.55, cor: 'bola', tam: Math.min(4, Math.round(2 + 1.5 * e)), cresce: 2, pal });
  for (let k = 0; k < Math.round(9 * e); k++) { const a = Math.random() * T2, v = entre(30, 90) * e; lista.push({ x, y: y - 4 * e, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 20, g: -30, vida: entre(0.4, 0.75), max: 0.75, cor: 'bola', tam: Math.random() < 0.5 ? 1 : 2, cresce: 2.5, v: k & 1, pal }); }
  for (let k = 0; k < Math.round(5 * e); k++) lista.push({ x: x + entre(-8, 8) * e, y: y - 8 * e, vx: entre(-12, 12), vy: entre(-26, -10), g: -4, vida: entre(1.2, 2.2), max: 2.2, cor: 'fumaca', tam: 2 + Math.random() * 3 });
  for (let k = 0; k < Math.round(14 * e); k++) { const a = Math.random() * T2, v = entre(60, 160) * e; lista.push({ x, y: y - 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 160, vida: entre(0.4, 1), max: 1, cor: 'brasa', tam: 1, pal }); }
}
/**
 * Uma partícula: 'fumaca', 'vapor', 'brasa', 'bola' (fogo que cresce e esfria), 'chama' (sprite),
 * ou uma cor qualquer (um pixel de tamanho `tam`). `p.pal` escolhe o fogo.
 */
export function particula(ctx, p, t, cam = 0) {
  const x = Math.round(p.x - cam), y = Math.round(p.y), u = clamp(1 - p.vida / p.max, 0, 1) || 0, c = p.cor;
  if (c === 'fumaca' || c === 'vapor') { const L = c === 'vapor' ? VAPOR : FUMACA, s = L[clamp(Math.floor(p.tam / 1.4), 0, L.length - 1)]; ctx.globalAlpha = (c === 'vapor' ? 0.55 : 0.8) * (1 - u); ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1)); ctx.globalAlpha = 1; return; }
  if (c === 'brasa') { const P = PALETAS[p.pal] ?? PALETAS.fogo; R(ctx, (Math.floor(p.vida * 24) & 1) ? P[9] : u < 0.5 ? P[6] : P[3], x, y, 1, 1); return; }
  if (c === 'fogo' || c === 'bola') {
    if (u > 0.85) { const s = FUMACA[clamp(Math.round((p.tam ?? 1) + (p.cresce ?? 2)), 0, 6)]; ctx.globalAlpha = (1 - u) * 4; ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1)); ctx.globalAlpha = 1; return; }
    const s = sprites(p.pal).bolas[clamp(Math.floor((p.tam ?? 1) + u * (p.cresce ?? 2)), 0, 6)][Math.min(3, Math.floor(Math.pow(u, 1.7) * 4.4))][p.v ?? 0];
    ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1)); return;
  }
  if (c === 'chama') { chama(ctx, x, y, Math.max(0, Math.min(p.tier, Math.floor((1 - u) * (p.tier + 1.8)))), t, p.off ?? 0, p.v ?? 0, p.pal); return; }
  R(ctx, c, x, y, p.tam, p.tam);
}
/** Tira do vetor, sem criar outro (o laço roda 60 vezes por segundo). */
export function poda(a, fica) { let j = 0; for (let i = 0; i < a.length; i++) if (fica(a[i])) a[j++] = a[i]; a.length = j; return a; }
