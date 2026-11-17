// Trilha do «Entre Metas e Risadas» (WAV 44,1 kHz estéreo) em
// public/fechamento/trilha.wav. Composição própria, gerada aqui — pode postar
// em qualquer rede sem problema de direito autoral.
//
// Pop funk alegre a 120 bpm em ré maior (D – A – Bm – G), já com os efeitos do
// vídeo no lugar: bipes da contagem, projetor, claquete, whoosh de cada foto,
// obturador, polaroids caindo no mural e o «ta-dá» do final.
//
// A linha do tempo é a mesma de src/fechamento/tempo.ts (abertura 20 batidas,
// setor = 4 + 4 por pessoa + 4, final 8 + 32 + 8). O número de pessoas de cada
// setor é lido de src/fechamento/elenco.ts.
//
//   node scripts/musica-fechamento.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const PASTA = path.join(RAIZ, 'public', 'fechamento');
mkdirSync(PASTA, { recursive: true });

// ── linha do tempo ──────────────────────────────────────────────────────────
const elenco = readFileSync(path.join(RAIZ, 'src', 'fechamento', 'elenco.ts'), 'utf8');
const ids = [...elenco.matchAll(/id: '(\w+)'/g)].map((m) => m[1]);
const contagem = ids.map((id) => [...elenco.matchAll(new RegExp(`p\\('${id}',`, 'g'))].length);

const trechos = [];
let bt = 0;
const por = (tipo, dur, extra = {}) => {
  trechos.push({ tipo, ini: bt, dur, ...extra });
  bt += dur;
};
por('abertura', 20);
contagem.forEach((n, setor) => {
  por('claquete', 4, { setor });
  for (let i = 0; i < n; i++) por('estrela', 4, { setor, i });
  por('mural', 4, { setor, n });
});
por('mosaico', 8);
por('creditos', 32);
por('fim', 8);
const BATIDAS = bt;

const TAXA = 44100;
const BPM = 120;
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
// D – A – Bm – G, um acorde por compasso (4 batidas = 2 s)
const HARM = [
  { raiz: 38, notas: [62, 66, 69, 74] },
  { raiz: 33, notas: [61, 64, 69, 73] },
  { raiz: 35, notas: [62, 66, 71, 74] },
  { raiz: 31, notas: [62, 67, 71, 74] },
];
// motivo de 4 compassos: [batida dentro do compasso, nota]
const MOTIVO = [
  [[0, 74], [0.5, 76], [1, 78], [1.5, 81], [2.5, 78], [3, 76]],
  [[0, 76], [0.5, 78], [1, 76], [1.5, 73], [2.5, 69]],
  [[0, 74], [0.5, 76], [1, 78], [1.5, 83], [2.5, 81], [3, 78]],
  [[0, 79], [0.5, 78], [1, 76], [1.5, 74], [2.5, 76], [3, 74]],
];

/** Um compasso do groove completo. `nivel`: 'cheio' | 'leve' | 'claquete'. */
function compasso(c, nivel, opc = {}) {
  const t = c * 4 * BAT;
  const h = HARM[c % 4];
  const R = h.raiz;
  const cheio = nivel === 'cheio';
  const leve = nivel === 'leve';
  const claq = nivel === 'claquete';

  // bateria
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

  // baixo funk
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

  // acordes: golpes no contratempo
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

// ── arranjo ────────────────────────────────────────────────────────────────
for (const tr of trechos) {
  const c0 = tr.ini / 4;
  const t0 = tr.ini * BAT;
  if (tr.tipo === 'abertura') {
    projetor(0, 3.05);
    for (const b of [0, 2, 4]) bipe(b * BAT);
    // «apresentam»: o acorde abre devagar, a subida e a virada levam ao drop
    pad(6 * BAT, [62, 66, 69, 74], 2 * BAT + 0.4, 1.6);
    subida(5 * BAT, 3 * BAT, 1.1);
    for (let k = 0; k < 12; k++) caixa(7 * BAT + (k * BAT) / 12, 0.25 + k * 0.06);
    impacto(8 * BAT, 1.1);
    compasso(2, 'cheio', { melodia: 1 });
    compasso(3, 'cheio', { melodia: 1 });
    compasso(4, 'cheio', { melodia: 0.8, virada: true });
    for (let k = 0; k < 8; k++) obturador(16 * BAT + (k * BAT) / 2, 0.9);
  } else if (tr.tipo === 'claquete') {
    compasso(c0, 'claquete');
    prato(t0, 0.7);
    subida(t0 + 0.1, 2 * BAT - 0.1, 0.8);
    claquete(t0 + 2 * BAT);
    impacto(t0 + 2 * BAT, 0.55);
    whoosh(t0 + 4 * BAT - 0.3, 0.4, 0.9);
  } else if (tr.tipo === 'estrela') {
    const par = tr.setor % 2 === 0;
    compasso(c0, 'cheio', par ? { melodia: 0.85 } : { arpejo: 1 });
    obturador(t0, 0.55);
    // a polaroid sai embalada: whoosh entrando no próximo corte
    whoosh(t0 + 4 * BAT - 0.3, 0.42, 1, tr.i % 2 ? -0.4 : 0.4);
  } else if (tr.tipo === 'mural') {
    compasso(c0, 'cheio', { virada: true, melodia: tr.setor % 2 === 0 ? 0.6 : 0 });
    for (let i = 0; i < tr.n; i++) plim(t0 + (4 + i * 3 + 6) / 30, 0.9);
    obturador(t0 + 3 * BAT, 1.1);
  } else if (tr.tipo === 'mosaico') {
    impacto(t0, 1);
    compasso(c0, 'cheio', { melodia: 1 });
    compasso(c0 + 1, 'cheio', { melodia: 1, arpejo: 0.6, virada: true });
    for (let k = 0; k < 12; k++) plim(t0 + k * 0.07, 0.4);
  } else if (tr.tipo === 'creditos') {
    for (let c = 0; c < 8; c++) compasso(c0 + c, c < 7 ? 'leve' : 'leve', { sinos: c >= 2 ? 0.9 : 0, melodia: c >= 4 && c < 7 ? 0.5 : 0 });
  } else if (tr.tipo === 'fim') {
    const h = HARM[3];
    pad(t0, h.notas, 4 * BAT, 1.5);
    caneta(t0 + 2.2 * BAT, 0.3);
    // «CONTINUA»: ta-dá em ré maior
    impacto(t0 + 4 * BAT, 0.9);
    acorde(t0 + 4 * BAT, [50, 62, 66, 69, 74, 78], 1.8, 1.3, 3200);
    pad(t0 + 4 * BAT, [62, 66, 69, 74], 4 * BAT, 1.6);
    baixo(t0 + 4 * BAT, 38, 1.6, 1);
    bumbo(t0 + 4 * BAT, 1);
    for (const [k, m] of [86, 88, 90, 93, 98].entries()) sino(t0 + 4.6 * BAT + k * 0.06, m, 0.7, (k - 2) * 0.3);
  }
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
const ganho = Math.pow(10, -15 / 20) / (rms || 1);
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
writeFileSync(path.join(PASTA, 'trilha.wav'), buf);
console.log(`ok trilha.wav ${SEG.toFixed(1)} s, ${BATIDAS} batidas, setores ${contagem.join('/')}`);
