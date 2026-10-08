/**
 * sons.ts — os sons da Caça aos Zumbis, feitos na hora (WebAudio).
 *
 * Nenhum arquivo: tiro, respingo, ricochete, baque, o «tóc» do machado, o
 * cérebro estourando e o gemido da saída da cova são osciladores e ruído
 * filtrado. O
 * ruído é «segurado» (o mesmo valor por vários samples), como no chip de som
 * de um console de 8 bits — o tiro e o baque soam de videogame velho.
 *
 * ## Quem ouve (Cleber, 08/10/2026)
 *
 * Todo mundo, sempre — não depende do Som ambiente do Halloween estar
 * tocando (era assim na primeira versão; ele pediu para tirar). O volume é
 * fixo e baixo (`VOLUME`).
 *
 * Navegador só deixa tocar som depois de a pessoa ter clicado ou digitado na
 * página: até lá, o zumbi aparece mudo. Falha em silêncio — sem WebAudio, a
 * caça segue sem som.
 */

/**
 * O volume de tudo, de 0 a 1. Baixo: é enfeite, não alarme. Era 0,45; o
 * Cleber achou o tiro alto demais (acertando ou errando) e pediu «só um
 * somzinho ambiente, de fundo» — 08/10/2026, caiu para um terço.
 */
export const VOLUME = 0.15;

/**
 * O gemido da saída da cova, ainda mais baixo que o resto: um fundo, quase
 * nada. Multiplica o `VOLUME`; subiu de 0,07 para 0,21 quando o `VOLUME` caiu
 * para um terço, para o gemido continuar exatamente onde estava.
 */
const GEMIDO = 0.21;

let ctx: AudioContext | null = null;
let ruidoCache: AudioBuffer | null = null;

function contexto(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch((): void => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/** Ruído de 8 bits: cada valor se repete por `SEGURA` samples — chiado grosso, não chuvisco. */
function ruido(c: AudioContext): AudioBuffer {
  if (ruidoCache && ruidoCache.sampleRate === c.sampleRate) return ruidoCache;
  const SEGURA = 6;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 1.6), c.sampleRate);
  const d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < d.length; i++) {
    if (i % SEGURA === 0) v = Math.random() * 2 - 1;
    d[i] = v;
  }
  ruidoCache = buf;
  return buf;
}

/** Um envelope: sobe em `ataque`, segura em `segura` e cai até sumir em `dura` segundos. */
function envelope(c: AudioContext, pico: number, ataque: number, dura: number, em = c.currentTime, segura = 0, destino: AudioNode = c.destination): GainNode {
  const g = c.createGain();
  const alto = Math.max(0.0002, pico * VOLUME);
  g.gain.setValueAtTime(0.0001, em);
  g.gain.exponentialRampToValueAtTime(alto, em + ataque);
  if (segura > 0) g.gain.setValueAtTime(alto, em + ataque + segura);
  g.gain.exponentialRampToValueAtTime(0.0001, em + ataque + segura + dura);
  g.connect(destino);
  return g;
}

interface OpcoesChiado {
  pico: number;
  dura: number;
  filtro: BiquadFilterType;
  freq: number;
  /** Para onde o filtro corre (molhado = desce rápido). */
  freqFim?: number;
  q?: number;
  em?: number;
  taxa?: number;
  ataque?: number;
  segura?: number;
}

function chiado(c: AudioContext, o: OpcoesChiado): void {
  const em = o.em ?? c.currentTime;
  const src = c.createBufferSource();
  src.buffer = ruido(c);
  src.playbackRate.value = o.taxa ?? 1;
  const f = c.createBiquadFilter();
  f.type = o.filtro;
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.freq, em);
  if (o.freqFim) f.frequency.exponentialRampToValueAtTime(o.freqFim, em + (o.ataque ?? 0.004) + (o.segura ?? 0) + o.dura);
  src.connect(f);
  f.connect(envelope(c, o.pico, o.ataque ?? 0.004, o.dura, em, o.segura ?? 0));
  // Começa num ponto qualquer do ruído: dois chiados juntos não soam iguais.
  src.start(em, Math.random() * 0.6);
  src.stop(em + (o.ataque ?? 0.004) + (o.segura ?? 0) + o.dura + 0.05);
}

function tom(c: AudioContext, o: { tipo?: OscillatorType; de: number; para: number; pico: number; dura: number; em?: number }): void {
  const em = o.em ?? c.currentTime;
  const osc = c.createOscillator();
  osc.type = o.tipo ?? 'square';
  osc.frequency.setValueAtTime(o.de, em);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.para), em + o.dura);
  osc.connect(envelope(c, o.pico, 0.003, o.dura, em));
  osc.start(em);
  osc.stop(em + o.dura + 0.05);
}

/**
 * Uma bolha: tom puro que sobe rápido — é o «blup» de líquido grosso. Várias,
 * em instantes soltos, fazem a gosma borbulhando.
 */
function bolha(c: AudioContext, em: number, freq: number, pico: number): void {
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, em);
  osc.frequency.exponentialRampToValueAtTime(freq * 2.6, em + 0.05);
  osc.connect(envelope(c, pico, 0.004, 0.05, em));
  osc.start(em);
  osc.stop(em + 0.08);
}

function tocar(f: (c: AudioContext) => void): void {
  const c = contexto();
  if (!c) return;
  try { f(c); } catch { /* som é enfeite: nunca derruba a caça */ }
}

const entre = (a: number, b: number) => a + Math.random() * (b - a);

// ── Os sons ─────────────────────────────────────────────────────────────────

/** O disparo: estalo de ruído com um soco grave embaixo. */
export function somTiro(): void {
  tocar(c => {
    chiado(c, { pico: 0.55, dura: 0.16, filtro: 'bandpass', freq: 1400 });
    tom(c, { de: 170, para: 45, pico: 0.5, dura: 0.12 });
  });
}

/** Tiro no corpo: respingo molhado e um baque abafado. */
export function somAcerto(): void {
  tocar(c => {
    const t = c.currentTime + 0.03;
    chiado(c, { pico: 0.45, dura: 0.32, filtro: 'lowpass', freq: 1400, freqFim: 350, em: t, taxa: 0.55 });
    tom(c, { tipo: 'triangle', de: 200, para: 55, pico: 0.4, dura: 0.18, em: t });
  });
}

/**
 * Headshot: o cérebro estourando (Cleber, 08/10/2026 — «meio gosmento»).
 *
 *   1. o estalo do crânio: ruído curto e seco;
 *   2. o «splorch»: ruído num filtro ressonante que despenca de agudo para
 *      grave, tremendo — é o som molhado;
 *   3. o baque grave da massa;
 *   4. a gosma borbulhando: bolhas que sobem, soltas;
 *   5. os pingos caindo depois.
 */
export function somCerebro(): void {
  tocar(c => {
    const t = c.currentTime + 0.02;
    // 1. Crack.
    chiado(c, { pico: 0.55, dura: 0.05, filtro: 'bandpass', freq: 2200, q: 1.5, em: t });
    // 2. Splorch: o filtro ressonante desce, e um tremido rápido no volume deixa molhado.
    const src = c.createBufferSource();
    src.buffer = ruido(c);
    src.playbackRate.value = 0.45;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 9;
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(260, t + 0.32);
    const treme = c.createGain();
    treme.gain.value = 0.55;
    const lfo = c.createOscillator();
    lfo.frequency.setValueAtTime(34, t);
    lfo.frequency.linearRampToValueAtTime(12, t + 0.4);
    const prof = c.createGain();
    prof.gain.value = 0.45;
    lfo.connect(prof);
    prof.connect(treme.gain);
    src.connect(f);
    f.connect(treme);
    treme.connect(envelope(c, 0.75, 0.01, 0.42, t));
    src.start(t, Math.random() * 0.6);
    lfo.start(t);
    src.stop(t + 0.5);
    lfo.stop(t + 0.5);
    // 3. A massa batendo.
    tom(c, { tipo: 'sine', de: 120, para: 38, pico: 0.55, dura: 0.22, em: t });
    // 4. Bolhas.
    for (let i = 0; i < 7; i++) bolha(c, t + entre(0.06, 0.45), entre(180, 420), entre(0.12, 0.22));
    // 5. Pingos.
    for (let i = 0; i < 6; i++) {
      chiado(c, { pico: entre(0.08, 0.16), dura: 0.03, filtro: 'bandpass', freq: entre(700, 1400), q: 4, em: t + entre(0.35, 1.0), taxa: 0.6 });
    }
  });
}

/** Tiro na parede: o «piu» do ricochete. */
export function somRicochete(): void {
  tocar(c => {
    chiado(c, { pico: 0.25, dura: 0.06, filtro: 'highpass', freq: 2500 });
    const t = c.currentTime + 0.02;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(2200, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.22);
    o.connect(envelope(c, 0.12, 0.004, 0.22, t));
    o.start(t);
    o.stop(t + 0.3);
  });
}

/** Algo bateu no chão. `forca` de 0 a 1. */
export function somBaque(forca: number): void {
  if (forca < 0.08) return;
  tocar(c => tom(c, { tipo: 'triangle', de: 150, para: 50, pico: 0.45 * forca, dura: 0.09 }));
}

/** O machado cravando no chão: tóc seco e o ferro vibrando. */
export function somCrava(): void {
  tocar(c => {
    chiado(c, { pico: 0.35, dura: 0.05, filtro: 'bandpass', freq: 600 });
    tom(c, { de: 320, para: 110, pico: 0.4, dura: 0.06 });
    tom(c, { tipo: 'triangle', de: 940, para: 900, pico: 0.12, dura: 0.45, em: c.currentTime + 0.02 });
  });
}

/** Coisa saltando para fora (a pizza da bag). */
export function somPop(): void {
  tocar(c => tom(c, { de: 380, para: 1100, pico: 0.2, dura: 0.08 }));
}

/** O cérebro caindo no chão: «plof» mole, com uma bolha. */
export function somPlof(): void {
  tocar(c => {
    chiado(c, { pico: 0.3, dura: 0.14, filtro: 'lowpass', freq: 900, freqFim: 200, q: 6, taxa: 0.4 });
    bolha(c, c.currentTime + 0.05, 260, 0.15);
  });
}

/**
 * O gemido de quando ele sai da cova: grave, arrastado, tremido. Bem
 * baixinho (Cleber, 08/10/2026: «só para ter alguma coisa ali») — é o primeiro
 * som que existiu; a versão com terra e vogal saiu, ele preferiu este.
 */
export function somGemido(): void {
  tocar(c => {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t);
    o.frequency.linearRampToValueAtTime(120, t + 0.35);
    o.frequency.linearRampToValueAtTime(70, t + 1.1);
    // O tremido da garganta podre.
    const lfo = c.createOscillator();
    lfo.frequency.value = 9;
    const prof = c.createGain();
    prof.gain.value = 7;
    lfo.connect(prof);
    prof.connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 520;
    o.connect(f);
    f.connect(envelope(c, GEMIDO, 0.12, 1.0, t));
    o.start(t); lfo.start(t);
    o.stop(t + 1.25); lfo.stop(t + 1.25);
  });
}
