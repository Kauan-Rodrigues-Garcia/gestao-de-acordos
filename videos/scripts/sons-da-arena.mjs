// Os sons que a Arena de Outubro (`src/natal/Arena.tsx`) precisa e que o app
// não tinha: o trovão do relâmpago, o impacto grave das cartelas e a subida
// (o «riser») antes delas. Sintetizados aqui, sem baixar nada, com sorteio de
// semente fixa — rodar de novo dá o mesmo arquivo.
//
//   node scripts/sons-da-arena.mjs
//
// Saem em public/natal/arena/*.wav (44,1 kHz, mono, 16 bits).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAXA = 44_100;
const PASTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'natal', 'arena');

function sorteio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Passa-baixa de um polo: `corte` em Hz (pode variar por amostra). */
function passaBaixa(sinal, corte) {
  const out = new Float32Array(sinal.length);
  let y = 0;
  for (let i = 0; i < sinal.length; i++) {
    const fc = typeof corte === 'function' ? corte(i / TAXA) : corte;
    const a = 1 - Math.exp((-2 * Math.PI * fc) / TAXA);
    y += a * (sinal[i] - y);
    out[i] = y;
  }
  return out;
}

const passaAlta = (sinal, corte) => {
  const baixo = passaBaixa(sinal, corte);
  return sinal.map((v, i) => v - baixo[i]);
};

function ruido(n, semente) {
  const r = sorteio(semente);
  return Float32Array.from({ length: n }, () => r() * 2 - 1);
}

/** Normaliza ao pico pedido e grava. */
function gravar(nome, sinal, pico = 0.89) {
  let max = 0;
  for (const v of sinal) max = Math.max(max, Math.abs(v));
  const k = max > 0 ? pico / max : 1;
  const dados = Buffer.alloc(44 + sinal.length * 2);
  dados.write('RIFF', 0); dados.writeUInt32LE(36 + sinal.length * 2, 4); dados.write('WAVE', 8);
  dados.write('fmt ', 12); dados.writeUInt32LE(16, 16); dados.writeUInt16LE(1, 20); dados.writeUInt16LE(1, 22);
  dados.writeUInt32LE(TAXA, 24); dados.writeUInt32LE(TAXA * 2, 28); dados.writeUInt16LE(2, 32); dados.writeUInt16LE(16, 34);
  dados.write('data', 36); dados.writeUInt32LE(sinal.length * 2, 40);
  for (let i = 0; i < sinal.length; i++) {
    // Rampa de 5 ms no fim: nada de estalo.
    const fim = Math.min(1, (sinal.length - i) / (TAXA * 0.005));
    dados.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sinal[i] * k * fim)) * 32767), 44 + i * 2);
  }
  mkdirSync(PASTA, { recursive: true });
  writeFileSync(join(PASTA, `${nome}.wav`), dados);
  console.log(`${nome}.wav  ${(sinal.length / TAXA).toFixed(2)} s`);
}

// ── O trovão: o estalo seco e o ronco que rola e vai embora ──────────────────
{
  const dur = 3.4, n = Math.round(dur * TAXA);
  const estalo = passaAlta(ruido(n, 11), 900);
  const ronco = passaBaixa(passaBaixa(ruido(n, 12), 180), 140);
  const r = sorteio(13);
  // O ronco «rola»: três ou quatro ondas de volume, como trovão longe.
  const ondas = Array.from({ length: 4 }, (_, i) => ({ t: 0.08 + i * 0.55 + r() * 0.25, forca: 1 - i * 0.2 }));
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const envEstalo = t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / 0.07);
    let envRonco = 0;
    for (const o of ondas) if (t >= o.t) envRonco += o.forca * (1 - Math.exp(-(t - o.t) / 0.05)) * Math.exp(-(t - o.t) / 0.9);
    s[i] = estalo[i] * envEstalo * 0.55 + ronco[i] * envRonco * 6.5;
  }
  gravar('trovao', s);
}

// ── O impacto: soco grave (queda de 70 → 38 Hz) com um clique na frente ──────
{
  const dur = 1.6, n = Math.round(dur * TAXA);
  const clique = passaAlta(ruido(n, 21), 1500);
  const corpo = passaBaixa(ruido(n, 22), 320);
  const s = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const freq = 38 + 32 * Math.exp(-t / 0.12);
    fase += (2 * Math.PI * freq) / TAXA;
    const env = t < 0.003 ? t / 0.003 : Math.exp(-t / 0.42);
    const sub = Math.sin(fase) * env;
    // Um pouco de saturação: o grave aparece até em caixinha de som.
    const quente = Math.tanh(sub * 2.2) * 0.8;
    s[i] = quente + clique[i] * Math.exp(-t / 0.012) * 0.6 + corpo[i] * Math.exp(-t / 0.09) * 1.4;
  }
  gravar('impacto', s);
}

// ── A subida: ruído que abre e sobe de tom até cortar seco ───────────────────
{
  const dur = 1.3, n = Math.round(dur * TAXA);
  const base = ruido(n, 31);
  const corte = t => 300 + 6500 * Math.pow(t / dur, 2.2);
  const aberto = passaAlta(passaBaixa(base, corte), 180);
  const s = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const p = t / dur;
    fase += (2 * Math.PI * (110 + 330 * p * p)) / TAXA;
    const env = Math.pow(p, 1.8);
    s[i] = aberto[i] * env + Math.sin(fase) * env * 0.25;
  }
  gravar('subida', s, 0.8);
}

// ── As cartelas, cada uma com o seu som (06/11, segunda rodada: «repetitivo») ─

// O brilho da abóbora: arpejo de sino subindo, com cauda.
{
  const dur = 1.6, n = Math.round(dur * TAXA);
  const notas = [784, 988, 1175, 1568, 1976];
  const s = new Float32Array(n);
  notas.forEach((fq, k) => {
    const ini = k * 0.075;
    for (let i = Math.round(ini * TAXA); i < n; i++) {
      const t = i / TAXA - ini;
      const env = Math.min(1, t / 0.004) * Math.exp(-t / 0.35);
      s[i] += (Math.sin(2 * Math.PI * fq * t) + 0.4 * Math.sin(2 * Math.PI * fq * 2.76 * t) * Math.exp(-t / 0.08)) * env * 0.5;
    }
  });
  gravar('brilho', s, 0.7);
}

// A terra tremendo: ronco grave que cresce, com pedrinhas caindo.
{
  const dur = 1.5, n = Math.round(dur * TAXA);
  const ronco = passaBaixa(passaBaixa(ruido(n, 41), 120), 90);
  const pedras = passaAlta(ruido(n, 42), 2000);
  const r = sorteio(43);
  const batidas = Array.from({ length: 14 }, () => 0.15 + r() * 1.2);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const env = Math.min(1, t / 0.9) * (t > 1.2 ? Math.max(0, 1 - (t - 1.2) / 0.3) : 1);
    let p = 0;
    for (const b of batidas) if (t >= b && t < b + 0.03) p += Math.exp(-(t - b) / 0.006);
    s[i] = ronco[i] * env * 7 + pedras[i] * p * 0.5;
  }
  gravar('terra', s);
}

// O holofote ligando: o «clunk» pesado do interruptor de palco.
{
  const dur = 1.2, n = Math.round(dur * TAXA);
  const clique = passaAlta(ruido(n, 51), 2500);
  const s = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    fase += (2 * Math.PI * (60 + 40 * Math.exp(-t / 0.05))) / TAXA;
    const corpo = Math.tanh(Math.sin(fase) * 3) * Math.exp(-t / 0.18);
    const metal = Math.sin(2 * Math.PI * 1830 * t) * Math.exp(-t / 0.05) * 0.25 + Math.sin(2 * Math.PI * 2710 * t) * Math.exp(-t / 0.035) * 0.15;
    // O zumbido da lâmpada esquentando, baixinho.
    const zumbe = t > 0.05 ? Math.sin(2 * Math.PI * 120 * t) * 0.05 * Math.min(1, (t - 0.05) / 0.2) * Math.exp(-(t - 0.05) / 0.8) : 0;
    s[i] = corpo * 0.8 + clique[i] * Math.exp(-t / 0.004) * 0.9 + metal + zumbe;
  }
  gravar('holofote', s);
}

// O arranhão de disco: ruído com o tom indo e voltando.
{
  const dur = 0.55, n = Math.round(dur * TAXA);
  const base = ruido(n, 61);
  const s = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const vel = Math.sin((t / dur) * Math.PI * 2.2);
    fase += (2 * Math.PI * (300 + 900 * Math.abs(vel))) / TAXA;
    const env = Math.min(1, t / 0.01) * Math.max(0, 1 - t / dur);
    s[i] = (Math.sin(fase) * 0.5 + base[i] * 0.35) * env * (0.4 + 0.6 * Math.abs(vel));
  }
  gravar('arranhao', passaBaixa(s, 3500), 0.75);
}

// O pântano borbulhando: bolhas de tom subindo.
{
  const dur = 1.8, n = Math.round(dur * TAXA);
  const r = sorteio(71);
  const s = new Float32Array(n);
  for (let k = 0; k < 26; k++) {
    const ini = r() * 1.5, f0 = 180 + r() * 380, d = 0.05 + r() * 0.07;
    for (let i = Math.round(ini * TAXA); i < Math.min(n, Math.round((ini + d) * TAXA)); i++) {
      const t = i / TAXA - ini;
      const fq = f0 * (1 + 2.5 * (t / d));
      s[i] += Math.sin(2 * Math.PI * fq * t) * Math.sin(Math.PI * t / d) * (0.4 + r() * 0.1);
    }
  }
  const fundo = passaBaixa(ruido(n, 72), 200);
  for (let i = 0; i < n; i++) s[i] += fundo[i] * 2.2 * Math.min(1, i / TAXA / 0.4);
  gravar('borbulha', s, 0.75);
}
