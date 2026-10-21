/**
 * hipodromo.ts — Lobby B: uma tarde de páreo no Jockey. Céu de fim de tarde,
 * a tribuna clássica com toldo listrado e bandeiras, o gramado com flores, a
 * cerca branca e cada corredor no seu portão de largada. A largada é o sino e
 * os portões abrindo.
 */
import { bicho, calmo, fichaPalpite, fileiras, fotoDoCorredor, marcaVoce, primeiroNome, rosto, semente, texto, type DesenhaTema, type Quadro } from './cena';
import { hashStr } from '../motor/bichinhos';

const CIN = '"Cinzel Decorative", Georgia, serif';
const SER = 'Georgia, "Times New Roman", serif';
const VERDE = '#1f5b3e', OURO = '#c9a646', CREME = '#f3e9cf';

let fundo: { W: number; nuvens: Array<[number, number, number]>; flores: Array<[number, number, string]>; arvores: Array<[number, number]> } | null = null;
function monta(W: number) {
  const r = semente(1907);
  fundo = {
    W,
    nuvens: Array.from({ length: 6 }, () => [r() * (W + 300), 30 + r() * 90, 0.6 + r() * 0.8]),
    flores: Array.from({ length: Math.round(W / 9) }, () => [r() * W, 312 + r() * 18, ['#e8434f', '#ffd447', '#ffffff', '#ff8fb1'][Math.floor(r() * 4)]]),
    arvores: Array.from({ length: Math.round(W / 26) }, (_, i) => [i * 26 + r() * 10, 16 + r() * 14]),
  };
}

/** Um chapéu para alguns da tribuna (cartola, chapéu de aba ou nada). */
function chapeu(c: CanvasRenderingContext2D, x: number, y: number, r: number, id: string) {
  const k = hashStr(id) % 6;
  if (k === 0) { c.fillStyle = '#1b1b1f'; c.fillRect(x - r * 0.95, y - r * 0.85, r * 1.9, r * 0.22); c.fillRect(x - r * 0.6, y - r * 1.75, r * 1.2, r * 0.95); c.fillStyle = '#8b1e2b'; c.fillRect(x - r * 0.6, y - r * 1.02, r * 1.2, r * 0.18); }
  else if (k === 1) { c.fillStyle = '#f2b6c6'; c.beginPath(); c.ellipse(x, y - r * 0.8, r * 1.5, r * 0.32, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(x, y - r * 1.0, r * 0.75, r * 0.5, 0, Math.PI, 0); c.fill(); c.fillStyle = '#ff6f91'; c.beginPath(); c.arc(x + r * 0.6, y - r * 1.05, r * 0.25, 0, Math.PI * 2); c.fill(); }
}

/** Onde fica cada coisa (o fundo e o quadro usam a mesma conta). */
function geometria(q: Quadro) {
  const { W, e } = q, tx0 = 24, tx1 = W - 24, toldo = 108;
  const filas = [0, 1, 2, 3].map(k => ({ y: toldo + 60 + k * 40, x0: tx0 + 20, x1: tx1 - 20 }));
  const n = Math.max(1, e.corredores.length), sw = Math.min(92, (W - 70) / n), x0 = W / 2 - (sw * n) / 2 - 10, gy = 382, r = Math.max(9, Math.min(24, sw * 0.32));
  return { tx0, tx1, toldo, filas, n, sw, x0, gy, r };
}

function desenhaFundo(q: Quadro) {
  const { c, W, H, e } = q;
  if (!fundo || fundo.W !== W) monta(W);
  const { tx0, tx1, toldo, filas, n, sw, x0, gy } = geometria(q);
  // o céu de fim de tarde, o sol e as nuvens
  const g = c.createLinearGradient(0, 0, 0, 260); g.addColorStop(0, '#8ec9ee'); g.addColorStop(0.7, '#f7d7a8'); g.addColorStop(1, '#f2b77e');
  c.fillStyle = g; c.fillRect(-400, 0, W + 800, 270);
  const sol = c.createRadialGradient(W * 0.84, 170, 8, W * 0.84, 170, 140); sol.addColorStop(0, 'rgba(255,240,200,.95)'); sol.addColorStop(0.15, 'rgba(255,220,150,.6)'); sol.addColorStop(1, 'rgba(255,220,150,0)');
  c.fillStyle = sol; c.fillRect(W * 0.84 - 140, 30, 280, 280);
  for (const [nx, y, s] of fundo!.nuvens) {
    const x = (nx % (W + 300)) - 150;
    c.fillStyle = 'rgba(255,255,255,.75)';
    for (const [dx, dy, rr] of [[0, 0, 22], [22, -8, 26], [46, 0, 20], [24, 6, 22]]) { c.beginPath(); c.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2); c.fill(); }
  }
  // morros e a fileira de árvores
  c.fillStyle = '#86a77c'; c.beginPath(); c.moveTo(-400, 250); for (let x = -400; x <= W + 400; x += 40) c.lineTo(x, 236 + Math.sin(x * 0.012) * 10); c.lineTo(W + 400, 270); c.lineTo(-400, 270); c.fill();
  for (const [x, rr] of fundo!.arvores) { c.fillStyle = '#4c7a4a'; c.beginPath(); c.arc(x, 262 - rr * 0.6, rr * 0.7, 0, Math.PI * 2); c.fill(); }

  // a tribuna: bandeiras, frontão, toldo listrado, colunas e os bancos
  for (let x = tx0 + 40; x < tx1; x += 120) { c.fillStyle = '#e8e2d0'; c.fillRect(x, toldo - 58, 2.5, 58); }
  c.fillStyle = CREME; c.beginPath(); c.moveTo(W / 2 - 150, toldo - 8); c.lineTo(W / 2, toldo - 52); c.lineTo(W / 2 + 150, toldo - 8); c.fill();
  c.strokeStyle = OURO; c.lineWidth = 2; c.stroke();
  c.textAlign = 'center'; texto(c, 'JOCKEY DA SORTE', W / 2, toldo - 22, `700 13px ${CIN}`, '#7a5a12');
  c.fillStyle = '#e9dcbb'; c.fillRect(tx0, toldo + 22, tx1 - tx0, 190);
  for (let x = tx0, k = 0; x < tx1; x += 26, k++) { c.fillStyle = k % 2 ? CREME : VERDE; c.fillRect(x, toldo - 8, Math.min(26, tx1 - x), 30); c.beginPath(); c.arc(x + 13, toldo + 22, 13, 0, Math.PI); c.fill(); }
  c.fillStyle = 'rgba(80,60,20,.18)'; c.fillRect(tx0, toldo + 22, tx1 - tx0, 12);
  for (let x = tx0 + 10; x < tx1; x += 140) { const cg = c.createLinearGradient(x, 0, x + 12, 0); cg.addColorStop(0, '#fffaf0'); cg.addColorStop(1, '#d8cba6'); c.fillStyle = cg; c.fillRect(x, toldo + 34, 12, 178); }
  filas.forEach((f, k) => {
    for (let x = tx0 + 24 + (k % 2) * 14; x < tx1 - 14; x += 28) { c.fillStyle = '#2f6b4c'; c.beginPath(); c.roundRect(x - 10, f.y - 6, 20, 18, [6, 6, 2, 2]); c.fill(); }
    c.fillStyle = '#8a5a32'; c.fillRect(tx0, f.y + 12, tx1 - tx0, 5); c.fillStyle = '#6b4424'; c.fillRect(tx0, f.y + 17, tx1 - tx0, 2);
  });
  c.fillStyle = '#d6c79f'; c.fillRect(tx0, toldo + 210, tx1 - tx0, 6);

  // o gramado com flores e a cerca branca
  c.fillStyle = '#5c9a48'; c.fillRect(-400, 310, W + 800, 30);
  for (const [x, y, cor] of fundo!.flores) { c.fillStyle = cor; c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill(); }
  // a pista de grama, com as faixas do corte
  for (let y = 340, k = 0; y < H; y += 18, k++) { c.fillStyle = k % 2 ? '#3f8a3c' : '#479640'; c.fillRect(-400, y, W + 800, 18); }
  c.fillStyle = '#ffffff'; c.fillRect(-400, 336, W + 800, 4); c.fillRect(-400, 346, W + 800, 3);
  for (let x = 0; x < W; x += 34) c.fillRect(x, 334, 3, 22);

  // os portões de largada
  c.fillStyle = VERDE; c.fillRect(x0 - 8, gy - 16, sw * n + 16, 18);
  c.fillStyle = OURO; c.fillRect(x0 - 8, gy + 1, sw * n + 16, 2);
  e.corredores.forEach((p, i) => {
    const x = x0 + i * sw, cx = x + sw / 2;
    // a placa com o número
    c.fillStyle = OURO; c.beginPath(); c.arc(cx, gy - 7, 7.5, 0, Math.PI * 2); c.fill();
    c.textAlign = 'center'; texto(c, String(i + 1), cx, gy - 6.5, `700 9px ${SER}`, VERDE);
    // o box
    c.fillStyle = 'rgba(20,50,30,.25)'; c.fillRect(x + 2, gy + 3, sw - 4, 104);
    c.fillStyle = '#f7f7f2'; c.fillRect(x, gy + 3, 3, 104); if (i === n - 1) c.fillRect(x + sw - 3, gy + 3, 3, 104);
    // o nome, num cartãozinho creme
    c.font = `italic 700 ${Math.min(12, sw / 5.5)}px ${SER}`; const nm = primeiroNome(p).slice(0, 10), tw = c.measureText(nm).width;
    c.fillStyle = p.voce ? OURO : CREME; c.fillRect(cx - tw / 2 - 6, gy + 112, tw + 12, 17); c.strokeStyle = OURO; c.lineWidth = 1; c.strokeRect(cx - tw / 2 - 6, gy + 112, tw + 12, 17);
    c.fillStyle = '#2b2416'; c.fillText(nm, cx, gy + 121);
  });
  if (!e.corredores.length) { c.textAlign = 'center'; texto(c, 'Os competidores estão chegando aos portões…', W / 2, gy + 60, `italic 16px ${SER}`, '#fff', 'rgba(0,0,0,.35)', 3); }

  c.fillStyle = '#e8e2d0'; c.fillRect(W - 34 - 2, 300, 4, 90);

  // a placa do título e a roseta do prêmio
  c.textAlign = 'left';
  c.fillStyle = 'rgba(243,233,207,.95)'; c.beginPath(); c.roundRect(14, 10, 232, 50, 8); c.fill(); c.strokeStyle = OURO; c.lineWidth = 2.5; c.stroke();
  c.strokeStyle = 'rgba(201,166,70,.5)'; c.lineWidth = 1; c.beginPath(); c.roundRect(19, 15, 222, 40, 5); c.stroke();
  c.textAlign = 'center'; texto(c, 'Corrida da Sorte', 130, 31, `700 17px ${CIN}`, VERDE);
  texto(c, 'Grande Prêmio do Jockey', 130, 48, `italic 11px ${SER}`, '#7a5a12');
  if (e.premio) {
    const rx = W - 58, ry = 46;
    for (const [dx, cor] of [[-9, '#b3242f'], [9, '#8b1e2b']] as const) { c.fillStyle = cor; c.beginPath(); c.moveTo(rx + dx - 7, ry + 10); c.lineTo(rx + dx + 7, ry + 10); c.lineTo(rx + dx + 9, ry + 52); c.lineTo(rx + dx, ry + 44); c.lineTo(rx + dx - 9, ry + 52); c.fill(); }
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; c.fillStyle = k % 2 ? '#b3242f' : OURO; c.beginPath(); c.arc(rx + Math.cos(a) * 30, ry + Math.sin(a) * 30, 8, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = CREME; c.beginPath(); c.arc(rx, ry, 28, 0, Math.PI * 2); c.fill(); c.strokeStyle = OURO; c.lineWidth = 2; c.stroke();
    texto(c, 'PRÊMIO', rx, ry - 9, `700 8px ${CIN}`, '#7a5a12');
    texto(c, e.premio, rx, ry + 7, `700 ${e.premio.length > 6 ? 11 : 14}px ${SER}`, VERDE);
  }
  c.textAlign = 'left';
}

function desenhaQuadro(q: Quadro) {
  const { c, W, t, e } = q;
  const { tx0, tx1, toldo, filas, sw, x0, gy, r } = geometria(q);
  const largada = q.falta != null && q.falta > 0 && q.falta < 4.6, abre = largada && q.falta! < 0.4;

  // as bandeiras tremulando
  for (let x = tx0 + 40; x < tx1; x += 120) {
    const cor = ['#b3242f', OURO, VERDE][Math.floor(x / 120) % 3], ond = calmo ? 0 : Math.sin(t * 3 + x) * 3;
    c.fillStyle = cor; c.beginPath(); c.moveTo(x + 2.5, toldo - 58); c.quadraticCurveTo(x + 14, toldo - 58 + ond, x + 28, toldo - 54 + ond); c.lineTo(x + 28, toldo - 40 + ond); c.quadraticCurveTo(x + 14, toldo - 44 - ond, x + 2.5, toldo - 42); c.fill();
  }
  const lugares = fileiras(e.plateia.length, filas, 28, 14);
  e.plateia.forEach((p, i) => {
    const l = lugares[i]; if (!l) return;
    const desde = p.entrou != null ? q.agora - p.entrou : 9, s = calmo ? 1 : Math.min(1, desde / 0.4);
    const aceno = !calmo && (hashStr(p.id) + Math.floor(t)) % 13 === 0;
    c.fillStyle = ['#2d3a5c', '#5c2d3a', '#3a5c2d', '#4a4a4a'][hashStr(p.id) % 4]; c.beginPath(); c.ellipse(l.x, l.y + l.r * 1.25, l.r * 1.0, l.r * 0.65, 0, Math.PI, 0); c.fill();
    if (aceno) { c.strokeStyle = '#f0c9a0'; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(l.x + l.r * 0.8, l.y + l.r * 0.8); c.lineTo(l.x + l.r * 1.4 + Math.sin(t * 12) * 3, l.y - l.r * 0.6); c.stroke(); }
    rosto(c, l.x, l.y, l.r * s, p, p.voce ? '#c9a646' : '#fff8e6');
    chapeu(c, l.x, l.y, l.r * s, p.id);
    if (p.voce) { q.souEu(l.x, l.y - l.r); marcaVoce(c, l.x, l.y - l.r * 1.6, t, OURO, '#1f1405'); } else q.lugar(l.x, l.y - l.r);
  });

  e.corredores.forEach((p, i) => {
    const x = x0 + i * sw, cx = x + sw / 2;
    const by = gy + 76, pulo = largada && !calmo ? Math.abs(Math.sin(t * 9 + i)) * 3 : 0;
    bicho(c, cx, by, r, p, t, { pulo, feliz: e.palpite.meu === p.id || abre });
    fotoDoCorredor(c, cx, gy + 143, Math.min(11, sw * 0.2), p, p.voce ? OURO : CREME);
    q.alvo(p, cx, by, r);
    // as portas da frente: grades que abrem na largada
    const ang = abre ? Math.min(1, (0.4 - q.falta!) / 0.25) * 1.3 : 0;
    for (const lado of [-1, 1]) {
      c.save(); c.translate(cx + lado * (sw / 2 - 3), gy + 30); c.scale(Math.cos(ang), 1);
      c.strokeStyle = '#f7f7f2'; c.lineWidth = 2;
      c.strokeRect(lado < 0 ? 0 : -(sw / 2 - 4), 0, sw / 2 - 4, 70);
      for (let k = 1; k < 4; k++) { const xx = (lado < 0 ? 0 : -(sw / 2 - 4)) + (k * (sw / 2 - 4)) / 4; c.beginPath(); c.moveTo(xx, 4); c.lineTo(xx, 66); c.stroke(); }
      c.restore();
    }
    fichaPalpite(c, q, p, cx, gy + 22, r, '#7a5a12');
    if (p.voce) { q.souEu(cx, by - r); marcaVoce(c, cx, gy - 18, t, OURO, '#1f1405'); }
  });

  // o sino da largada
  const sx = W - 34, sy = 300, bal = largada && q.falta! < 1.4 && !calmo ? Math.sin(t * 40) * 0.35 : 0;
  c.save(); c.translate(sx, sy); c.rotate(bal);
  const sg = c.createLinearGradient(-14, 0, 14, 0); sg.addColorStop(0, '#a8812a'); sg.addColorStop(0.5, '#ffe28a'); sg.addColorStop(1, '#a8812a');
  c.fillStyle = sg; c.beginPath(); c.moveTo(-6, 2); c.quadraticCurveTo(-8, 18, -15, 24); c.lineTo(15, 24); c.quadraticCurveTo(8, 18, 6, 2); c.closePath(); c.fill();
  c.restore();

  if (e.palpite.ativo && !e.palpite.meu && !largada) {
    c.globalAlpha = 0.7 + 0.3 * Math.sin(t * 3);
    texto(c, 'Toque num competidor para fazer sua aposta', W / 2, 322, `italic 700 13px ${SER}`, '#fff', 'rgba(20,40,25,.8)', 4);
    c.globalAlpha = 1;
  }

  // a contagem: números grandes no céu, e «E foram dados!» quando abrem os portões
  if (largada) {
    const nnum = Math.ceil(q.falta! - 0.4), txt = abre ? 'E foram dados!' : String(nnum), f = (q.falta! - 0.4) % 1, esc = abre ? 1 : 1 + Math.max(0, f - 0.7) * 1.5;
    c.save(); c.translate(W / 2, 200); c.scale(esc, esc);
    texto(c, txt, 0, 0, `700 ${abre ? 54 : 110}px ${CIN}`, '#ffe9a8', '#3b2a05', 8);
    c.restore();
  }
  c.textAlign = 'left';
}

export const desenhaHipodromo: DesenhaTema = {
  chave: q => [q.e.premio, ...q.e.corredores.map(p => p.id + (p.voce ? '*' : ''))].join('|'),
  fundo: desenhaFundo,
  quadro: desenhaQuadro,
};
