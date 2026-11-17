// Trilha PROVISÓRIA do «Líderes que bateram o desafio» (WAV 44,1 kHz
// estéreo) em public/lideres93/trilha.wav. Composição própria gerada aqui, sem
// direito autoral. Para usar outra música, troque o arquivo (mesmo nome) ou a
// constante TRILHA em src/lideres93/VideoLideres93.tsx.
//
// Pop funk de premiação a 120 bpm em mi maior (E – B – C#m – A). Os efeitos
// caem nos mesmos quadros do vídeo: contagem do medidor, título batendo,
// whoosh de cada varredura, impacto + brilho no «ganhou» de cada líder, plim de
// cada foto do mosaico e o ta-dá do final. A linha do tempo vem de
// scripts/lideres93-linha.mjs (que também grava src/lideres93/linha.json).
//
//   node scripts/musica-lideres93.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lerVersao, montarLinha } from './lideres93-linha.mjs';

const RAIZ = path.resolve(import.meta.dirname, '..');
const PASTA = path.join(RAIZ, 'public', 'lideres93');
mkdirSync(PASTA, { recursive: true });

// versão: 'original' = trilha própria inteira; outra (uptown, cantstop…) = só os
// efeitos, sem nada com nota (para não desafinar), mixados por baixo da música.
const VERSAO = process.argv[2] ?? 'original';
const SO = VERSAO !== 'original';
const L = montarLinha(VERSAO);
const BATIDAS = L.total / L.B;
const q2s = (q) => q / L.fps;

const TAXA = 44100;
const BPM = L.bpm;
const BAT = 60 / BPM;
const SEG = BATIDAS * BAT;
const N = Math.ceil(SEG * TAXA);
const PI2 = Math.PI * 2;

// barramentos: bateria (sem sidechain), música (abaixa com o bumbo), efeitos, envio de reverb
const BAT_E = new Float32Array(N), BAT_D = new Float32Array(N);
const MUS_E = new Float32Array(N), MUS_D = new Float32Array(N);
const REV = new Float32Array(N);
const DUCK = new Float32Array(N).fill(1);

let semente = 2026;
const ruido = () => {
  semente = (semente * 1103515245 + 12345) & 0x7fffffff;
  return (semente / 0x7fffffff) * 2 - 1;
};
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const lpA = (fc) => 1 - Math.exp((-PI2 * fc) / TAXA);
const t2i = (t) => Math.floor(t * TAXA);

/** Soma `dur` segundos de `onda(t, k)` a partir de `ini` (s), com pan e envio de reverb. */
function somar(barr, ini, dur, ganho, onda, pan = 0, rev = 0) {
  const [E, D] = barr === 'bat' ? [BAT_E, BAT_D] : [MUS_E, MUS_D];
  const i0 = t2i(ini);
  const len = t2i(dur);
  const ge = ganho * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const gd = ganho * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  for (let k = 0; k < len; k++) {
    const i = i0 + k;
    if (i < 0 || i >= N) continue;
    const v = onda(k / TAXA, k);
    E[i] += v * ge;
    D[i] += v * gd;
    if (rev) REV[i] += v * ganho * rev;
  }
}

// ── bateria ────────────────────────────────────────────────────────────────
function bumbo(t, g = 1) {
  somar('bat', t, 0.45, 0.9 * g, (x) => {
    const fase = PI2 * (48 * x + (110 / 22) * (1 - Math.exp(-22 * x)));
    return Math.exp(-x * 7.5) * Math.sin(fase) + (x < 0.004 ? ruido() * 0.4 : 0);
  });
  // sidechain: a música abaixa e volta em ~180 ms
  const i0 = t2i(t);
  for (let k = 0; k < t2i(0.3); k++) {
    const i = i0 + k;
    if (i >= N) break;
    DUCK[i] = Math.min(DUCK[i], 1 - 0.55 * g * Math.exp(-(k / TAXA) / 0.09));
  }
}
function palmas(t, g = 1) {
  let lp = 0;
  somar('bat', t, 0.28, 0.32 * g, (x) => {
    const r = ruido();
    lp += 0.5 * (r - lp);
    const bp = r - lp;
    const env = (x < 0.01 ? 1 : x < 0.02 ? 0.6 : x < 0.03 ? 0.9 : 1) * Math.exp(-x * (x < 0.03 ? 40 : 14));
    return bp * env;
  }, 0.05, 0.35);
}
function chimbal(t, g = 0.5, aberto = false) {
  let ant = 0;
  somar('bat', t, aberto ? 0.3 : 0.06, 0.16 * g, (x) => {
    const r = ruido();
    const hp = r - ant;
    ant = r;
    return hp * Math.exp(-x * (aberto ? 9 : 75));
  }, 0.3);
}
function caixa(t, g = 1) {
  let lp = 0;
  somar('bat', t, 0.2, 0.3 * g, (x) => {
    lp += 0.35 * (ruido() - lp);
    return Math.exp(-x * 22) * (0.8 * lp * 2 + 0.4 * Math.sin(PI2 * 190 * x));
  }, -0.08, 0.25);
}
function prato(t, g = 1) {
  let ant = 0;
  somar('bat', t, 2.2, 0.22 * g, (x) => {
    const r = ruido();
    const hp = r - ant * 0.6;
    ant = r;
    return hp * Math.exp(-x * 2.1);
  }, 0, 0.4);
}

// ── instrumentos ───────────────────────────────────────────────────────────
function serra(f, x) {
  const p = (f * x) % 1;
  return 2 * p - 1;
}
function baixo(t, m, dur, g = 1) {
  if (SO) return;
  const f = hz(m);
  let y = 0;
  somar('mus', t, dur + 0.03, 0.34 * g, (x) => {
    const corte = 280 + 1400 * Math.exp(-x * 14);
    y += lpA(corte) * (serra(f, x) * 0.7 + Math.sin(PI2 * f * x) * 0.6 - y);
    const env = Math.min(1, x / 0.004) * Math.min(1, Math.max(0, (dur - x) / 0.03 + 1));
    return y * env * (x < dur ? 1 : 0);
  });
}
function acorde(t, notas, dur, g = 1, brilho = 2600) {
  if (SO) return;
  for (const m of notas) {
    for (const [desaf, pan] of [[-0.09, -0.55], [0.0, 0], [0.09, 0.55]]) {
      const f = hz(m) * (1 + desaf / 100 * 6);
      let y = 0;
      somar('mus', t, dur + 0.12, 0.05 * g, (x) => {
        const corte = 500 + brilho * Math.exp(-x * 9);
        y += lpA(corte) * (serra(f, x) - y);
        const env = Math.min(1, x / 0.005) * (x < dur ? Math.exp(-x * 2.5) : Math.exp(-dur * 2.5) * Math.max(0, 1 - (x - dur) / 0.12));
        return y * env;
      }, pan, 0.3);
    }
  }
}
function pad(t, notas, dur, g = 1) {
  if (SO) return;
  for (const m of notas) {
    for (const [desaf, pan] of [[-0.12, -0.8], [0.12, 0.8]]) {
      const f = hz(m) * (1 + desaf / 100 * 5);
      let y = 0;
      somar('mus', t, dur, 0.03 * g, (x) => {
        y += lpA(900) * (serra(f, x) - y);
        const env = Math.min(1, x / 0.35) * Math.min(1, Math.max(0, (dur - x) / 0.3));
        return y * env;
      }, pan, 0.5);
    }
  }
}
/** Corda dedilhada (Karplus-Strong): o «pluck» da melodia. */
function pluck(t, m, g = 1, pan = 0.15, decai = 0.996) {
  if (SO) return;
  const f = hz(m);
  const L = Math.max(2, Math.round(TAXA / f));
  const buf = new Float32Array(L);
  for (let i = 0; i < L; i++) buf[i] = ruido() * 0.9;
  let p = 0;
  somar('mus', t, 1.4, 0.32 * g, () => {
    const a = buf[p];
    const b = buf[(p + 1) % L];
    const v = decai * 0.5 * (a + b);
    buf[p] = v;
    p = (p + 1) % L;
    return a;
  }, pan, 0.45);
}
function sino(t, m, g = 1, pan = 0) {
  const f = hz(m);
  somar('mus', t, 2.2, 0.09 * g, (x) => Math.min(1, x / 0.002) * Math.exp(-x * 2.4) * (Math.sin(PI2 * f * x) + 0.35 * Math.sin(PI2 * 2.76 * f * x) * Math.exp(-x * 5) + 0.2 * Math.sin(PI2 * 5.4 * f * x) * Math.exp(-x * 9)), pan, 0.6);
}

// ── efeitos ────────────────────────────────────────────────────────────────
function bipe(t) {
  somar('bat', t, 0.16, 0.5, (x) => Math.sin(PI2 * 1000 * x) * Math.min(1, x / 0.003) * Math.min(1, (0.16 - x) / 0.01));
}
function projetor(t, dur) {
  let lp = 0;
  somar('bat', t, dur, 0.11, (x) => {
    lp += lpA(700) * (ruido() - lp);
    const clac = Math.pow(Math.max(0, Math.sin(PI2 * 24 * x)), 12);
    return lp * (0.5 + 0.5 * clac) * 2 + clac * ruido() * 0.3;
  }, 0);
}
function subida(t, dur, g = 1) {
  let y = 0, ant = 0;
  somar('bat', t, dur, 0.22 * g, (x) => {
    const u = x / dur;
    y += lpA(300 + 9000 * u * u) * (ruido() - y);
    const hp = y - ant * 0.3;
    ant = y;
    return hp * u * u;
  }, 0, 0.3);
}
function impacto(t, g = 1) {
  somar('bat', t, 1.4, 0.7 * g, (x) => Math.exp(-x * 3.2) * Math.sin(PI2 * (42 * x + 30 * (1 - Math.exp(-x * 10)) / 10)), 0, 0.2);
  prato(t, 0.9 * g);
}
function whoosh(t, dur = 0.38, g = 1, pan = 0) {
  let y = 0, y2 = 0;
  somar('bat', t, dur, 0.26 * g, (x) => {
    const u = x / dur;
    const fc = 300 + 3800 * Math.sin(Math.PI * u);
    const r = ruido();
    y += lpA(fc) * (r - y);
    y2 += lpA(fc * 0.35) * (r - y2);
    return (y - y2) * Math.sin(Math.PI * u) ** 2;
  }, pan, 0.25);
}
function claquete(t) {
  somar('bat', t, 0.12, 0.85, (x) => {
    const madeira = Math.sin(PI2 * 1650 * x) * Math.exp(-x * 60) + Math.sin(PI2 * 940 * x) * Math.exp(-x * 45);
    return (ruido() * Math.exp(-x * 120) * 0.8 + madeira * 0.7) * (x < 0.0015 ? x / 0.0015 : 1);
  }, 0, 0.35);
}
function obturador(t, g = 1) {
  for (const [d, a] of [[0, 1], [0.045, 0.7]]) {
    let ant = 0;
    somar('bat', t + d, 0.035, 0.32 * g * a, (x) => {
      const r = ruido();
      const hp = r - ant;
      ant = r;
      return hp * Math.exp(-x * 140);
    }, 0.2);
  }
}
function plim(t, g = 1) {
  somar('bat', t, 0.09, 0.22 * g, (x) => Math.sin(PI2 * (300 * x + 600 * (1 - Math.exp(-x * 60)) / 60)) * Math.exp(-x * 40), (ruido() * 0.6));
}
function caneta(t, dur) {
  let y = 0;
  somar('bat', t, dur, 0.12, (x) => {
    y += lpA(3200) * (ruido() - y);
    return y * (0.6 + 0.4 * Math.sin(PI2 * 28 * x)) * Math.sin((Math.PI * x) / dur);
  }, 0.1);
}

// ── harmonia e melodia ─────────────────────────────────────────────────────
// E – B – C#m – A, um acorde por compasso (4 batidas = 2 s)
const HARM = [
  { raiz: 40, notas: [64, 68, 71, 76] },
  { raiz: 35, notas: [63, 66, 71, 75] },
  { raiz: 37, notas: [64, 68, 73, 76] },
  { raiz: 33, notas: [64, 69, 73, 76] },
];
const MOTIVO = [
  [[0, 76], [0.5, 78], [1, 80], [1.5, 83], [2.5, 80], [3, 78]],
  [[0, 78], [0.5, 80], [1, 78], [1.5, 75], [2.5, 71]],
  [[0, 76], [0.5, 78], [1, 80], [1.5, 85], [2.5, 83], [3, 80]],
  [[0, 81], [0.5, 80], [1, 78], [1.5, 76], [2.5, 78], [3, 76]],
];

/** Um compasso do groove. `nivel`: 'cheio' | 'leve' | 'claquete'. */
function compasso(c, nivel, opc = {}) {
  if (SO) return;
  const t = c * 4 * BAT;
  const h = HARM[c % 4];
  const R = h.raiz;
  const cheio = nivel === 'cheio';
  const leve = nivel === 'leve';
  const claq = nivel === 'claquete';
  for (let b = 0; b < 4; b++) {
    const tb = t + b * BAT;
    if (cheio) bumbo(tb);
    else if (leve && (b === 0 || b === 2)) bumbo(tb, 0.55);
    else if (claq && b >= 2) bumbo(tb);
    if ((cheio || (claq && b >= 2)) && (b === 1 || b === 3)) palmas(tb);
    if (leve && (b === 1 || b === 3)) palmas(tb, 0.45);
    for (let k = 0; k < 2; k++) chimbal(tb + k * BAT / 2, k ? (cheio ? 0.75 : 0.45) : 0.3, cheio && k === 1 && b === 3);
    if (cheio) chimbal(tb + BAT * 0.75, 0.22);
  }
  if (opc.virada) for (let k = 0; k < 8; k++) caixa(t + 3 * BAT + (k * BAT) / 8, 0.35 + k * 0.08);
  const g = claq ? 0.85 : leve ? 0.7 : 1;
  if (claq) {
    baixo(t, R, BAT * 1.9, g);
  } else {
    baixo(t, R, BAT * 0.45, g);
    baixo(t + BAT * 0.75, R + 12, BAT * 0.2, g * 0.8);
    baixo(t + BAT * 1.5, R, BAT * 0.4, g);
  }
  baixo(t + BAT * 2, R, BAT * 0.45, g);
  baixo(t + BAT * 2.75, R + 7, BAT * 0.2, g * 0.8);
  baixo(t + BAT * 3.5, R + 12, BAT * 0.4, g);
  if (!leve) {
    for (const b of [0.5, 1.5, 2.5, 3.25]) acorde(t + b * BAT, h.notas, BAT * 0.22, claq && b < 2 ? 0.5 : 0.9);
  } else {
    acorde(t, h.notas, BAT * 3.5, 0.45, 900);
  }
  pad(t, h.notas.slice(0, 3), 4 * BAT, leve ? 1.4 : 0.8);
  if (opc.melodia) for (const [b, m] of MOTIVO[c % 4]) pluck(t + b * BAT, m, opc.melodia);
  if (opc.arpejo) {
    const arp = [h.notas[0] + 12, h.notas[1] + 12, h.notas[2] + 12, h.notas[1] + 12];
    for (let k = 0; k < 16; k++) pluck(t + (k * BAT) / 4, arp[k % 4], 0.38 * opc.arpejo, k % 2 ? 0.45 : -0.45, 0.992);
  }
  if (opc.sinos) for (const [b, m] of MOTIVO[c % 4]) sino(t + b * BAT, m + 12, opc.sinos, 0.2);
}

/** Brilho de moeda: plins subindo depressa. */
function brilho(t, g = 1) {
  if (SO) g *= 0.5;
  for (const [k, m] of [88, 92, 95, 100, 104].entries()) sino(t + k * 0.045, m, 0.55 * g, (k - 2) * 0.3);
}

// ── arranjo ────────────────────────────────────────────────────────────────
// abertura: 16 batidas = 4 compassos
// medidor enchendo: bipes subindo a cada meia batida
for (let k = 0; k < 7; k++) somar('bat', k * BAT * 0.5 + 0.1, 0.12, 0.35, (x) => Math.sin(PI2 * (700 + k * 90) * x) * Math.min(1, x / 0.003) * Math.exp(-x * 30), 0);
pad(0, [64, 68, 71, 76], 4 * BAT, 1.4);
subida(0.4, 4 * BAT - 0.4, 1.1);
for (let k = 0; k < 8; k++) caixa(3 * BAT + (k * BAT) / 8, 0.25 + k * 0.08);
impacto(4 * BAT, 1.1);
compasso(1, 'cheio', { melodia: 1 }); // LÍDERES / QUE BATERAM / O DESAFIO
for (const b of [4, 5, 6]) impacto(b * BAT, 0.45);
compasso(2, 'cheio', { arpejo: 1, sinos: 0.6 }); // o cupom entra
brilho(10 * BAT, 1);
compasso(3, 'claquete'); // HORA DA ENTREGA
impacto(12 * BAT, 0.8);
subida(13 * BAT, 3 * BAT, 0.9);

// cenas: groove cheio corrido; melodia e arpejo se revezam a cada 8 compassos
const c0 = L.cenas[0].ini / L.B / 4;
const cFinal = L.final.ini / L.B / 4;
for (let c = c0; c < cFinal; c++) {
  const bloco = Math.floor((c - c0) / 8) % 2;
  compasso(c, 'cheio', bloco === 0 ? { melodia: 0.85, virada: (c - c0) % 8 === 7 } : { arpejo: 0.9, sinos: 0.35, virada: (c - c0) % 8 === 7 });
}
// som de cada transição, conforme o estilo
for (const tr of L.transicoes) {
  const t = q2s(tr.q);
  if (tr.tipo === 'faixa') {
    whoosh(t - 0.32, 0.45, 1.2, 0.5);
    prato(t, 0.5);
  } else if (tr.tipo === 'zoom') {
    subida(t - 0.7, 0.7, 1);
    whoosh(t - 0.25, 0.35, 1);
    impacto(t, 0.65);
  } else {
    whoosh(t - 0.24, 0.24, 1.3, -0.8);
    whoosh(t - 0.06, 0.22, 1.1, 0.8);
    caixa(t, 0.9);
    prato(t, 0.35);
  }
  brilho(t + 0.03, 0.6);
}
for (const cena of L.cenas) {
  const t0 = q2s(cena.ini);
  const tg = q2s(cena.ini + cena.ganhou);
  if (tg - t0 > 1.2) subida(tg - 0.8, 0.8, 0.5);
  impacto(tg, 0.75);
  obturador(tg, 0.8);
  brilho(tg + 0.05, 1);
}

// final: mosaico (plim por foto), título com impacto, ta-dá
const tf = q2s(L.final.ini);
compasso(cFinal, 'cheio', { arpejo: 0.7 });
compasso(cFinal + 1, 'cheio', { arpejo: 0.7, virada: true });
for (let k = 0; k < 20; k++) plim(tf + q2s(4 + k * 5) + 0.02, 0.8);
impacto(tf + 8 * BAT, 1.1);
brilho(tf + 8 * BAT + 0.05, 1.2);
compasso(cFinal + 2, 'cheio', { melodia: 1, sinos: 0.7 });
compasso(cFinal + 3, 'cheio', { melodia: 1, sinos: 0.7 });
compasso(cFinal + 4, 'cheio', { melodia: 1, arpejo: 0.6, virada: true });
{
  const t = tf + 20 * BAT;
  impacto(t, 1);
  acorde(t, [52, 64, 68, 71, 76, 80], 1.8, 1.3, 3200);
  pad(t, [64, 68, 71, 76], 4 * BAT, 1.6);
  baixo(t, 40, 1.6, 1);
  bumbo(t, 1);
  brilho(t + 0.3, 1.2);
}

// ── reverb (Schroeder: 4 pentes + 2 passa-tudo, um par por canal) ──────────
function reverb(entrada, atrasos) {
  const out = new Float32Array(N);
  for (const d of atrasos.pentes) {
    const L = Math.round(d * TAXA);
    const buf = new Float32Array(L);
    let p = 0, lp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[p];
      lp += 0.35 * (y - lp);
      buf[p] = entrada[i] + lp * 0.8;
      p = (p + 1) % L;
      out[i] += y * 0.25;
    }
  }
  for (const d of atrasos.passa) {
    const L = Math.round(d * TAXA);
    const buf = new Float32Array(L);
    let p = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[p];
      const x = out[i];
      const y = -0.5 * x + b;
      buf[p] = x + 0.5 * y;
      p = (p + 1) % L;
      out[i] = y;
    }
  }
  return out;
}
const RE = reverb(REV, { pentes: [0.0297, 0.0371, 0.0411, 0.0437], passa: [0.005, 0.0017] });
const RD = reverb(REV, { pentes: [0.0311, 0.0353, 0.0429, 0.0459], passa: [0.0053, 0.0019] });

// ── mestre ─────────────────────────────────────────────────────────────────
const E = new Float32Array(N), D = new Float32Array(N);
for (let i = 0; i < N; i++) {
  E[i] = BAT_E[i] + MUS_E[i] * DUCK[i] + RE[i] * 0.55;
  D[i] = BAT_D[i] + MUS_D[i] * DUCK[i] + RD[i] * 0.55;
}
// volume pelo corpo da música (RMS do groove), não pelo pico de um impacto:
// o groove fica perto de −15 dB e a saturação abaixo segura o que passar
const g0 = t2i(12), g1 = t2i(30);
let soma = 0;
for (let i = g0; i < g1; i++) soma += E[i] * E[i] + D[i] * D[i];
const rms = Math.sqrt(soma / ((g1 - g0) * 2));
let ganho = Math.pow(10, -15 / 20) / (rms || 1);
if (SO) {
  // só efeitos: pelo pico (−3 dB); o volume contra a música é acertado na mixagem
  let pico = 0;
  for (let i = 0; i < N; i++) pico = Math.max(pico, Math.abs(E[i]), Math.abs(D[i]));
  ganho = Math.atanh(Math.pow(10, -3 / 20) / 0.89) / 1.12 / (pico || 1);
}
const fade = t2i(1.2);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(TAXA, 24);
buf.writeUInt32LE(TAXA * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const f = i > N - fade ? (N - i) / fade : 1;
  // saturação suave no lugar de um limitador: segura os picos sem estalar
  const e = Math.tanh(E[i] * ganho * 1.12) * 0.89 * f;
  const d = Math.tanh(D[i] * ganho * 1.12) * 0.89 * f;
  buf.writeInt16LE(Math.round(e * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(d * 32767), 46 + i * 4);
}
const SAIDA = SO ? `efeitos-${VERSAO}.wav` : 'trilha.wav';
writeFileSync(path.join(PASTA, SAIDA), buf);
console.log(`ok ${SAIDA} ${SEG.toFixed(1)} s, ${BATIDAS} batidas, ${L.cenas.length} cenas`);

// ── mixagem com a música da versão ─────────────────────────────────────────
if (SO) {
  const v = lerVersao(VERSAO);
  const VOL_EFEITOS = 0.5;
  const ts = v.trechos.map((t) => ({ musica: t.musica, video: t.video === 'batida16' ? 16 * BAT : t.video }));
  const partes = ts.map((t, i) => {
    const dur = (i + 1 < ts.length ? ts[i + 1].video : SEG) - t.video;
    const entra = i === 0 ? 0.25 : 0.012;
    const sai = i + 1 < ts.length ? 0.015 : 3.2; // a última desce junto com o fim do mosaico
    return `[0:a]atrim=start=${t.musica}:duration=${dur.toFixed(4)},asetpts=PTS-STARTPTS,aresample=${TAXA},afade=t=in:d=${entra},afade=t=out:st=${(dur - sai).toFixed(4)}:d=${sai}[m${i}]`;
  });
  const junta = `${ts.map((_, i) => `[m${i}]`).join('')}concat=n=${ts.length}:v=0:a=1[mus]`;
  const filtro = [...partes, junta, `[1:a]volume=${VOL_EFEITOS}[ef]`, `[mus][ef]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95:level=false[out]`].join(';');
  const saida = path.join(PASTA, `audio-${VERSAO}.wav`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(PASTA, v.arquivo), '-i', path.join(PASTA, SAIDA), '-filter_complex', filtro, '-map', '[out]', '-ac', '2', '-ar', String(TAXA), saida]);
  console.log(`ok audio-${VERSAO}.wav (${v.nome}, ${ts.length} trecho(s))`);
}
