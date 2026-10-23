/*
 * O cavalo de fogo que o Cavalo da Guerra invoca (Guerra na Corrida, 23/10/2026).
 *
 * É o galope do cavalo da corrida (o mesmo desenho de `corrida-cavalos.html`,
 * só a pose do galope) com o corpo em brasa — mais claro no miolo, a textura
 * subindo — e a crina e o rabo virando línguas de fogo. 8 quadros de galope × 6
 * de fogo, assados de uma vez na primeira vez que alguém pede.
 */
import { assarIntensidade, ruido2 } from './fogo.js';

const T2 = Math.PI * 2, SW = 50, SH = 34, PAD = 4;
const PERNAS = [
  { hx: 27, hy: 19, off: 0.47, d: true, longe: true },
  { hx: 13, hy: 18, off: 0.12, d: false, longe: true },
  { hx: 29.5, hy: 19, off: 0.33, d: true, longe: false },
  { hx: 15, hy: 18, off: 0.0, d: false, longe: false },
];

/** A grade de um quadro do galope: 0 nada, 1 corpo, 2 crina/rabo, 4 olho (fase p de 0 a 1). */
function grade(p) {
  const g = new Uint8Array(SW * SH);
  const disco = (cx, cy, r, c) => {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = x - cx, dy = y - cy, gx = x + PAD; if (dx * dx + dy * dy <= r * r + 0.3 && gx >= 0 && y >= 0 && gx < SW && y < SH) g[y * SW + gx] = c;
    }
  };
  const elipse = (cx, cy, rx, ry, c) => { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1.05 && x + PAD >= 0 && x + PAD < SW && y >= 0 && y < SH) g[y * SW + x + PAD] = c; } };
  const traco = (x0, y0, x1, y1, r0, r1, c) => { const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)); for (let i = 0; i <= n; i++) { const t = i / n; disco(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t, c); } };
  const by = Math.round(-Math.sin(T2 * p) * 0.9), hy = Math.sin(T2 * p + 1.2) > 0.25 ? 1 : 0;
  const perna = P => {
    const ph = T2 * (p - P.off), s = Math.sin(ph), co = Math.cos(ph);
    let a1, a2;
    if (P.d) { a1 = 0.6 * s + 0.05; a2 = co > 0 ? a1 - 1.7 * co : a1; } else { a1 = 0.55 * s - 0.05; a2 = a1 - 0.35 - (co > 0 ? 0.9 * co : 0); }
    const l1 = P.d ? 5.5 : 6, l2 = P.d ? 6.5 : 7, qy = P.hy + by;
    const kx = P.hx + l1 * Math.sin(a1), ky = qy + l1 * Math.cos(a1), fx = kx + l2 * Math.sin(a2), fy = ky + l2 * Math.cos(a2);
    traco(P.hx, qy, kx, ky, P.d ? 2.1 : 2.5, 1.2, 1); traco(kx, ky, fx, fy, 1.0, 0.9, 1);
  };
  perna(PERNAS[0]); perna(PERNAS[1]);
  for (let j = 0; j <= 12; j++) { const t = j / 12; disco(10 - 11 * t, 12 + by + 1.5 * t + 2.5 * t * t + Math.sin(T2 * p - t * 3) * 1.6 * t, 1.9 - 0.9 * t, 2); }
  elipse(21, 15.5 + by, 11.5, 5.4, 1); disco(29.5, 16 + by, 4.8, 1); disco(12.5, 14.8 + by, 5.2, 1);
  traco(28, 14 + by, 33.5, 6.5 + hy, 3.8, 2.6, 1);
  elipse(37.2, 5.6 + hy, 3.4, 2.4, 1); elipse(40.3, 7.8 + hy, 2.4, 2.0, 1);
  const m0x = 27.5, m0y = 11 + by, m1x = 33.3, m1y = 3.6 + hy;
  traco(m0x - 0.8, m0y - 0.6, m1x - 0.8, m1y - 0.4, 1.5, 1.1, 2);
  for (let j = 0; j < 5; j++) { const t = j / 4; disco(m0x + (m1x - m0x) * t - 3.4 + Math.sin(T2 * p + j * 1.3) * 0.7, m0y + (m1y - m0y) * t + 0.6, 1.1, 2); }
  perna(PERNAS[2]); perna(PERNAS[3]);
  g[(5 + hy) * SW + 37 + PAD] = 4;
  return g;
}

let QUADROS = null;
/** { q: [galope 0..7][fogo 0..5] canvases, PL, PT, SW, SH }: desenhe com o canto em (x − SW/2 − PL, chão − 32 − PT). */
export function cavalosDeFogo() {
  if (QUADROS) return QUADROS;
  const PL = 12, PT = 10, WW = SW + PL + 2, HH = SH + PT;
  const q = Array.from({ length: 8 }, (_, k) => {
    const tipo = grade(k / 8);
    return Array.from({ length: 6 }, (_, f) => {
      const I = new Float32Array(WW * HH);
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
        const tp = tipo[y * SW + x]; if (!tp) continue; const X = x + PL, Y = y + PT, o = Y * WW + X;
        if (tp === 4) { I[o] = 1; continue; }
        // a borda fica escura: o contorno
        const borda = [x - 1, x + 1].some(xx => xx < 0 || xx >= SW || !tipo[y * SW + xx]) || [y - 1, y + 1].some(yy => yy < 0 || yy >= SH || !tipo[yy * SW + x]);
        if (borda && tp === 1) { I[o] = Math.max(I[o], 0.17); continue; }
        let viz = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < SW && yy < SH && tipo[yy * SW + xx] === 1) viz++; }
        I[o] = Math.max(I[o], 0.3 + 0.46 * (viz / 25) + (ruido2(x / 2.3, (y + f * 2.4) / 2.3, 11) - 0.5) * 0.5);
        if (tp === 2) {   // crina e rabo: línguas de fogo
          const rabo = x < PAD + 14, L = 3 + Math.floor(7 * ruido2(x / 1.7, (y + f * 3) / 1.7, 13)), ddx = rabo ? -1 : -0.55, ddy = rabo ? -0.4 : -1;
          I[o] = Math.max(I[o], 0.78);
          for (let k2 = 1; k2 <= L; k2++) { const xx = Math.round(X + ddx * k2 + Math.sin(k2 * 0.9 + f) * 0.6), yy = Math.round(Y + ddy * k2); if (xx < 0 || yy < 0 || xx >= WW || yy >= HH) break; const oo = yy * WW + xx; I[oo] = Math.max(I[oo], 0.8 - k2 / L * 0.62); }
        }
      }
      return assarIntensidade(WW, HH, I);
    });
  });
  QUADROS = { q, PL, PT, SW, SH };
  return QUADROS;
}
