/**
 * tv.ts — Lobby C: o estúdio de um programa ao vivo. O telão de LED no fundo, a
 * treliça com os holofotes varrendo, a grua com a câmera, cada corredor no seu
 * pedestal de participante e a plateia nas poltronas da frente. A largada é a
 * contagem no telão, com chuva de papel picado.
 */
import { bicho, calmo, fichaPalpite, fileiras, fotoDoCorredor, marcaVoce, primeiroNome, rosto, semente, texto, type DesenhaTema, type Quadro } from './cena';
import { hashStr } from '../motor/bichinhos';

const SAI = '"Saira Condensed", Rubik, sans-serif';
const AMARELO = '#ffcc00', AZUL = '#0d1b4a', VERMELHO = '#e10600';
const LUZES = ['#ff3d7f', '#00d0ff', '#ffcc00', '#7d5cff', '#3dff9a'];

let confete: Array<[number, number, number, string]> | null = null;

const LED = { x: 110, y: 38, h: 230 };
/** Onde fica cada participante: num arco, em duas fileiras quando passa de 14. */
function pedestal(q: Quadro, i: number) {
  const { W, e } = q;
  const n = Math.max(1, e.corredores.length), duasFilas = n > 14, porFila = duasFilas ? Math.ceil(n / 2) : n;
  const fila = duasFilas && i >= porFila ? 1 : 0, j = fila ? i - porFila : i, m = fila ? n - porFila : porFila;
  const passo = Math.min(110, (W - 200) / m), cx = W / 2 + (j - (m - 1) / 2) * passo;
  const arco = Math.pow((cx - W / 2) / (W / 2), 2) * 26, base = (fila ? 336 : 414) - arco, r = Math.max(9, Math.min(fila ? 16 : 22, passo * 0.3));
  return { cx, base, r, passo, pw: r * 2.1, cor: LUZES[hashStr(e.corredores[i].id) % LUZES.length] };
}
// a plateia desceu um pouco (21/10/2026) para caber a foto embaixo do nome de quem corre
const filasPlateia = (W: number) => [0, 1, 2].map(k => ({ y: 464 + k * 28, x0: 30, x1: W - 30 }));
// A grade de pixels do telão: um ladrilho de 5×5 desenhado uma vez, repetido num retângulo só.
let pixels: CanvasPattern | null = null;
function grade(c: CanvasRenderingContext2D) {
  if (!pixels) { const t = document.createElement('canvas'); t.width = t.height = 5; const g = t.getContext('2d')!; g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, 0, 1, 5); g.fillRect(0, 0, 5, 1); pixels = c.createPattern(t, 'repeat'); }
  return pixels!;
}

function desenhaFundo(q: Quadro) {
  const { c, W, H, e } = q;
  const lx = LED.x, ly = LED.y, lw = W - 220, lh = LED.h;
  // o estúdio escuro
  c.fillStyle = '#05061a'; c.fillRect(-400, 0, W + 800, H);
  c.fillStyle = '#000'; c.fillRect(lx - 6, ly - 6, lw + 12, lh + 12);

  // a treliça
  c.strokeStyle = '#3a3f5c'; c.lineWidth = 2; c.strokeRect(-20, 4, W + 40, 18);
  c.beginPath(); for (let x = -20, k = 0; x < W + 20; x += 18, k++) { c.moveTo(x, k % 2 ? 4 : 22); c.lineTo(x + 18, k % 2 ? 22 : 4); } c.stroke();
  for (let i = 0; i < 6; i++) { const hx = W * (0.1 + i * 0.16); c.fillStyle = '#1b1e30'; c.beginPath(); c.roundRect(hx - 9, 18, 18, 14, 3); c.fill(); }

  // o palco brilhante, com a borda de LED
  const py = 290, pg = c.createLinearGradient(0, py, 0, 420); pg.addColorStop(0, '#16206a'); pg.addColorStop(1, '#080c2c');
  c.fillStyle = pg; c.fillRect(-400, py, W + 800, 140);
  c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 1;
  for (let x = -W; x < W * 2; x += 60) { c.beginPath(); c.moveTo(W / 2 + (x - W / 2) * 0.55, py); c.lineTo(x, 430); c.stroke(); }
  c.save(); c.shadowColor = AMARELO; c.shadowBlur = 14; c.fillStyle = AMARELO; c.fillRect(-400, 428, W + 800, 3); c.restore();

  e.corredores.forEach((p, i) => {
    const { cx, base, passo, pw } = pedestal(q, i);
    // o pedestal
    const cg = c.createLinearGradient(cx - pw / 2, 0, cx + pw / 2, 0); cg.addColorStop(0, '#2a3170'); cg.addColorStop(0.5, '#4a56b0'); cg.addColorStop(1, '#2a3170');
    c.fillStyle = cg; c.fillRect(cx - pw / 2, base - 26, pw, 26);
    c.save(); c.shadowColor = pedestal(q, i).cor; c.shadowBlur = 12; c.fillStyle = pedestal(q, i).cor; c.fillRect(cx - pw / 2, base - 4, pw, 3); c.restore();
    c.fillStyle = '#e8ecff'; c.beginPath(); c.ellipse(cx, base - 26, pw / 2, pw * 0.16, 0, 0, Math.PI * 2); c.fill();
    // a tarja com o nome
    c.font = `italic 700 ${Math.min(12, passo / 6)}px ${SAI}`; const nm = primeiroNome(p).toUpperCase().slice(0, 10), tw = c.measureText(nm).width;
    c.save(); c.translate(cx, base + 8); c.transform(1, 0, -0.2, 1, 0, 0);
    c.fillStyle = p.voce ? AMARELO : AZUL; c.fillRect(-tw / 2 - 6, -7, tw + 12, 14); c.fillStyle = p.voce ? VERMELHO : AMARELO; c.fillRect(-tw / 2 - 9, -7, 3, 14); c.restore();
    c.textAlign = 'center'; texto(c, nm, cx, base + 8.5, `italic 700 ${Math.min(12, passo / 6)}px ${SAI}`, p.voce ? AZUL : '#fff');
  });
  if (!e.corredores.length) { c.textAlign = 'center'; texto(c, 'OS PARTICIPANTES ESTÃO A CAMINHO DO PALCO', W / 2, 370, `italic 700 16px ${SAI}`, '#fff', AZUL, 4); }

  // as poltronas da plateia
  const filas = filasPlateia(W);
  filas.forEach(f => { c.fillStyle = '#3a0f1c'; for (let x = 30; x < W - 30; x += 30) { c.beginPath(); c.roundRect(x, f.y + 6, 26, 26, 6); c.fill(); } });
  c.textAlign = 'left';
}

function desenhaQuadro(q: Quadro) {
  const { c, W, t, e } = q;
  const lx = LED.x, ly = LED.y, lw = W - 220, lh = LED.h;
  const largada = q.falta != null && q.falta > 0 && q.falta < 4.6, ja = largada && q.falta! < 0.4;
  // o telão de LED, com cor que passeia
  const hue = (t * 12) % 360, gl = c.createLinearGradient(lx, ly, lx + lw, ly + lh);
  gl.addColorStop(0, `hsl(${hue},80%,32%)`); gl.addColorStop(0.5, `hsl(${(hue + 60) % 360},85%,24%)`); gl.addColorStop(1, `hsl(${(hue + 120) % 360},80%,30%)`);
  c.fillStyle = gl; c.fillRect(lx, ly, lw, lh);
  // ondas no telão
  c.save(); c.beginPath(); c.rect(lx, ly, lw, lh); c.clip();
  c.globalAlpha = 0.25; c.strokeStyle = '#fff'; c.lineWidth = 2;
  for (let k = 0; k < 4; k++) { c.beginPath(); for (let x = lx; x <= lx + lw; x += 12) { const y = ly + lh * (0.3 + k * 0.15) + Math.sin(x * 0.02 + t * (1 + k * 0.3)) * 18; if (x === lx) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); }
  c.globalAlpha = 1;
  c.textAlign = 'center';
  if (largada) {
    const nn = Math.ceil(q.falta! - 0.4), f = (q.falta! - 0.4) % 1, esc = ja ? 1 + (0.4 - q.falta!) : 1 + Math.max(0, f - 0.75) * 2;
    c.save(); c.translate(lx + lw / 2, ly + lh / 2 + 6); c.scale(esc, esc);
    texto(c, ja ? 'JÁ!' : String(nn), 0, 0, `italic 700 170px ${SAI}`, '#fff', AZUL, 10); c.restore();
  } else {
    texto(c, 'CORRIDA DA SORTE', lx + lw / 2, ly + lh * 0.42, `italic 700 ${Math.min(64, lw / 9)}px ${SAI}`, '#fff', 'rgba(0,0,0,.4)', 6);
    if (e.premio) {
      c.font = `700 20px ${SAI}`; const tx = `VALENDO ${e.premio.toUpperCase()}`, tw = c.measureText(tx).width;
      c.save(); c.translate(lx + lw / 2, ly + lh * 0.66); c.transform(1, 0, -0.2, 1, 0, 0);
      c.fillStyle = AMARELO; c.fillRect(-tw / 2 - 16, -15, tw + 32, 30); c.restore();
      texto(c, tx, lx + lw / 2, ly + lh * 0.66 + 1, `700 20px ${SAI}`, AZUL);
    }
  }
  // os pixels do LED
  c.fillStyle = grade(c); c.fillRect(lx, ly, lw, lh);
  c.restore();
  // as colunas de LED dos lados, como um equalizador
  for (const cx of [20, W - 92]) for (let k = 0; k < 6; k++) {
    const alt = calmo ? 0.5 : 0.3 + 0.7 * Math.abs(Math.sin(t * (2 + k * 0.7) + cx));
    for (let s = 0; s < Math.floor(alt * 16); s++) { c.fillStyle = LUZES[(k + s) % LUZES.length]; c.globalAlpha = 0.85; c.fillRect(cx + k * 12, 270 - s * 14, 9, 11); }
  }
  c.globalAlpha = 1;

  // os holofotes
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const hx = W * (0.1 + i * 0.16), a = Math.PI / 2 + (ja ? (W / 2 - hx) / -900 : Math.sin(t * 0.7 + i * 1.3) * 0.45), L = 470, cor = LUZES[i % LUZES.length];
    const gr = c.createLinearGradient(hx, 24, hx + Math.cos(a) * L, 24 + Math.sin(a) * L); gr.addColorStop(0, cor + '55'); gr.addColorStop(1, cor + '00');
    c.fillStyle = gr; c.beginPath(); c.moveTo(hx - 5, 26); c.lineTo(hx + Math.cos(a - 0.12) * L, 24 + Math.sin(a - 0.12) * L); c.lineTo(hx + Math.cos(a + 0.12) * L, 24 + Math.sin(a + 0.12) * L); c.lineTo(hx + 5, 26); c.fill();
  }
  c.restore();

  // a grua com a câmera
  const ta = calmo ? 0 : Math.sin(t * 0.4) * 0.12;
  c.save(); c.translate(40, 430); c.rotate(-0.95 + ta);
  c.fillStyle = '#2a2e44'; c.fillRect(0, -3, 150, 6); c.restore();
  const camx = 40 + Math.cos(-0.95 + ta) * 150, camy = 430 + Math.sin(-0.95 + ta) * 150;
  c.fillStyle = '#1b1e30'; c.beginPath(); c.roundRect(camx - 12, camy - 9, 26, 18, 3); c.fill();
  c.fillStyle = `rgba(255,30,30,${0.5 + 0.5 * Math.sin(t * 6)})`; c.beginPath(); c.arc(camx + 8, camy - 4, 2.5, 0, Math.PI * 2); c.fill();

  e.corredores.forEach((p, i) => {
    const { cx, base, r, passo } = pedestal(q, i);
    const by = base - 26 - r * 0.95, pulo = ja && !calmo ? Math.abs(Math.sin(t * 14 + i)) * 6 : 0;
    bicho(c, cx, by, r, p, t, { pulo, feliz: e.palpite.meu === p.id || ja });
    fotoDoCorredor(c, cx, base + 26, Math.min(9, passo * 0.18), p, p.voce ? AMARELO : '#fff');
    q.alvo(p, cx, by, r);
    fichaPalpite(c, q, p, cx, by - r * 1.35, r, VERMELHO);
    if (p.voce) { q.souEu(cx, by - r); marcaVoce(c, cx, by - r * 1.4 - (e.palpite.ativo ? 18 : 0), t, AMARELO, AZUL); }
  });

  // a plateia
  const filas = filasPlateia(W);
  const lugares = fileiras(e.plateia.length, filas, 30, 15);
  e.plateia.forEach((p, i) => {
    const l = lugares[i]; if (!l) return;
    const desde = p.entrou != null ? q.agora - p.entrou : 9, s = calmo ? 1 : Math.min(1, desde / 0.4);
    const pula = ja && !calmo ? Math.abs(Math.sin(t * 10 + i)) * 4 : 0;
    c.fillStyle = '#0c0e1e'; c.beginPath(); c.ellipse(l.x, l.y + l.r * 1.25, l.r * 1.1, l.r * 0.7, 0, Math.PI, 0); c.fill();
    rosto(c, l.x, l.y - pula, l.r * s, p, p.voce ? AMARELO : undefined);
    if (p.voce) { q.souEu(l.x, l.y - l.r); marcaVoce(c, l.x, l.y - l.r - pula, t, AMARELO, AZUL); } else q.lugar(l.x, l.y - l.r);
  });

  // o selo do canal e o relógio
  c.textAlign = 'left';
  c.fillStyle = '#fff'; c.beginPath(); c.roundRect(16, 36, 58, 30, 4); c.fill();
  texto(c, 'CDS', 24, 52, `italic 700 20px ${SAI}`, AZUL);
  c.fillStyle = VERMELHO; c.fillRect(16, 68, 58, 15);
  texto(c, '● AO VIVO', 21, 76, `700 10px ${SAI}`, '#fff');
  if (e.palpite.ativo && !e.palpite.meu && !largada) {
    c.textAlign = 'center'; c.globalAlpha = 0.7 + 0.3 * Math.sin(t * 3);
    c.save(); c.translate(W / 2, ly + lh - 22); c.transform(1, 0, -0.2, 1, 0, 0); c.fillStyle = VERMELHO; c.fillRect(-150, -11, 300, 22); c.restore();
    texto(c, 'ENQUETE: TOQUE EM QUEM VAI GANHAR', W / 2, ly + lh - 21, `italic 700 13px ${SAI}`, '#fff');
    c.globalAlpha = 1;
  }

  // papel picado na largada
  if (ja && !calmo) {
    if (!confete) { const r = semente(77); confete = Array.from({ length: 140 }, () => [r() * W, -r() * 300, 0.5 + r(), LUZES[Math.floor(r() * LUZES.length)]]); }
    const d = 0.4 - q.falta!;
    for (const [x, y0, v, cor] of confete) { c.fillStyle = cor; c.fillRect(x + Math.sin(t * 5 + x) * 8, y0 + d * 900 * v, 5, 8); }
  } else confete = null;
  c.textAlign = 'left';
}

export const desenhaTV: DesenhaTema = {
  chave: q => [q.e.premio, ...q.e.corredores.map(p => p.id + (p.voce ? '*' : ''))].join('|'),
  fundo: desenhaFundo,
  quadro: desenhaQuadro,
};
