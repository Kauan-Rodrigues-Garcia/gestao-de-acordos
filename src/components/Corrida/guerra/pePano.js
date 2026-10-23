/*
 * O Pé de Pano caído (Guerra na Corrida, 23/10/2026): o amigo que o último
 * cavalo chora no luto, antes da raiva. Pelas imagens de referência do
 * pedido: cavalo de desenho branco, crina e rabo pretos, as patas de pano preto
 * (com a costura e a franja), o olho azul e o focinho grande. Aqui ele está
 * deitado de lado, de olho fechado em X e a língua de fora — morto de desenho,
 * não de filme de terror.
 *
 * Mesmo jeito do Cavalo da Guerra (`cavaloDaGuerra.js`): as formas pintam uma
 * grade de material; cada material tem a sua rampa de tons; a luz vem de cima
 * e da esquerda; o contorno é escuro por fora (sel-out). Desenhado uma vez e
 * guardado.
 */
const PW = 70, PH = 34;
/** Onde ele encosta no chão (a linha de baixo do corpo, dentro do quadro). */
export const PE_PANO_CHAO = 29;
export const PE_PANO_W = PW, PE_PANO_H = PH;

const M = { CORPO: 1, LONGE: 2, CRINA: 3, PANO: 4, FOCINHO: 5, NARINA: 6, OLHO: 7, LINGUA: 8, ORELHA: 9, COSTURA: 10 };
const RAMPAS = {
  [M.CORPO]: ['#ffffff', '#f2f4f8', '#dde2ea', '#b9c1cf'],
  [M.LONGE]: ['#d7dce6', '#c5ccd8', '#aeb6c6', '#959eb2'],
  [M.CRINA]: ['#4a4a5c', '#2c2c38', '#1b1b24', '#121218'],
  [M.PANO]: ['#3a3a48', '#26262f', '#1a1a21', '#111116'],
  [M.FOCINHO]: ['#fff3ec', '#f6dfd4', '#e8c6b8', '#cfa597'],
  [M.ORELHA]: ['#ffd9d0', '#f5bfb3', '#e0a092', '#c07f72'],
};
const CONTORNO = '#16121e';

let PRONTO = null;
/** O Pé de Pano deitado: um canvas PW × PH, a cabeça para a direita. */
export function pePanoCaido() {
  if (PRONTO) return PRONTO;
  const g = new Uint8Array(PW * PH);
  const pinta = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < PW && y < PH) g[y * PW + x] = c; };
  const disco = (cx, cy, r, c) => { for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.3) pinta(x, y, c); };
  const elipse = (cx, cy, rx, ry, c) => { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.05) pinta(x, y, c); };
  const traco = (x0, y0, x1, y1, r0, r1, c) => { const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)); for (let i = 0; i <= n; i++) { const t = i / n; disco(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t, c); } };

  // as pernas do lado de lá (mais escuras), esticadas para trás e para a frente
  traco(22, 22, 13, 26, 2.4, 1.5, M.LONGE); traco(13, 26, 8, 27.5, 1.9, 2.1, M.PANO);
  traco(41, 22, 50, 25.5, 2.0, 1.4, M.LONGE); traco(50, 25.5, 54, 26.5, 1.8, 2.0, M.PANO);
  // o rabo, largado no chão
  for (let j = 0; j <= 14; j++) { const t = j / 14; disco(12 - 10 * t, 16 + 9 * t - 3 * t * t + Math.sin(t * 5) * 0.8, 2.4 - 1.1 * t, M.CRINA); }
  disco(2.5, 23.5, 1.6, M.CRINA); disco(1.5, 21.5, 1.2, M.CRINA);
  // o corpo: barriga redonda de desenho
  elipse(30, 18, 15, 7.5, M.CORPO); disco(18, 17.5, 7.2, M.CORPO); disco(41, 18, 6.2, M.CORPO);
  // o pescoço e a cabeça, deitados para a frente
  traco(43, 16, 52, 20, 5, 4, M.CORPO);
  elipse(55.5, 21, 5.6, 4.6, M.CORPO);
  // o focinho GRANDE (é a cara dele)
  elipse(62.5, 23.5, 5.8, 4.6, M.FOCINHO);
  // a orelha caída
  traco(51.5, 17, 48, 13.5, 1.8, 1, M.CORPO); traco(51, 16.5, 48.7, 14.2, 0.8, 0.5, M.ORELHA);
  // a crina preta, em mechas
  traco(36, 11.5, 50, 16.2, 2.2, 1.7, M.CRINA);
  for (let j = 0; j < 6; j++) { const t = j / 5; disco(36 + 14 * t + Math.sin(j * 1.7) * 0.6, 10.5 + 4.6 * t - (j % 2), 1.7, M.CRINA); }
  disco(53, 16.5, 1.9, M.CRINA); disco(55, 16.6, 1.4, M.CRINA);   // o topete
  // as pernas do lado de cá, com as patas de pano
  traco(20, 23, 12, 28.5, 2.8, 1.6, M.CORPO); traco(12, 28.5, 6.5, 29.5, 2.1, 2.3, M.PANO);
  traco(39, 23.5, 47, 28.5, 2.4, 1.5, M.CORPO); traco(47, 28.5, 52.5, 29.5, 2.0, 2.2, M.PANO);
  // a costura do pano (os pontinhos claros) e a franja na ponta
  for (const [x0, y0, x1, y1] of [[11, 28, 7, 29], [46.5, 28, 51.5, 29]]) for (let k = 0; k <= 4; k++) { const t = k / 4, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t); if (k % 2 === 0 && g[y * PW + x] === M.PANO) g[y * PW + x] = M.COSTURA; }
  for (const [x, y] of [[4, 29], [4, 31], [3, 30], [54, 29], [54, 31], [55, 30], [6, 31], [52, 31]]) pinta(x, y, M.PANO);
  // a cara: o olho fechado em X, a narina, a boca e a língua de fora
  for (const [dx, dy] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) pinta(56 + dx, 19.5 + dy, M.OLHO);
  pinta(65, 22, M.NARINA); pinta(66, 22, M.NARINA); pinta(65, 21, M.NARINA);
  for (let x = 59; x <= 66; x++) pinta(x, 26, M.NARINA);
  pinta(63, 27, M.LINGUA); pinta(64, 27, M.LINGUA); pinta(64, 28, M.LINGUA); pinta(63, 28, M.LINGUA); pinta(65, 27, M.LINGUA);

  // A luz: de cima e da esquerda. O tom sai da distância até a borda (o relevo) e do lado da luz.
  const dentro = (x, y) => x >= 0 && y >= 0 && x < PW && y < PH && g[y * PW + x] !== 0;
  const mesmo = (x, y, c) => x >= 0 && y >= 0 && x < PW && y < PH && (g[y * PW + x] === c || (c === M.PANO && g[y * PW + x] === M.COSTURA));
  const [cv, cx] = (() => { const c = document.createElement('canvas'); c.width = PW; c.height = PH; return [c, c.getContext('2d')]; })();
  const img = cx.createImageData(PW, PH), d = img.data;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const c = g[y * PW + x]; let cor = null;
    if (!c) { if (dentro(x - 1, y) || dentro(x + 1, y) || dentro(x, y - 1) || dentro(x, y + 1)) cor = CONTORNO; }
    else if (c === M.OLHO || c === M.NARINA) cor = '#1b1626';
    else if (c === M.LINGUA) cor = y === 27 ? '#f07a8a' : '#d4546a';
    else if (c === M.COSTURA) cor = '#8a8aa0';
    else {
      const base = c === M.CORPO || c === M.LONGE ? c : c;
      const r = RAMPAS[base], acima = !mesmo(x, y - 1, c), abaixo = !mesmo(x, y + 1, c), esq = !mesmo(x - 1, y, c), dir = !mesmo(x + 1, y, c);
      let k = 1;
      if (acima || (esq && !abaixo)) k = 0;
      else if (abaixo) k = 3;
      else if (dir || !mesmo(x, y + 2, c)) k = 2;
      // a barriga fica na sombra
      if (c === M.CORPO && y >= 22 && k < 2) k = 2;
      cor = r[k];
    }
    if (cor) { const [rr, gg, bb] = hex(cor), o = (y * PW + x) * 4; d[o] = rr; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = 255; }
  }
  // o brilho no focinho (é desenho animado)
  for (const [x, y] of [[60, 21], [61, 21], [60, 22]]) { const o = (y * PW + x) * 4; if (d[o + 3]) { d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; } }
  cx.putImageData(img, 0, 0);
  PRONTO = cv;
  return cv;
}
