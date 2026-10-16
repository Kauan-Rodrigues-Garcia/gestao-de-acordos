// Sintetiza os efeitos sonoros do vídeo (WAV 44,1 kHz mono) em public/sons/.
// Tudo gerado aqui — nada de biblioteca de som de terceiros.
//
//   node scripts/sons.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TAXA = 44100;
const PASTA = path.resolve(import.meta.dirname, '..', 'public', 'sons');
mkdirSync(PASTA, { recursive: true });

// ruído determinístico (o mesmo a cada geração)
let semente = 12345;
const ruido = () => {
  semente = (semente * 1103515245 + 12345) & 0x7fffffff;
  return (semente / 0x7fffffff) * 2 - 1;
};

function gravar(nome, segundos, gerar) {
  const n = Math.floor(segundos * TAXA);
  const amostras = new Float32Array(n);
  gerar(amostras, n);
  // normaliza com folga
  let pico = 0;
  for (const a of amostras) pico = Math.max(pico, Math.abs(a));
  const ganho = pico > 0 ? 0.89 / pico : 1;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(TAXA, 24);
  buf.writeUInt32LE(TAXA * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, amostras[i] * ganho)) * 32767), 44 + i * 2);
  writeFileSync(path.join(PASTA, nome), buf);
  console.log('ok', nome);
}

const PI2 = Math.PI * 2;

// clique de mouse: estalo curto, agudo e seco
gravar('clique.wav', 0.07, (a, n) => {
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const r = ruido();
    lp += (r - lp) * 0.5;
    a[i] = Math.sin(PI2 * 2300 * t) * Math.exp(-t * 140) * 0.6 + (r - lp) * Math.exp(-t * 420) * 0.5 + Math.sin(PI2 * 900 * t) * Math.exp(-t * 90) * 0.25;
  }
});

// whoosh: ruído com filtro que abre e fecha
function whoosh(nome, segundos, reverso = false) {
  gravar(nome, segundos, (a, n) => {
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const k = reverso ? u : 1 - u;
      const env = Math.pow(Math.sin(Math.PI * Math.pow(reverso ? u : 1 - u, reverso ? 1.6 : 0.6)), 2);
      const corte = 0.015 + 0.25 * Math.pow(Math.sin(Math.PI * k), 2);
      lp += (ruido() - lp) * corte;
      lp2 += (lp - lp2) * corte;
      a[i] = lp2 * env;
    }
  });
}
whoosh('whoosh.wav', 0.75);
whoosh('succao.wav', 1.6, true);

// areia: o chiado do efeito Thanos, com grãos estalando
gravar('areia.wav', 3.2, (a, n) => {
  let lp = 0;
  let hp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const env = Math.min(1, t / 0.35) * Math.exp(-Math.max(0, t - 0.6) * 1.1);
    const r = ruido();
    lp += (r - lp) * 0.35;
    hp = r - lp;
    const grao = (ruido() + 1) / 2 < 0.0016 ? 1 : 0;
    a[i] = (hp * 0.35 + lp * 0.15) * env + grao * ruido() * 0.9 * env;
  }
});

// impacto: grave que cai + brilho por cima (a fusão das logos)
gravar('impacto.wav', 2.0, (a, n) => {
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const f = 45 + 95 * Math.exp(-t * 6);
    fase += (PI2 * f) / TAXA;
    const grave = Math.sin(fase) * Math.exp(-t * 2.6);
    const ataque = ruido() * Math.exp(-t * 35) * 0.35;
    const brilho = (Math.sin(PI2 * 1760 * t) * 0.5 + Math.sin(PI2 * 2637 * t) * 0.35 + Math.sin(PI2 * 3520 * t) * 0.2) * Math.exp(-t * 2.2) * 0.22 * Math.min(1, t / 0.02);
    a[i] = grave + ataque + brilho;
  }
});

// sino curto (acordo salvo)
function nota(t, f, decai) {
  return (Math.sin(PI2 * f * t) + Math.sin(PI2 * f * 2 * t) * 0.3 + Math.sin(PI2 * f * 3 * t) * 0.12) * Math.exp(-t * decai) * Math.min(1, t / 0.004);
}
gravar('ding.wav', 1.2, (a, n) => {
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    a[i] = nota(t, 1318.5, 4) * 0.6 + (t > 0.09 ? nota(t - 0.09, 1975.5, 4.5) * 0.55 : 0);
  }
});

// fanfarra da comemoração: arpejo subindo + acorde
gravar('festa.wav', 2.4, (a, n) => {
  const notas = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    let v = 0;
    notas.forEach((f, k) => {
      const ini = k * 0.075;
      if (t >= ini) v += nota(t - ini, f, k === notas.length - 1 ? 1.6 : 2.4) * (k === notas.length - 1 ? 0.7 : 0.5);
    });
    // estouro de confete
    v += ruido() * Math.exp(-t * 18) * 0.4;
    a[i] = v;
  }
});

// ── v2 (no fim do arquivo para não mudar o ruído dos sons de cima) ─────────

// tecla: o toque curto de um teclado baixo
gravar('tecla.wav', 0.05, (a, n) => {
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const r = ruido();
    lp += (r - lp) * 0.3;
    a[i] = lp * Math.exp(-t * 160) * 0.8 + Math.sin(PI2 * 1500 * t) * Math.exp(-t * 220) * 0.25;
  }
});

// pop: uma bolha macia (aviso, janela que abre)
gravar('pop.wav', 0.22, (a, n) => {
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const f = 420 + 520 * (1 - Math.exp(-t * 40));
    fase += (PI2 * f) / TAXA;
    a[i] = Math.sin(fase) * Math.exp(-t * 26) * Math.min(1, t / 0.003);
  }
});
