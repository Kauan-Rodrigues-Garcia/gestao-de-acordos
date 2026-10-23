/*
 * O Cavalo da Guerra — o cavalo vermelho do segundo cavaleiro do Apocalipse —
 * e os dos outros três (Peste, Fome, Morte), em pixel art montado por código.
 * (Guerra na Corrida, laboratório de 23/10/2026.)
 *
 * Por que código e não um PNG: ele anda, galopa, empina, abaixa a cabeça para a
 * cabeçada e abre a boca para o fogo; toda pose sai desta mesma montagem.
 *
 * O que dá cara de pixel art feito à mão, e não de vetor:
 *  - rampas curtas de 6 tons por material (pelo, ferro, ouro, couro, osso, aço,
 *    pano), a sombra puxando para o frio e a luz para o quente;
 *  - relevo pela distância até a borda de CADA PEÇA: cada placa da armadura
 *    ganha o seu chanfro; a luz vem sempre de cima, à esquerda;
 *  - contorno seletivo (sel-out): a borda é o tom mais escuro da própria peça;
 *  - sombra de contato embaixo de placa, sela e pano; brilho especular só no metal;
 *  - filete de ouro onde a armadura encosta no pelo;
 *  - crina, rabo e cascos são FOGO (a paleta de fogo.js), não cabelo.
 *
 * O desenho é feito num modelo de 170×140 (casco na linha 132, olhando para a
 * direita); a GRADE tem uma margem a mais em cima e atrás (`MARGEM_ALTO`,
 * `MARGEM_TRAS`) para o fogo da crina e do rabo, que passava da borda e saía
 * cortado. Tudo o que sai daqui (`CW`, `CH`, `CCHAO`, `CMEIO`, `cabecaDo`,
 * `noCavalo`, `naGrade`, as feridas) está na grade. A grade de códigos
 * (dest.g) é o que o tiro consulta (tipoDoAcerto): olho, cara, armadura, fogo
 * ou corpo.
 */
import { T2, clamp, hash, ruido2, corFogo } from './fogo.js';

const lerp = (a, b, t) => a + (b - a) * t;
const bez = (a, b, c, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]; };
const bezD = (a, b, c, t) => [2 * (1 - t) * (b[0] - a[0]) + 2 * t * (c[0] - b[0]), 2 * (1 - t) * (b[1] - a[1]) + 2 * t * (c[1] - b[1])];
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rampa = l => l.map(hexRgb);

/** O modelo (onde as formas são pensadas) e a margem que a grade tem a mais para o fogo não sair cortado. */
const MW = 170, MH = 140, MEIO = MW / 2;
export const MARGEM_ALTO = 30, MARGEM_TRAS = 30;
/** A grade: `CMEIO` é o x do meio do cavalo (onde ele espelha), `CCHAO` a linha do casco e `CPIV` o casco de trás, onde ele gira para empinar. */
export const CW = MW + MARGEM_TRAS, CH = MH + MARGEM_ALTO, CCHAO = 132 + MARGEM_ALTO, CMEIO = MEIO + MARGEM_TRAS, CPIV = 52 - MEIO;
/**
 * Até onde ele vai, em px da grade a partir do meio e do casco, em qualquer pose e com a fúria no
 * máximo (`cavaloDaGuerra.test.ts` mede): o rabo para trás, a cabeça para a frente e a crina para cima,
 * já contando o empinar. Quem põe ele na tela usa isto para ele nunca sair cortado.
 */
export const EXTENSAO = { tras: 136, frente: 104, alto: 160 };
export const MAT = { PELO: 1, PELO_LONGE: 2, CRINA: 3, RABO: 4, CASCO: 6, ARMAD: 7, OLHO: 8, OURO: 9, COURO: 10, LAMINA: 11, PUNHO: 12, OSSO: 13, BOCA: 14, DENTE: 15, CARA: 16, FERIDA: 17, LAVA: 18, CORRENTE: 19, PANO: 20, NUMERO: 21, CHIFRE: 22, FOGO_PE: 23 };
const { PELO, PELO_LONGE, CRINA, RABO, CASCO, ARMAD, OLHO, OURO, COURO, LAMINA, PUNHO, OSSO, BOCA, DENTE, CARA, FERIDA, LAVA, CORRENTE, PANO, NUMERO, CHIFRE, FOGO_PE } = MAT;
const FOGO = k => k === CRINA || k === RABO || k === FOGO_PE;
/** O que o tiro pegou: 'olho' | 'cabeca' | 'armadura' | 'fogo' | 'corpo' | null. */
export function tipoDoAcerto(k) {
  if (!k) return null;
  if (k === OLHO) return 'olho';
  if (k === CARA || k === BOCA || k === DENTE) return 'cabeca';
  if (FOGO(k)) return 'fogo';
  if (k === ARMAD || k === OURO || k === LAMINA || k === PUNHO || k === OSSO || k === CHIFRE || k === CORRENTE || k === CASCO || k === NUMERO) return 'armadura';
  return 'corpo';
}

const LAMINA_ACO = rampa(['#1c2028', '#3a4250', '#6a7488', '#a6b0c4', '#e6ecf8', '#ffffff']);
const OSSO_VELHO = rampa(['#3a3226', '#6b604c', '#a89a7c', '#d8ccae', '#f4ecd8', '#ffffff']);
const CASCO_NEGRO = rampa(['#060508', '#121018', '#22202a', '#38354a', '#52506a', '#706e8a']);
const COURO_ESC = rampa(['#140a06', '#28140c', '#3f2214', '#5a321d', '#764428', '#8e5634']);
/** Os quatro cavalos: as rampas de cada material, o fogo, os olhos e o que o cavaleiro deixou na sela. */
export const CAVALEIROS = {
  guerra: {
    nome: 'Guerra', fogo: 'fogo', arma: 'espada',
    pelo: rampa(['#1a0406', '#3a0a0d', '#661316', '#93201d', '#bd3524', '#df5a3a']),
    armad: rampa(['#09080c', '#16151c', '#25232e', '#3b3848', '#5d5970', '#9692ab']),
    metal: rampa(['#2e1a06', '#5c360c', '#8f5a14', '#c88a22', '#f0c050', '#fff0a8']),
    pano: rampa(['#1e0408', '#3c0810', '#600e18', '#861824', '#a8263a', '#c8405a']),
    couro: COURO_ESC, osso: OSSO_VELHO, lamina: LAMINA_ACO, casco: CASCO_NEGRO, olho: [hexRgb('#fff6c4'), hexRgb('#ff5a1a')],
  },
  peste: {
    nome: 'Peste', fogo: 'peste', arma: 'arco',
    pelo: rampa(['#3e4234', '#666c56', '#8e9478', '#b6ba9c', '#d6d8be', '#f0f0dc']),
    armad: rampa(['#0e1a14', '#1c3026', '#2c4a38', '#40664e', '#5e8a6a', '#8ab894']),
    metal: rampa(['#2a2408', '#4e4410', '#7a6a1c', '#a8952c', '#d0bc48', '#f0e08a']),
    pano: rampa(['#0e1806', '#1c2e0c', '#2c4614', '#3e5e1c', '#527a26', '#6e9a34']),
    couro: COURO_ESC, osso: OSSO_VELHO, lamina: LAMINA_ACO, casco: CASCO_NEGRO, olho: [hexRgb('#e2ffbc'), hexRgb('#3cb43a')],
  },
  fome: {
    nome: 'Fome', fogo: 'fome', arma: 'balanca',
    pelo: rampa(['#040306', '#0a080e', '#141118', '#201c26', '#2e2936', '#423b4e']),
    armad: rampa(['#08070c', '#121018', '#1c1a26', '#2a2838', '#3c3a50', '#5a5874']),
    metal: rampa(['#1c1e24', '#3a3e48', '#5e6472', '#8c94a6', '#bcc4d4', '#eef2fa']),
    pano: rampa(['#100618', '#200c30', '#32124a', '#461a64', '#5c2680', '#76369e']),
    couro: COURO_ESC, osso: OSSO_VELHO, lamina: LAMINA_ACO, casco: CASCO_NEGRO, olho: [hexRgb('#f2d4ff'), hexRgb('#8a36b4')],
  },
  morte: {
    nome: 'Morte', fogo: 'morte', arma: 'foice',
    pelo: rampa(['#1a241e', '#2e3e34', '#4a5e50', '#6a8270', '#90a894', '#bcd2be']),
    armad: rampa(['#140a06', '#2a160c', '#422414', '#5c361e', '#7a4c2c', '#9c6a40']),
    metal: OSSO_VELHO,
    pano: rampa(['#0a1214', '#142226', '#20363a', '#2e4c50', '#406468', '#567e82']),
    couro: COURO_ESC, osso: OSSO_VELHO, lamina: LAMINA_ACO, casco: CASCO_NEGRO, olho: [hexRgb('#e8fffa'), hexRgb('#2ea6aa')],
  },
};

/** Onde o cavalo é montado: canvas, grade de códigos e os rascunhos do sombreado. */
export function criarDestino() {
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const cx = cv.getContext('2d');
  return { cv, cx, img: cx.createImageData(CW, CH), g: new Uint8Array(CW * CH), d: new Uint8Array(CW * CH), I: new Float32Array(CW * CH) };
}
/** O pescoço e a cabeça, no modelo. `cab` 0 = cabeça erguida, 1 = abaixada para a cabeçada (a testa vai na frente). */
function cabecaNoModelo(o) {
  const cab = o.cab ?? 0, by = o.by ?? 0;
  const B0 = [112, 64 + by], C = [lerp(117, 138, cab), lerp(32, 48, cab) + by], N = [lerp(133, 150, cab), lerp(23, 58, cab) + by];
  const ang = 0.55 + 0.75 * cab, co = Math.cos(ang), si = Math.sin(ang);
  return { B0, C, N, ang, pt: (u, v) => [N[0] + u * co - v * si, N[1] + u * si + v * co] };
}
/** O pescoço e a cabeça, na grade (`pt(u, v)`: um ponto da cabeça, para quem desenha ou atira em volta). */
export function cabecaDo(o) {
  const h = cabecaNoModelo(o);
  return { ...h, pt: (u, v) => { const [x, y] = h.pt(u, v); return [x + MARGEM_TRAS, y + MARGEM_ALTO]; } };
}
/** O ponto que bate na cabeçada: o focinho com a cabeça erguida, a testa com ela abaixada. */
export const pontaDaCabeca = cab => cabecaDo({ cab }).pt(23 - 18 * cab, 1 - 9 * cab);
/** Um ponto da grade (gx, gy), no canvas onde o cavalo está desenhado em B.x, B.y, B.dir, B.rot, escala k. */
export function noCavalo(B, gx, gy, k = 1) {
  let lx = gx - CMEIO, ly = gy - CCHAO;
  const rx = lx - CPIV, co = Math.cos(B.rot), si = Math.sin(B.rot);
  lx = CPIV + rx * co - ly * si; ly = rx * si + ly * co;
  return [B.x + lx * B.dir * k, B.y + ly * k];
}
export function naGrade(B, px, py, k = 1) {
  let lx = (px - B.x) * B.dir / k, ly = (py - B.y) / k;
  const rx = lx - CPIV, co = Math.cos(-B.rot), si = Math.sin(-B.rot);
  lx = CPIV + rx * co - ly * si; ly = rx * si + ly * co;
  return [Math.floor(lx + CMEIO), Math.floor(ly + CCHAO)];
}

const PB = [
  { hx: 47, hy: 78, d: false, longe: true, off: 0.12, aoff: 0.25 },
  { hx: 106, hy: 80, d: true, longe: true, off: 0.47, aoff: 0.5 },
  { hx: 55, hy: 78, d: false, longe: false, off: 0.0, aoff: 0.75 },
  { hx: 113, hy: 80, d: true, longe: false, off: 0.33, aoff: 0.0 },
];
const VEIAS = [[[42, 84], [47, 90], [45, 98], [48, 104]], [[60, 86], [63, 94]], [[108, 92], [110, 101], [109, 108]], [[121, 58], [125, 50]], [[88, 86], [95, 90]], [[56, 96], [54, 104]]];
const FONTE = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111' };
const CAVEIRA = ['.XXXXX.', 'XXXXXXX', 'XooXooX', 'XXXXXXX', '.XoXoX.', '.X.X.X.'];

/**
 * Monta um quadro. o = { t, modo: 'parado'|'anda'|'galope'|'empina', p (fase do passo), by (sobe/desce),
 * cab, jaw, furia 0..1, flash 0..1, feridas [{x,y,r}], num (o número do cavalo da corrida),
 * espelho (vai ser desenhado virado para a esquerda: o número sai invertido aqui para ler certo lá) }.
 */
export function construirCavalo(o, cav, dest) {
  const { g, d, I, img } = dest; g.fill(0); I.fill(0);
  // As formas pensam no modelo; o pixel vai para a grade, com a margem.
  const dentro = (x, y) => x >= 0 && y >= 0 && x < CW && y < CH;
  const naGradeI = (x, y) => { x = Math.round(x) + MARGEM_TRAS; y = Math.round(y) + MARGEM_ALTO; return dentro(x, y) ? y * CW + x : -1; };
  const pinta = (x, y, k) => { const i = naGradeI(x, y); if (i >= 0) g[i] = k; };
  const sobre = de => (x, y, k) => { const i = naGradeI(x, y); if (i >= 0 && de.includes(g[i])) g[i] = k; };
  const disco = (cx, cy, r, k, f = pinta) => { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= r * r + 0.3) f(x, y, k); } };
  const elipse = (cx, cy, rx, ry, k, f = pinta) => { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1.05) f(x, y, k); } };
  const elipseR = (cx, cy, rx, ry, a, k, f = pinta) => { const r = Math.max(rx, ry) + 1, co = Math.cos(a), si = Math.sin(a); for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const dx = x - cx, dy = y - cy, lx = (dx * co + dy * si) / rx, ly = (-dx * si + dy * co) / ry; if (lx * lx + ly * ly <= 1.05) f(x, y, k); } };
  const traco = (x0, y0, x1, y1, r0, r1, k, f = pinta) => { const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5)); for (let i = 0; i <= n; i++) { const u = i / n; disco(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, r0 + (r1 - r0) * u, k, f); } };
  const fio = (pts, k, f = pinta, salto = 0) => { let n = 0; for (let j = 0; j < pts.length - 1; j++) { const [x0, y0] = pts[j], [x1, y1] = pts[j + 1], m = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))); for (let i = 0; i <= m; i++, n++) if (!salto || n % salto !== salto - 1) f(x0 + (x1 - x0) * i / m, y0 + (y1 - y0) * i / m, k); } };
  // o fogo só ocupa o vazio (fica por trás do corpo); a intensidade vai para I
  const fogoEm = (x, y, v, k) => { const i = naGradeI(x, y); if (i < 0) return; const at = g[i]; if (at && !FOGO(at)) return; if (v > I[i]) { I[i] = v; g[i] = k; } };
  const lingua = (x0, y0, ang, L, w0, fase, k, quente = 0) => {
    const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
    for (let s = 0; s <= L; s += 0.6) {
      const q = s / L, larg = Math.max(0.5, w0 * Math.pow(1 - q, 0.7)), ond = Math.sin(s * 0.33 + fase) * s * 0.13;
      const cx = x0 + dx * s + px * ond, cy = y0 + dy * s + py * ond;
      for (let e = -larg; e <= larg; e += 0.6) fogoEm(cx + px * e, cy + py * e, (1 - Math.abs(e) / (larg + 0.6)) * (1.05 - q * 0.65) + 0.18 + quente, k);
    }
  };
  const t = o.t ?? 0, by = Math.round(o.by ?? 0), p = o.p ?? 0, jaw = o.jaw ?? 0, F = o.furia ?? 0, modo = o.modo ?? 'parado';
  const vento = modo === 'galope' ? 1 : modo === 'empina' ? 0.55 : 0;

  // ---- as pernas
  const angulo = P => {
    if (modo === 'galope') { const ph = T2 * (p - P.off), s = Math.sin(ph), co = Math.cos(ph); if (P.d) { const a1 = 0.6 * s + 0.08; return [a1, co > 0 ? a1 - 1.45 * co : a1 + 0.05]; } const a1 = 0.52 * s - 0.08; return [a1, a1 - 0.32 - (co > 0 ? 0.85 * co : 0)]; }
    if (modo === 'anda') { const ph = T2 * (p - P.aoff), s = Math.sin(ph), co = Math.cos(ph); if (P.d) { const a1 = 0.26 * s; return [a1, co > 0 ? a1 - 0.8 * co : a1]; } const a1 = 0.22 * s - 0.1; return [a1, a1 + 0.04 - (co > 0 ? 0.42 * co : 0)]; }
    if (modo === 'empina' && P.d) return P.longe ? [1.2, -0.25] : [0.9, -0.85];
    return P.d ? [0.04, 0.0] : [0.16, -0.22];   // a de trás com o jarrete dobrado
  };
  const pes = [];
  const perna = P => {
    const [a1, a2] = angulo(P), l1 = P.d ? 22 : 23, l2 = P.d ? 26 : 27, qy = P.hy + by, k = P.longe ? PELO_LONGE : PELO;
    const kx = P.hx + l1 * Math.sin(a1), ky = qy + l1 * Math.cos(a1), fx = kx + l2 * Math.sin(a2), fy = ky + l2 * Math.cos(a2);
    traco(P.hx, qy, kx, ky, P.d ? 8.5 : 10.5, P.d ? 4.6 : 5.2, k); traco(kx, ky, fx, fy, P.d ? 4.2 : 4.6, 3.3, k);
    disco(fx - Math.sin(a2) * 3, fy - Math.cos(a2) * 3, 3.9, k);   // o boleto
    if (P.d) disco(kx, ky, 3.6, ARMAD, sobre([k]));                // a joelheira
    elipse(fx + Math.sin(a2) * 1.3, fy + 2.2, 5.4, 3.4, CASCO);
    pes.push([fx - Math.sin(a2) * 3, fy - 2]);
  };
  perna(PB[0]); perna(PB[1]);

  // ---- o corpo, o pescoço e a cabeça (pelo)
  elipse(82, 70 + by, 36, 19, PELO); disco(52, 66 + by, 21, PELO); elipse(50, 76 + by, 17, 14, PELO); disco(111, 70 + by, 18, PELO); elipse(84, 80 + by, 28, 9, PELO);
  const Hc = cabecaNoModelo({ cab: o.cab, by });
  const ptN = u => bez(Hc.B0, Hc.C, Hc.N, u), raio = u => lerp(17, 9.5, u);
  for (let i = 0; i <= 44; i++) { const u = i / 44, [x, y] = ptN(u); disco(x, y, raio(u), PELO); }
  const er = (u, v, rx, ry, k, da = 0, f = pinta) => { const [x, y] = Hc.pt(u, v); elipseR(x, y, rx, ry, Hc.ang + da, k, f); };
  const tr = (u0, v0, u1, v1, r0, r1, k, f = pinta) => { const [a, b] = Hc.pt(u0, v0), [c2, d2] = Hc.pt(u1, v1); traco(a, b, c2, d2, r0, r1, k, f); };
  er(3, -1, 12, 9.2, CARA); er(18, 3.2, 9.2, 7, CARA); er(6, 5, 8.8, 6.6, CARA); er(16, 8 + jaw * 4, 8, 3, CARA, jaw * 0.25);

  // ---- a armadura: placas no pescoço (crinet), testeira com chifres, peitoral com caveira, garupeira com espinhos
  const crista = u => { const [x, y] = ptN(u), dd = bezD(Hc.B0, Hc.C, Hc.N, u), l = Math.hypot(dd[0], dd[1]) || 1; return [x, y, dd[1] / l, -dd[0] / l]; };
  for (let i = 0; i <= 44; i++) { const u = 0.06 + i / 44 * 0.86, [x, y, nx, ny] = crista(u), r = raio(u); disco(x + nx * r * 0.42, y + ny * r * 0.42, r * 0.68, ARMAD, sobre([PELO])); }
  for (let k = 0; k < 7; k++) { const u = 0.12 + k * 0.12, [x, y, nx, ny] = crista(u), r = raio(u); fio([[x - nx * r * 0.2, y - ny * r * 0.2], [x + nx * r, y + ny * r]], OURO, sobre([ARMAD])); }
  er(6, -4.8, 13.5, 5.2, ARMAD, 0, sobre([CARA])); er(18, -0.6, 7.4, 3.4, ARMAD, 0, sobre([CARA]));
  const chifre = (u0, v0, s) => { const pts = [[u0, v0, 2.9], [u0 - 4 * s, v0 - 4.5, 2.2], [u0 - 7.5 * s, v0 - 8, 1.4], [u0 - 9 * s, v0 - 11.5, 0.6]]; for (let j = 0; j < pts.length - 1; j++) tr(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], pts[j][2], pts[j + 1][2], CHIFRE); };
  chifre(2.5, -7.5, 0.8); chifre(-0.5, -7, 1);
  tr(10, -6.5, 16, -11, 1.7, 0.4, CHIFRE);
  er(5, -2.6, 3, 2.3, BOCA); er(5.3, -2.6, 2, 1.5, OLHO);
  { const [a, b] = Hc.pt(22, 1.5); pinta(a, b, LAVA); pinta(a - 1, b, LAVA); }   // a venta acesa
  if (jaw > 0.08) {
    er(17, 5.5 + jaw * 2, 6.5, 1 + jaw * 2.6, BOCA);
    for (let u = 12; u <= 21; u += 2) { const [a, b] = Hc.pt(u, 4.6); pinta(a, b, DENTE); const [c2, d2] = Hc.pt(u, 6.5 + jaw * 4 - 1.6); pinta(c2, d2, DENTE); }
  } else tr(17, 6.4, 23, 5.2, 0.5, 0.5, BOCA);
  { const [a, b] = Hc.pt(15, 5); disco(a, b, 1.3, OURO); }   // a argola do freio
  elipse(115, 70 + by, 12, 14, ARMAD, sobre([PELO]));
  CAVEIRA.forEach((l, j) => [...l].forEach((ch, i) => { if (ch !== '.') pinta(117 + i, 65 + j + by, ch === 'X' ? OSSO : BOCA); }));
  for (let y = 40; y <= 62; y++) for (let x = 30; x <= 66; x++) { const i = naGradeI(x, y + by); if (i < 0 || g[i] !== PELO) continue; const dx = x - 51, dy = y - 60; if (dx * dx / 324 + dy * dy / 260 <= 1) g[i] = ARMAD; }
  for (const sx of [38, 47, 56]) { let ty = 0; while (ty < MH && g[naGradeI(sx, ty)] !== ARMAD) ty++; for (let k = 1; k <= 5; k++) { const half = (6 - k) * 0.35; for (let xx = Math.round(sx - half); xx <= Math.round(sx + half); xx++) pinta(xx, ty - k, CHIFRE); } }

  // ---- a gualdrapa rasgada com o número do cavalo da corrida, a sela, e o que o cavaleiro deixou
  for (let y = 52; y <= 86; y++) for (let x = 64; x <= 98; x++) {
    const i = naGradeI(x, y + by); if (i < 0 || g[i] !== PELO) continue;
    const barra = 77 + 3 * Math.sin(x * 0.9) + (hash(x, 3) < 0.25 ? -3 : 0); if (y > barra) continue;
    g[i] = (x <= 65 || x >= 97 || y <= 53 || y > barra - 1.5) ? OURO : PANO;
  }
  { const s = String(o.num ?? ''), soPano = sobre([PANO]); let nx = Math.round(81 - (s.length * 8 - 2) / 2); for (const ch of s) { const b = FONTE[ch]; if (b) for (let i = 0; i < 15; i++) if (b[i] === '1') { const X = nx + (i % 3) * 2, Y = 60 + by + ((i / 3) | 0) * 2; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) soPano(o.espelho ? 162 - (X + dx) : X + dx, Y + dy, NUMERO); } nx += 8; } }
  elipse(80, 50 + by, 15, 4.5, COURO);
  traco(65, 52 + by, 63, 41 + by, 2.8, 2, ARMAD); traco(95, 52 + by, 97, 42 + by, 2.6, 1.8, ARMAD);
  disco(63, 40 + by, 1.8, OURO); disco(97, 41 + by, 1.8, OURO);
  if (cav.arma === 'espada') {   // a grande espada da Guerra, cravada na sela
    traco(70.5, 22 + by, 76.5, 49 + by, 1.7, 1.3, LAMINA); traco(63, 23 + by, 78, 20.5 + by, 1.3, 1.3, PUNHO);
    traco(70, 21 + by, 68.6, 12 + by, 1.3, 1.1, COURO); disco(68.4, 10.5 + by, 2, PUNHO); disco(70.8, 21.6 + by, 0.9, LAVA);
  } else if (cav.arma === 'balanca') {   // a balança da Fome
    traco(73, 12 + by, 76, 47 + by, 1.1, 1.1, PUNHO); traco(62, 14 + by, 84, 13 + by, 1, 1, PUNHO);
    fio([[63, 14 + by], [60, 24 + by]], CORRENTE); fio([[63, 14 + by], [66, 24 + by]], CORRENTE); fio([[83, 13 + by], [80, 23 + by]], CORRENTE); fio([[83, 13 + by], [86, 23 + by]], CORRENTE);
    elipse(63, 25 + by, 4.5, 1.3, PUNHO); elipse(83, 24 + by, 4.5, 1.3, PUNHO);
  } else if (cav.arma === 'foice') {   // a foice da Morte
    traco(66, 8 + by, 78, 49 + by, 1.2, 1.2, COURO);
    const pts = [[66, 8], [74, 4], [83, 7], [89, 14]]; for (let j = 0; j < 3; j++) traco(pts[j][0], pts[j][1] + by, pts[j + 1][0], pts[j + 1][1] + by, 1.8 - j * 0.5, 1.3 - j * 0.45, LAMINA);
  } else if (cav.arma === 'arco') {   // o arco da Peste
    for (let i = 0; i <= 20; i++) { const u = i / 20, [x, y] = bez([64, 14], [56, 30], [70, 46], u); disco(x, y + by, 1.1, PUNHO); }
    fio([[64, 14 + by], [70, 46 + by]], OSSO);
  }

  // ---- corrente, veias de lava, feridas, as pernas do lado de cá e a rédea
  { const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push([lerp(101, 66, u), lerp(81, 78, u) + by + 28 * u * (1 - u)]); } fio(pts, CORRENTE, pinta, 3); }
  for (const v of VEIAS) fio(v.map(([x, y]) => [x, y + by]), LAVA, sobre([PELO]));
  for (const f of o.feridas ?? []) disco(f.x - MARGEM_TRAS, f.y - MARGEM_ALTO + by, f.r, FERIDA, sobre([PELO, CARA]));   // a ferida vem do tiro: na grade
  perna(PB[2]); perna(PB[3]);
  { const [a, b] = Hc.pt(14, 4); fio([[a, b], [lerp(a, 96, 0.5), lerp(b, 46 + by, 0.5) + 6], [96, 46 + by]], COURO); }
  // o filete de ouro: onde a armadura encosta no pelo ou no pano
  { const viz = []; for (let y = 1; y < CH - 1; y++) for (let x = 1; x < CW - 1; x++) { const i = y * CW + x; if (g[i] !== ARMAD) continue; for (const j of [i - 1, i + 1, i - CW, i + CW]) { const k = g[j]; if (k === PELO || k === CARA || k === PELO_LONGE || k === PANO) { viz.push(i); break; } } } for (const i of viz) g[i] = OURO; }

  // ---- o fogo: crina, topete, rabo e os cascos
  for (let j = 0; j < 15; j++) {
    const u = 0.05 + j / 14 * 0.88, [x, y, nx, ny] = crista(u), r = raio(u);
    const L = (11 + 9 * hash(j, 7) + 7 * u) * (1 + F * 0.5) * (0.85 + 0.15 * Math.sin(t * 6 + j * 1.7));
    const ang = -Math.PI / 2 - lerp(0.5, 1.05, vento) - u * 0.15 + Math.sin(t * 3 + j) * 0.12 + F * 0.25;
    lingua(x + nx * (r - 0.5), y + ny * (r - 0.5), ang, L, 3.4 + u * 0.6, t * 8 + j * 2.1, CRINA, F * 0.15);
  }
  { const [a, b] = Hc.pt(1, -8.5); lingua(a, b, -Math.PI / 2 - 0.9 - vento * 0.4, 9 + F * 4, 2.6, t * 9, CRINA, F * 0.15); }
  for (let j = 0; j < 7; j++) {
    const ang = Math.PI + lerp(0.15, -0.05, vento) - 0.32 + j * 0.13 + Math.sin(t * 2.5 + j) * 0.08;
    lingua(30 + j * 0.4, 50 + by + j * 1.4, ang, (26 + 10 * hash(j, 5)) * (1 + F * 0.4), 4.6, t * 7 + j * 1.9, RABO, F * 0.12);
  }
  for (const [x, y] of pes) for (let j = 0; j < 2; j++) lingua(x + j * 2 - 1, y, -Math.PI / 2 - 0.5 - vento * 0.6 + j * 0.3, 5 + 3 * hash(Math.round(x), j) + F * 2, 2.2, t * 10 + j + x, FOGO_PE, 0.05);

  // ---- o relevo: a distância de cada pixel até a borda da sua peça
  const N = CW * CH, grupo = k => (k === PELO || k === CARA || k === FERIDA || k === LAVA) ? 1 : (k === ARMAD || k === OURO) ? 3 : (k === PANO || k === NUMERO) ? 20 : k;
  for (let i = 0; i < N; i++) d[i] = g[i] && !FOGO(g[i]) ? 9 : 0;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const i = y * CW + x; if (!d[i]) continue; const gr = grupo(g[i]);
    if (x === 0 || y === 0 || x === CW - 1 || y === CH - 1 || !d[i - 1] || !d[i + 1] || !d[i - CW] || !d[i + CW] || grupo(g[i - 1]) !== gr || grupo(g[i + 1]) !== gr || grupo(g[i - CW]) !== gr || grupo(g[i + CW]) !== gr) d[i] = 1;
  }
  for (let y = 1; y < CH - 1; y++) for (let x = 1; x < CW - 1; x++) { const i = y * CW + x; if (d[i] > 1) d[i] = Math.min(d[i], d[i - 1] + 1, d[i - CW] + 1, d[i - CW - 1] + 1, d[i - CW + 1] + 1); }
  for (let y = CH - 2; y > 0; y--) for (let x = CW - 2; x > 0; x--) { const i = y * CW + x; if (d[i] > 1) d[i] = Math.min(d[i], d[i + 1] + 1, d[i + CW] + 1, d[i + CW + 1] + 1, d[i + CW - 1] + 1); }

  // ---- as cores
  const RAMPA = { [PELO]: cav.pelo, [CARA]: cav.pelo, [PELO_LONGE]: cav.pelo, [ARMAD]: cav.armad, [OURO]: cav.metal, [COURO]: cav.couro, [LAMINA]: cav.lamina, [PUNHO]: cav.metal, [OSSO]: cav.osso, [CHIFRE]: cav.osso, [CORRENTE]: cav.armad, [PANO]: cav.pano, [CASCO]: cav.casco, [FERIDA]: cav.pelo };
  const METAL = new Set([ARMAD, OURO, LAMINA, PUNHO, CORRENTE]), DESLOC = { [PELO_LONGE]: -0.2, [CHIFRE]: -0.12, [CORRENTE]: 0.15 };
  const data = img.data; data.fill(0);
  const fl = o.flash ?? 0, Lx = -0.62, Ly = -0.78, D = j => d[j] || 0;
  const put = (i, c) => { const q = i * 4; data[q] = c[0] + (255 - c[0]) * fl; data[q + 1] = c[1] + (255 - c[1]) * fl; data[q + 2] = c[2] + (255 - c[2]) * fl; data[q + 3] = 255; };
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const i = y * CW + x, k = g[i];
    if (!k) {   // contorno seletivo: o tom mais escuro da peça vizinha
      let viz = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < CW - 1 ? i + 1 : -1, y > 0 ? i - CW : -1, y < CH - 1 ? i + CW : -1]) if (j >= 0 && g[j] && !FOGO(g[j])) { viz = g[j]; break; }
      if (viz) put(i, (RAMPA[viz] ?? cav.armad)[0]);
      continue;
    }
    if (FOGO(k)) { const c = corFogo(I[i] * (0.7 + 0.55 * ruido2(x / 2.2, (y + t * 40) / 4.5, 5)) + F * 0.1, x, y, cav.fogo); if (c) put(i, c); else g[i] = 0; continue; }
    if (k === LAVA) { put(i, corFogo(0.5 + 0.22 * Math.sin(t * 4 + x * 0.21 + y * 0.13) + F * 0.25, x, y, cav.fogo) ?? cav.pelo[2]); continue; }
    if (k === OLHO) { put(i, (g[i - 1] === OLHO && g[i + 1] === OLHO) || F > 0.4 ? cav.olho[0] : cav.olho[1]); continue; }
    if (k === BOCA) { put(i, cav.pelo[0]); continue; }
    if (k === DENTE) { put(i, cav.osso[4]); continue; }
    if (k === NUMERO) { put(i, cav.metal[4]); continue; }
    if (k === FERIDA) { put(i, hash(x, y + 5) < 0.4 ? [94, 8, 12] : [158, 15, 22]); continue; }
    const gx = D(i + 1) - D(i - 1), gy = D(i + CW) - D(i - CW), len = Math.hypot(gx, gy) || 1;
    const lam = -(gx * Lx + gy * Ly) / len, borda = 1 - Math.min(d[i] - 1, 4) / 4, gr = grupo(k);
    let v = 0.5 + 0.42 * lam * borda + 0.1 * (1 - borda) + (DESLOC[k] ?? 0);
    if (gr === 1 || k === PELO_LONGE) { v -= 0.2 * clamp((y - MARGEM_ALTO - 66) / 60, 0, 1); const cima = g[i - CW]; if (grupo(cima) === 3 || cima === PANO || cima === COURO) v -= 0.25; }
    if (gr === 20 && grupo(g[i - CW]) === 3) v -= 0.2;
    const r = RAMPA[k] ?? cav.armad;
    let idx = clamp(Math.round(v * (r.length - 1)), 0, r.length - 1);
    if (METAL.has(k) && lam * borda > 0.55) idx = r.length - 1;
    let c = r[idx];
    if (F > 0.4 && gr === 3 && borda > 0.6) { const fc = corFogo(0.45 + 0.2 * Math.sin(t * 6 + x * 0.3), x, y, cav.fogo); if (fc) { const m = 0.45 * F; c = [c[0] + (fc[0] - c[0]) * m, c[1] + (fc[1] - c[1]) * m, c[2] + (fc[2] - c[2]) * m]; } }
    put(i, c);
  }
  dest.cx.putImageData(img, 0, 0);
  return dest.cv;
}
