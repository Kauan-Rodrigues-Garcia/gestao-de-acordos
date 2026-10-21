/**
 * f1.ts — Lobby A: o pit lane numa noite de Grande Prêmio. A cidade em neon no
 * fundo, a arquibancada de aço com fileiras iluminadas, a tela de LED correndo,
 * e cada corredor na frente da sua garagem. A largada é o pórtico de 5 luzes.
 */
import { bicho, calmo, fichaPalpite, fileiras, fotoDoCorredor, marcaVoce, primeiroNome, rosto, semente, texto, type DesenhaTema, type Quadro } from './cena';
import { hashStr } from '../motor/bichinhos';

const ORB = '"Orbitron", "Saira Condensed", sans-serif';
const SAI = '"Saira Condensed", Rubik, sans-serif';
const EQUIPES = ['#ff1e2d', '#00e5ff', '#ffb000', '#7cff4f', '#ff4fd8', '#8a7dff', '#ff7a1a', '#ffffff'];
// Embaixo de cada box, de cima para baixo: o bichinho, a placa do nome e a foto de quem corre.
const BICHO_Y = 540 - 86, NOME_Y = 540 - 48, FOTO_Y = 540 - 19;

// A cidade não muda: prédios e janelas sorteados uma vez por largura.
let cidade: { W: number; predios: Array<{ x: number; w: number; h: number; jan: Array<[number, number, string]> }>; estrelas: Array<[number, number, number]> } | null = null;
function montaCidade(W: number) {
  const r = semente(2026), predios = [];
  for (let x = -20; x < W + 20;) {
    const w = 30 + r() * 70, h = 50 + r() * 140, jan: Array<[number, number, string]> = [];
    for (let jy = 8; jy < h - 6; jy += 11) for (let jx = 5; jx < w - 6; jx += 9) if (r() < 0.35) jan.push([jx, jy, r() < 0.8 ? '#ffd27a' : '#7df3ff']);
    predios.push({ x, w, h, jan }); x += w + 2 + r() * 6;
  }
  const estrelas: Array<[number, number, number]> = Array.from({ length: 70 }, () => [r() * W, r() * 150, r()]);
  cidade = { W, predios, estrelas };
}

/** Onde fica cada coisa (o fundo e o quadro usam a mesma conta). */
function geometria(q: Quadro) {
  const { W, e } = q, topo = 188, ly = topo + 140, gy = ly + 40, n = Math.max(1, e.corredores.length);
  const bw = Math.min(118, (W - 30) / n), x0 = W / 2 - (bw * n) / 2, r = Math.max(9, Math.min(26, bw * 0.3));
  const filas = [0, 1, 2, 3].map(k => ({ y: topo + 30 + k * 27, x0: 30, x1: W - 30 }));
  const pw = 5 * 34 + 16, px = W / 2 - pw / 2, py = 20;
  return { topo, ly, gy, bw, x0, r, filas, pw, px, py };
}

function fundo(q: Quadro) {
  const { c, W, H, e } = q;
  if (!cidade || cidade.W !== W) montaCidade(W);
  const { topo, ly, gy, bw, x0, filas, pw, px, py } = geometria(q);
  // céu
  const g = c.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, '#04040c'); g.addColorStop(1, '#1a0b26');
  c.fillStyle = g; c.fillRect(-400, 0, W + 800, H);
  for (const [x, y, b] of cidade!.estrelas) { c.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * b})`; c.fillRect(x, y, 1.5, 1.5); }
  // a cidade
  for (const p of cidade!.predios) {
    c.fillStyle = '#0b0a16'; c.fillRect(p.x, 250 - p.h, p.w, p.h);
    for (const [jx, jy, cor] of p.jan) { c.fillStyle = cor; c.globalAlpha = 0.55; c.fillRect(p.x + jx, 250 - p.h + jy, 4, 5); }
    c.globalAlpha = 1;
  }
  // a arquibancada de aço
  c.fillStyle = '#0d0f18'; c.fillRect(-400, topo, W + 800, 150);
  c.fillStyle = '#1c2133'; c.fillRect(-400, topo - 6, W + 800, 8);
  c.fillStyle = '#ff1e2d'; c.fillRect(-400, topo + 2, W + 800, 2);
  filas.forEach((f, k) => {
    c.fillStyle = k % 2 ? '#141a29' : '#111522'; c.fillRect(-400, f.y + 6, W + 800, 21);
    c.fillStyle = 'rgba(0,229,255,.35)'; c.fillRect(-400, f.y + 6, W + 800, 1.5);
    for (let x = 18 + (k % 2) * 13; x < W - 10; x += 26) { c.fillStyle = k % 2 ? '#3a1018' : '#0f2a3a'; c.beginPath(); c.roundRect(x - 9, f.y - 4, 18, 13, 3); c.fill(); }
  });
  // a tela de LED (o letreiro corre no quadro)
  c.fillStyle = '#05050a'; c.fillRect(-400, ly, W + 800, 18);
  // a grade de proteção
  c.strokeStyle = 'rgba(160,170,200,.12)'; c.lineWidth = 1;
  for (let x = -40; x < W + 40; x += 12) { c.beginPath(); c.moveTo(x, ly + 18); c.lineTo(x + 20, ly + 40); c.stroke(); c.beginPath(); c.moveTo(x + 20, ly + 18); c.lineTo(x, ly + 40); c.stroke(); }

  // o pit lane: as garagens e o asfalto
  const ga = c.createLinearGradient(0, gy, 0, H); ga.addColorStop(0, '#16181f'); ga.addColorStop(1, '#0c0d12');
  c.fillStyle = ga; c.fillRect(-400, gy, W + 800, H - gy);
  c.fillStyle = '#ffcc00'; for (let x = -20; x < W + 20; x += 26) c.fillRect(x, H - 7, 14, 3);
  e.corredores.forEach((p, i) => {
    const x = x0 + i * bw, cx = x + bw / 2, cor = EQUIPES[hashStr(p.id) % EQUIPES.length];
    // a garagem
    const gi = c.createLinearGradient(0, gy + 8, 0, gy + 80); gi.addColorStop(0, '#2a2f40'); gi.addColorStop(1, cor + '55');
    c.fillStyle = gi; c.fillRect(x + 3, gy + 8, bw - 6, 74);
    c.fillStyle = '#3a4058'; for (let k = 0; k < 4; k++) c.fillRect(x + 3, gy + 8 + k * 5, bw - 6, 3); // a porta de enrolar, lá em cima
    c.fillStyle = cor; c.fillRect(x + 3, gy + 80, bw - 6, 3);
    texto(c, String(i + 1).padStart(2, '0'), cx, gy + 38, `700 ${Math.min(16, bw * 0.3)}px ${ORB}`, 'rgba(255,255,255,.25)');
    // a marca do box no chão
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5; c.strokeRect(x + 6, gy + 92, bw - 12, NOME_Y - gy - 98);
    // o nome
    c.font = `700 ${Math.min(11, bw / 6)}px ${SAI}`; const nm = primeiroNome(p).toUpperCase().slice(0, 10), tw = c.measureText(nm).width;
    c.fillStyle = p.voce ? '#ffd84d' : '#0b0b10'; c.fillRect(cx - tw / 2 - 5, NOME_Y, tw + 10, 15);
    c.fillStyle = p.voce ? '#1b1405' : '#fff'; c.textAlign = 'center'; c.fillText(nm, cx, NOME_Y + 8);
  });
  c.textAlign = 'left';
  // o pórtico (as luzes acendem no quadro)
  c.fillStyle = '#151520'; c.fillRect(px - 30, py + 14, pw + 60, 6);
  c.fillStyle = '#0d0d14'; c.beginPath(); c.roundRect(px, py, pw, 40, 6); c.fill(); c.strokeStyle = '#2a2a3a'; c.stroke();
  // o título e o prêmio
  c.save(); c.shadowColor = '#ff1e2d'; c.shadowBlur = 12; c.textAlign = 'left'; texto(c, 'CORRIDA DA SORTE', 22, 30, `700 20px ${ORB}`, '#fff'); c.restore();
  c.textAlign = 'left'; texto(c, 'GRANDE PRÊMIO NOTURNO', 23, 52, `600 12px ${SAI}`, '#7df3ff');
  if (e.premio) {
    c.font = `700 13px ${ORB}`; const tx = `PRÊMIO ${e.premio.toUpperCase()}`, tw = c.measureText(tx).width;
    c.strokeStyle = '#00e5ff'; c.lineWidth = 1.5; c.fillStyle = 'rgba(0,229,255,.12)'; c.beginPath(); c.roundRect(W - tw - 42, 16, tw + 24, 26, 3); c.fill(); c.stroke();
    texto(c, tx, W - tw - 30, 30, `700 13px ${ORB}`, '#bdf8ff');
  }
}

function quadro(q: Quadro) {
  const { c, W, H, t, e } = q;
  const { topo, ly, bw, x0, r, filas, px, py } = geometria(q);
  const largada = q.falta != null && q.falta > 0 && q.falta < 4.6;
  // holofotes varrendo o céu
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const [x0, fase, cor] of [[W * 0.22, 0, '0,229,255'], [W * 0.78, 2, '255,30,45']] as const) {
    const a = -Math.PI / 2 + Math.sin(t * 0.35 + fase) * 0.55, L = 420;
    const gr = c.createLinearGradient(x0, 250, x0 + Math.cos(a) * L, 250 + Math.sin(a) * L); gr.addColorStop(0, `rgba(${cor},.22)`); gr.addColorStop(1, `rgba(${cor},0)`);
    c.fillStyle = gr; c.beginPath(); c.moveTo(x0, 250); c.lineTo(x0 + Math.cos(a - 0.07) * L, 250 + Math.sin(a - 0.07) * L); c.lineTo(x0 + Math.cos(a + 0.07) * L, 250 + Math.sin(a + 0.07) * L); c.fill();
  }
  c.restore();
  // o letreiro de neon no alto de um prédio
  const neon = calmo ? 1 : (Math.sin(t * 7) > -0.85 ? 1 : 0.3);
  c.save(); c.shadowColor = '#ff4fd8'; c.shadowBlur = 14 * neon; texto(c, 'NIGHT GP', W * 0.63, 92, `700 18px ${ORB}`, `rgba(255,79,216,${neon})`); c.restore();

  for (let x = 10; x < W; x += 34) { c.fillStyle = `rgba(255,248,224,${0.5 + 0.5 * Math.sin(t * 2 + x)})`; c.beginPath(); c.arc(x, topo + 5, 1.8, 0, Math.PI * 2); c.fill(); }
  const lugares = fileiras(e.plateia.length, filas, 26, 13);
  e.plateia.forEach((p, i) => {
    const l = lugares[i]; if (!l) return;
    const desde = p.entrou != null ? q.agora - p.entrou : 9, s = calmo ? 1 : Math.min(1, desde / 0.4);
    const pulo = calmo ? 0 : Math.max(0, Math.sin(t * 3 + i * 1.9)) * 2;
    c.fillStyle = '#05060c'; c.beginPath(); c.ellipse(l.x, l.y + l.r * 1.3, l.r * 1.05, l.r * 0.6, 0, Math.PI, 0); c.fill();
    rosto(c, l.x, l.y - pulo, l.r * s, p, p.voce ? '#ffd84d' : undefined);
    if (p.voce) { q.souEu(l.x, l.y - l.r); marcaVoce(c, l.x, l.y - l.r - pulo, t); } else q.lugar(l.x, l.y - l.r);
    // flash de câmera de vez em quando
    if (!calmo && (hashStr(p.id) + Math.floor(t * 2)) % 97 === 0) { c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(l.x + l.r, l.y - l.r, 3, 0, Math.PI * 2); c.fill(); }
  });

  // o letreiro correndo na tela de LED
  c.save(); c.beginPath(); c.rect(0, ly, W, 18); c.clip();
  const frase = `CORRIDA DA SORTE  ◆  ${e.premio ? `PRÊMIO ${e.premio.toUpperCase()}` : 'BOA SORTE'}  ◆  GRANDE PRÊMIO NOTURNO  ◆  `;
  c.font = `700 12px ${ORB}`; const fw = c.measureText(frase).width, off = calmo ? 0 : (t * 60) % fw;
  for (let x = -off; x < W; x += fw) texto(c, frase, x, ly + 9.5, `700 12px ${ORB}`, '#ff3b47');
  c.restore();
  e.corredores.forEach((p, i) => {
    const x = x0 + i * bw, cx = x + bw / 2, cor = EQUIPES[hashStr(p.id) % EQUIPES.length];
    // o bichinho, com fumacinha do escapamento
    const by = BICHO_Y, desde = q.agora - (p.entrou ?? q.agora - 9);
    if (!calmo) for (let k = 0; k < 3; k++) { const f = ((t * 1.4 + k / 3 + i * 0.37) % 1); c.fillStyle = `rgba(200,205,220,${0.25 * (1 - f)})`; c.beginPath(); c.arc(cx - r - f * 22, by + r * 0.5 - f * 8, 2 + f * 5, 0, Math.PI * 2); c.fill(); }
    const pulo = largada && !calmo ? Math.abs(Math.sin(t * 12 + i)) * 4 : 0;
    bicho(c, cx, by, r * (calmo ? 1 : Math.min(1, 0.4 + desde)), p, t, { pulo, feliz: e.palpite.meu === p.id });
    fotoDoCorredor(c, cx, FOTO_Y, Math.min(11, bw * 0.2), p, p.voce ? '#ffd84d' : cor);
    q.alvo(p, cx, by, r);
    fichaPalpite(c, q, p, cx, by - r * 1.45, r, cor);
    if (p.voce) { q.souEu(cx, by - r); marcaVoce(c, cx, by - r * 1.5 - (e.palpite.ativo ? 18 : 0), t); }
  });
  if (!e.corredores.length) texto(c, 'AS EQUIPES ESTÃO CHEGANDO AO BOX…', W / 2, H - 80, `700 14px ${ORB}`, 'rgba(255,255,255,.5)');
  c.textAlign = 'left';

  // o pórtico de 5 luzes: acendem 4 vermelhas, e na vez da 5ª as cinco ficam verdes até o GO (Cleber, 21/10/2026)
  const passo = !largada ? 0 : Math.floor((4.4 - q.falta!) / 0.8) + 1, verde = largada && passo >= 5, acesas = verde ? 5 : Math.max(0, passo);
  for (let i = 0; i < 5; i++) {
    const on = i < acesas, x = px + 8 + i * 34 + 17;
    c.save(); if (on) { c.shadowColor = verde ? '#1eff5a' : '#ff1e2d'; c.shadowBlur = 22; }
    c.fillStyle = on ? (verde ? '#2bff6a' : '#ff2a36') : `rgba(90,10,16,${0.6 + 0.3 * Math.sin(t * 2 - i * 0.6)})`; c.beginPath(); c.arc(x, py + 20, 12, 0, Math.PI * 2); c.fill(); c.restore();
  }
  if (e.palpite.ativo && !e.palpite.meu && !largada) {
    c.globalAlpha = 0.65 + 0.35 * Math.sin(t * 3); c.textAlign = 'center';
    texto(c, 'TOQUE NUM CORREDOR PARA APOSTAR NELE', W / 2, ly + 29, `700 12px ${ORB}`, '#00e5ff', '#000', 4);
    c.globalAlpha = 1; c.textAlign = 'left';
  }

  // GO!
  if (largada && q.falta! < 0.4) {
    c.fillStyle = `rgba(255,255,255,${(0.4 - q.falta!) * 1.2})`; c.fillRect(-400, 0, W + 800, H);
    c.textAlign = 'center'; c.save(); c.shadowColor = '#00e5ff'; c.shadowBlur = 30; texto(c, 'GO!', W / 2, H / 2, `700 120px ${ORB}`, '#fff'); c.restore(); c.textAlign = 'left';
  }
}

export const desenhaF1: DesenhaTema = {
  chave: q => [q.e.premio, ...q.e.corredores.map(p => p.id + (p.voce ? '*' : ''))].join('|'),
  fundo,
  quadro,
};
