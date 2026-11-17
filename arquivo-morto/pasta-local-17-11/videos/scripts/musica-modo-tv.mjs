// Sintetiza a música de fundo do vídeo do Modo TV (WAV 44,1 kHz estéreo) em
// public/modo-tv/musica.wav. Composição própria, gerada aqui — nada de música
// de terceiros, então pode ir para qualquer lugar sem problema de direito.
//
// Lo-fi calmo a 92 bpm: piano elétrico, pad, baixo e uma bateria macia que
// entra depois da introdução. Fica baixinho no vídeo (o volume é do Remotion).
//
//   node scripts/musica-modo-tv.mjs [segundos]

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TAXA = 44100;
const SEGUNDOS = Number(process.argv[2]) || 132;
const PASTA = path.resolve(import.meta.dirname, '..', 'public', 'modo-tv');
mkdirSync(PASTA, { recursive: true });

const BPM = 92;
const BATIDA = 60 / BPM;
const COMPASSO = BATIDA * 4;
const PI2 = Math.PI * 2;
const n = Math.floor(SEGUNDOS * TAXA);
const E = new Float32Array(n);
const D = new Float32Array(n);

let semente = 777;
const ruido = () => {
  semente = (semente * 1103515245 + 12345) & 0x7fffffff;
  return (semente / 0x7fffffff) * 2 - 1;
};
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** Soma um som nos dois canais, com pan de -1 (esquerda) a 1 (direita). */
function somar(inicio, dur, pan, ganho, onda) {
  const i0 = Math.floor(inicio * TAXA);
  const len = Math.floor(dur * TAXA);
  const ge = ganho * Math.cos(((pan + 1) * Math.PI) / 4);
  const gd = ganho * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let k = 0; k < len; k++) {
    const i = i0 + k;
    if (i < 0 || i >= n) continue;
    const v = onda(k / TAXA);
    E[i] += v * ge;
    D[i] += v * gd;
  }
}

// Fmaj7 – Em7 – Dm7 – Cmaj7, descendo: calmo, sem resolver de vez.
const ACORDES = [
  { baixo: 41, notas: [53, 57, 60, 64] },
  { baixo: 40, notas: [52, 55, 59, 62] },
  { baixo: 38, notas: [50, 53, 57, 60] },
  { baixo: 36, notas: [48, 52, 55, 59] },
];
// Pentatônica de dó para os sininhos.
const ESCALA = [72, 74, 76, 79, 81, 84];

function piano(t0, midi, vel, dur = 2.2) {
  const f = hz(midi);
  somar(t0, dur, (midi - 60) / 30, 0.16 * vel, (t) => {
    const env = Math.min(1, t / 0.006) * Math.exp(-t * 1.6);
    const trem = 1 + 0.06 * Math.sin(PI2 * 4.5 * t);
    return env * trem * (Math.sin(PI2 * f * t) + 0.28 * Math.exp(-t * 4) * Math.sin(PI2 * 2 * f * t) + 0.08 * Math.exp(-t * 7) * Math.sin(PI2 * 3 * f * t));
  });
}

function pad(t0, notas, dur) {
  for (const m of notas) {
    for (const [desafina, pan] of [[-0.12, -0.7], [0.12, 0.7]]) {
      const f = hz(m + 12) * (1 + desafina / 100);
      somar(t0, dur + 0.8, pan, 0.022, (t) => {
        const env = Math.min(1, t / 0.9) * Math.min(1, Math.max(0, (dur + 0.8 - t) / 0.8));
        return env * (Math.sin(PI2 * f * t) + 0.3 * Math.sin(PI2 * 2 * f * t + 1));
      });
    }
  }
}

function baixo(t0, midi, dur) {
  const f = hz(midi);
  somar(t0, dur, 0, 0.2, (t) => {
    const env = Math.min(1, t / 0.01) * Math.exp(-t * 1.1) * Math.min(1, Math.max(0, (dur - t) / 0.05));
    return env * (Math.sin(PI2 * f * t) + 0.15 * Math.sin(PI2 * 2 * f * t));
  });
}

function bumbo(t0) {
  somar(t0, 0.32, 0, 0.42, (t) => {
    const fase = PI2 * (48 * t + (70 / 18) * (1 - Math.exp(-18 * t)));
    return Math.exp(-t * 11) * Math.sin(fase);
  });
}

function aro(t0) {
  let lp = 0;
  somar(t0, 0.18, 0.1, 0.1, (t) => {
    lp += 0.45 * (ruido() - lp);
    return Math.exp(-t * 26) * (0.7 * lp + 0.5 * Math.sin(PI2 * 210 * t));
  });
}

function chimbal(t0, forte) {
  let ant = 0;
  somar(t0, 0.06, 0.35, forte ? 0.05 : 0.03, (t) => {
    const r = ruido();
    const hp = r - ant;
    ant = r;
    return Math.exp(-t * 70) * hp;
  });
}

function sino(t0, midi) {
  const f = hz(midi);
  somar(t0, 1.6, (midi - 76) / 12, 0.05, (t) => Math.min(1, t / 0.003) * Math.exp(-t * 3) * (Math.sin(PI2 * f * t) + 0.25 * Math.sin(PI2 * 3.01 * f * t)));
}

const compassos = Math.ceil(SEGUNDOS / COMPASSO);
for (let c = 0; c < compassos; c++) {
  const t = c * COMPASSO;
  const ac = ACORDES[c % 4];
  const comBateria = c >= 4 && c < compassos - 2;
  // um respiro de quatro compassos a cada 24: só piano e pad
  const respiro = c % 24 >= 20;

  pad(t, ac.notas, COMPASSO);
  ac.notas.forEach((m, i) => piano(t + i * 0.022, m, 0.9 - i * 0.08));
  piano(t + BATIDA * 2.5, ac.notas[1], 0.45, 1.2);
  piano(t + BATIDA * 2.5 + 0.02, ac.notas[3], 0.4, 1.2);

  if (c >= 2) {
    baixo(t, ac.baixo, BATIDA * 1.8);
    baixo(t + BATIDA * 2, ac.baixo, BATIDA * 1.2);
    baixo(t + BATIDA * 3.5, ac.baixo + 12, BATIDA * 0.45);
  }

  if (comBateria && !respiro) {
    bumbo(t);
    bumbo(t + BATIDA * 2.5);
    aro(t + BATIDA);
    aro(t + BATIDA * 3);
    // colcheias com balanço (swing leve)
    for (let k = 0; k < 8; k++) chimbal(t + k * (BATIDA / 2) + (k % 2 ? 0.045 : 0), k % 2 === 0);
  }

  // sininhos em metade das seções
  if (c >= 8 && c % 16 >= 8 && !respiro) {
    for (let k = 0; k < 4; k++) {
      const nota = ESCALA[(c * 3 + k * 2) % ESCALA.length];
      if ((c + k) % 3 !== 0) sino(t + BATIDA * k + BATIDA * 0.5, nota);
    }
  }
}

// mestre: um passa-baixa leve para tirar o brilho digital, fade no fim e normalização
let le = 0, ld = 0;
for (let i = 0; i < n; i++) {
  le += 0.55 * (E[i] - le);
  ld += 0.55 * (D[i] - ld);
  E[i] = le;
  D[i] = ld;
}
const fade = Math.floor(3 * TAXA);
for (let i = 0; i < fade; i++) {
  const g = i / fade;
  E[n - 1 - i] *= g;
  D[n - 1 - i] *= g;
}
let pico = 0;
for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(E[i]), Math.abs(D[i]));
const ganho = 0.85 / (pico || 1);

const buf = Buffer.alloc(44 + n * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + n * 4, 4);
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
buf.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, E[i] * ganho)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, D[i] * ganho)) * 32767), 46 + i * 4);
}
writeFileSync(path.join(PASTA, 'musica.wav'), buf);
console.log('ok musica.wav', SEGUNDOS + 's');
