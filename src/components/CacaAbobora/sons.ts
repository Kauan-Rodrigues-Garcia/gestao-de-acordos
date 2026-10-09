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

/**
 * Multiplica o volume do som que está sendo programado agora. O chefão põe a
 * dele aqui enquanto programa (`tocarChefao`); o resto da caça fica em 1.
 */
let escala = 1;

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
  const alto = Math.max(0.0002, pico * VOLUME * escala);
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
  // Com o chefão na tela, todo som da caça (o tiro, o ricochete, a morte)
  // toca na escala dele — não só os sons dele.
  escala = chefaoNaTela ? fatorDoChefao : 1;
  try { f(c); } catch { /* som é enfeite: nunca derruba a caça */ } finally { escala = 1; }
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
  tocar(gemido);
}

function gemido(c: AudioContext): void {
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
}

// ── O chefão (09/10/2026) ───────────────────────────────────────────────────
//
// O Rei do Pop zumbi. Os sons dele são curtos, porque se repetem muito (cento
// e tantas pessoas atirando).
//
// ## Sintetizado ou em arquivo
//
// Tudo tem a versão sintetizada (a trilha é ORIGINAL: um funk de 8 bits em mi
// menor). Se a pasta `PASTA_DO_CHEFAO` tiver os arquivos — a trilha, o
// «hee-hee» e os gritos —, eles tocam no lugar. A pasta está no `.gitignore`:
// é áudio de terceiros baixado por quem testa, e fica só no localhost dessa
// pessoa. No deploy não há arquivo, e toca o sintetizado.
//
// Os arquivos de voz trazem silêncio em volta e mais de um grito por arquivo:
// `prepararVozesDoChefao` corta cada trecho com som (`recortarTrechos`) e
// iguala o volume deles; cada «hee-hee» ou grito sorteia um trecho.
//
// ## O volume (09/10/2026 — «manter os volumes baixos»)
//
// Tudo do chefão passa por `fatorDoChefao`: o operador (todo mundo que não é
// super_admin) ouve SEMPRE a 12% (`VOLUME_DO_OPERADOR`) — era 50%, e ficou
// alto para quem está atendendo (09/10/2026). O super_admin ouve a 100% do que
// já é baixo.
//
// O «hee-hee» e os gritos são contidos: cada um tem um intervalo mínimo
// (`PAUSA_*`) e só toca numa parte das vezes (`chance`) — com cem pessoas
// atirando, ele desvia o tempo todo, e o grito virava ruído.

/** O operador ouve o chefão sempre a esta fração. */
export const VOLUME_DO_OPERADOR = 0.12;
/** Enquanto a cena do chefão está montada: aí TODO som da caça vai na escala dele. */
let chefaoNaTela = false;

/** O intervalo mínimo entre dois «hee-hee», e entre dois gritos. */
export const PAUSA_HEE_HEE_MS = 4_000;
export const PAUSA_GRITO_MS = 7_000;
let fatorDoChefao = VOLUME_DO_OPERADOR;

/**
 * Quem está na tela: super_admin ouve inteiro, o resto a `VOLUME_DO_OPERADOR`.
 * Vale para todo som da caça enquanto a cena do chefão estiver montada; a
 * função devolvida desfaz (a cena chama ao desmontar).
 */
export function volumeDoChefao(superAdmin: boolean): () => void {
  fatorDoChefao = superAdmin ? 1 : VOLUME_DO_OPERADOR;
  chefaoNaTela = true;
  for (const a of trilhasEmArquivo) a.volume = VOLUME_ARQUIVO * fatorDoChefao;
  return () => { chefaoNaTela = false; };
}

/** Programa um som do chefão, na escala dele (mesmo antes ou depois da cena). */
function tocarChefao(fn: (c: AudioContext) => void): void {
  tocar(c => {
    escala = fatorDoChefao;
    fn(c);
  });
}

// ── As vozes em arquivo ─────────────────────────────────────────────────────

export const PASTA_DO_CHEFAO = '/sons/chefao/';
type Voz = 'hee-hee' | 'gritos';

/** Um trecho com som dentro do arquivo, em segundos, e o ganho que o iguala aos outros. */
export interface Trecho { ini: number; fim: number; ganho: number }

/** O pico que todo trecho passa a ter, e o volume das vozes (baixo, como o resto). */
const PICO_ALVO = 0.8;
const VOLUME_VOZ = 0.32;

/**
 * Corta os trechos com som de um áudio: janelas de 20 ms, som é o que passa
 * de 8% do pico do arquivo, e um trecho acaba depois de 160 ms de silêncio.
 * Puro (recebe as amostras): testado sem navegador.
 */
export function recortarTrechos(amostras: Float32Array, taxa: number): Trecho[] {
  const jan = Math.max(1, Math.floor(taxa * 0.02));
  const rms: number[] = [];
  const picos: number[] = [];
  for (let i = 0; i + jan <= amostras.length; i += jan) {
    let soma = 0, pico = 0;
    for (let j = 0; j < jan; j++) { const v = amostras[i + j]; soma += v * v; pico = Math.max(pico, Math.abs(v)); }
    rms.push(Math.sqrt(soma / jan));
    picos.push(pico);
  }
  if (rms.length === 0) return [];
  const limite = Math.max(...rms) * 0.08;
  const trechos: Trecho[] = [];
  let ini = -1, quieto = 0;
  const fechar = (fim: number) => {
    const pico = Math.max(...picos.slice(ini, fim + 1), 0.0001);
    // Um pouco antes e depois: o começo e o fim da voz são baixos.
    trechos.push({
      ini: Math.max(0, ini * 0.02 - 0.04),
      fim: Math.min(amostras.length / taxa, (fim + 1) * 0.02 + 0.06),
      ganho: Math.min(4, PICO_ALVO / pico),
    });
  };
  rms.forEach((v, i) => {
    if (v > limite) { if (ini < 0) ini = i; quieto = 0; return; }
    if (ini >= 0 && ++quieto > 8) { fechar(i - quieto); ini = -1; quieto = 0; }
  });
  if (ini >= 0) fechar(rms.length - 1);
  // Estalo solto não é voz.
  return trechos.filter(t => t.fim - t.ini >= 0.1);
}

interface VozPronta { buffer: AudioBuffer; trechos: Trecho[] }
/** `undefined` = ainda não tentou; `null` = não tem o arquivo (toca o sintetizado). */
const vozes: Partial<Record<Voz, VozPronta | null>> = {};

/** Baixa e corta as vozes, uma vez por aba. Sem o arquivo, fica no sintetizado. */
export function prepararVozesDoChefao(): void {
  const c = contexto();
  if (!c) return;
  for (const voz of ['hee-hee', 'gritos'] as const) {
    if (voz in vozes) continue;
    vozes[voz] = null;
    void fetch(`${PASTA_DO_CHEFAO}${voz}.mp3`)
      .then(r => (r.ok && (r.headers.get('content-type') ?? '').startsWith('audio/') ? r.arrayBuffer() : null))
      .then(dados => (dados ? c.decodeAudioData(dados) : null))
      .then(buffer => {
        if (!buffer) return;
        const trechos = recortarTrechos(buffer.getChannelData(0), buffer.sampleRate);
        if (trechos.length) vozes[voz] = { buffer, trechos };
      })
      .catch((): void => undefined);
  }
}

/** Toca um trecho sorteado da voz. `false` = não tem o arquivo: quem chamou toca o sintetizado. */
function tocarVoz(voz: Voz): boolean {
  const v = vozes[voz];
  if (!v) return false;
  tocar(c => {
    const t = v.trechos[Math.floor(Math.random() * v.trechos.length)];
    const src = c.createBufferSource();
    src.buffer = v.buffer;
    const g = c.createGain();
    g.gain.value = VOLUME_VOZ * t.ganho * fatorDoChefao;
    src.connect(g);
    g.connect(c.destination);
    src.start(c.currentTime, t.ini, t.fim - t.ini);
  });
  return true;
}

/** Acerto no chefão: um «tum» curto (a cabeça, um estalo mais agudo por cima). */
export function somAcertoChefao(cabeca: boolean): void {
  tocarChefao(c => {
    chiado(c, { pico: 0.3, dura: 0.07, filtro: 'lowpass', freq: 1600, freqFim: 500, taxa: 0.6 });
    tom(c, { tipo: 'triangle', de: 190, para: 70, pico: 0.32, dura: 0.08 });
    if (cabeca) tom(c, { de: 1200, para: 700, pico: 0.14, dura: 0.06, em: c.currentTime + 0.01 });
  });
}

/** Um gritinho em falsete: sobe de `de` a `para`, tremido. */
function falsete(c: AudioContext, em: number, de: number, para: number, dura: number, pico: number, volta?: number): void {
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(de, em);
  o.frequency.exponentialRampToValueAtTime(para, em + dura * 0.6);
  if (volta) o.frequency.exponentialRampToValueAtTime(volta, em + dura);
  const vib = c.createOscillator();
  vib.frequency.value = 26;
  const prof = c.createGain();
  prof.gain.value = para * 0.035;
  vib.connect(prof);
  prof.connect(o.frequency);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1400;
  f.Q.value = 0.8;
  o.connect(f);
  f.connect(envelope(c, pico, 0.006, dura, em));
  o.start(em); vib.start(em);
  o.stop(em + dura + 0.05); vib.stop(em + dura + 0.05);
}

/**
 * O «hee-hee!» do desvio: o do arquivo, se houver; senão dois gritinhos
 * subindo. `chance` = em que parte das vezes toca; e nunca antes de
 * `PAUSA_HEE_HEE_MS` do último — a não ser `forcar` (o da chegada).
 */
let ultimoHeeHee = -Infinity;
export function somHeeHee(chance = 1, forcar = false): void {
  const agora = performance.now();
  if (!forcar && (agora - ultimoHeeHee < PAUSA_HEE_HEE_MS || Math.random() >= chance)) return;
  ultimoHeeHee = agora;
  if (tocarVoz('hee-hee')) return;
  tocarChefao(c => {
    const t = c.currentTime;
    falsete(c, t, 900, 1500, 0.11, 0.14);
    falsete(c, t + 0.16, 1000, 1750, 0.11, 0.14);
  });
}

// ── O banquete (09/10/2026) ─────────────────────────────────────────────────

/** A vítima aparece: um «aaah!» agudo que sobe e despenca. Sintetizado — não é voz de ninguém. */
export function somSocorro(): void {
  tocarChefao(c => {
    const t = c.currentTime;
    falsete(c, t, 700, 1250, 0.55, 0.12, 520);
    falsete(c, t + 0.62, 800, 1100, 0.4, 0.09, 450);
  });
}

/** Uma mordida: o estalo molhado, o baque grave e uma bolha. Toca em parte das vezes: são muitas. */
export function somNhac(chance = 1): void {
  if (Math.random() >= chance) return;
  tocarChefao(c => {
    const t = c.currentTime;
    chiado(c, { pico: 0.26, dura: 0.07, filtro: 'bandpass', freq: 950, freqFim: 280, q: 2.5, em: t });
    tom(c, { tipo: 'triangle', de: 150, para: 55, pico: 0.24, dura: 0.09, em: t });
    bolha(c, t + 0.06, entre(170, 320), 0.09);
  });
}

/** Acabou de comer: o arroto, grave e tremido. */
export function somArroto(): void {
  tocarChefao(c => {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(62, t + 0.55);
    const vib = c.createOscillator();
    vib.frequency.value = 17;
    const prof = c.createGain();
    prof.gain.value = 9;
    vib.connect(prof);
    prof.connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 520;
    f.Q.value = 3;
    o.connect(f);
    f.connect(envelope(c, 0.32, 0.03, 0.5, t));
    o.start(t); vib.start(t);
    o.stop(t + 0.6); vib.stop(t + 0.6);
    chiado(c, { pico: 0.08, dura: 0.4, filtro: 'lowpass', freq: 700, em: t + 0.02, taxa: 0.5 });
  });
}

/** O grito do chute e de quando perde um braço: o do arquivo, ou um «OW!» que sobe e cai. */
let ultimoGrito = -Infinity;
export function somAu(chance = 1): void {
  const agora = performance.now();
  if (agora - ultimoGrito < PAUSA_GRITO_MS || Math.random() >= chance) return;
  ultimoGrito = agora;
  if (tocarVoz('gritos')) return;
  tocarChefao(c => falsete(c, c.currentTime, 650, 1350, 0.28, 0.16, 900));
}

/** O «shh» do pé deslizando no moonwalk: bem baixinho, é textura. */
export function somMoonwalk(): void {
  tocarChefao(c => chiado(c, { pico: 0.1, dura: 0.12, filtro: 'bandpass', freq: 2400, freqFim: 900, q: 1.4, ataque: 0.02, taxa: 0.8 }));
}

/** O pulo: um «fiu» que sobe. */
export function somPulo(): void {
  tocarChefao(c => {
    chiado(c, { pico: 0.12, dura: 0.14, filtro: 'bandpass', freq: 700, freqFim: 2600, q: 2, ataque: 0.02 });
    tom(c, { de: 260, para: 620, pico: 0.08, dura: 0.12 });
  });
}

/** A aterrissagem: o baque dos dois pés. */
export function somPouso(): void {
  tocarChefao(c => {
    tom(c, { tipo: 'triangle', de: 150, para: 55, pico: 0.3, dura: 0.1 });
    chiado(c, { pico: 0.12, dura: 0.08, filtro: 'lowpass', freq: 900 });
  });
}

/** O braço saindo: o rasgo, o esguicho e o baque. */
export function somArranca(): void {
  tocarChefao(rasgo);
  somAu();
}

/** Um pedaço da vítima saindo (o banquete): o mesmo rasgo, sem o grito dele. */
export function somRasga(): void {
  tocarChefao(rasgo);
}

/** O rasgo, o esguicho e o baque: o braço dele saindo, ou um pedaço da vítima. */
function rasgo(c: AudioContext): void {
  const t = c.currentTime;
  // O rasgo: ruído cortado em pedacinhos, cada vez mais grave.
  for (let i = 0; i < 9; i++) {
    chiado(c, { pico: entre(0.2, 0.35), dura: 0.025, filtro: 'bandpass', freq: 2600 - i * 220, q: 3, em: t + i * 0.022 });
  }
  // O esguicho molhado.
  chiado(c, { pico: 0.4, dura: 0.38, filtro: 'lowpass', freq: 1800, freqFim: 300, q: 6, em: t + 0.18, taxa: 0.5 });
  for (let i = 0; i < 5; i++) bolha(c, t + entre(0.25, 0.6), entre(200, 380), 0.14);
  tom(c, { tipo: 'sine', de: 120, para: 40, pico: 0.4, dura: 0.2, em: t + 0.2 });
}

/**
 * A Fúria do Rei: um zumbido subindo (os olhos acendendo), um brilho de
 * arpejo e o «hee-hee».
 */
export function somFuria(): void {
  tocarChefao(c => {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.6);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + 0.6);
    f.Q.value = 6;
    o.connect(f);
    f.connect(envelope(c, 0.16, 0.4, 0.15, t, 0.05));
    o.start(t);
    o.stop(t + 0.75);
    [659.3, 784, 987.8, 1318.5, 1568, 1975.5].forEach((fr, i) => {
      tom(c, { de: fr, para: fr, pico: 0.12, dura: 0.07, em: t + 0.62 + i * 0.05 });
    });
  });
  setTimeout(() => somHeeHee(), 900);
}

/**
 * Ele chega: a porta rangendo, o trovão e o uivo ao longe — o começo de
 * filme de terror — e o gemido por baixo.
 */
export function somChefaoChega(): void {
  tocarChefao(c => {
    const t = c.currentTime;
    // A porta rangendo: uma serra presa num filtro estreito, a frequência tremendo.
    const porta = c.createOscillator();
    porta.type = 'sawtooth';
    porta.frequency.setValueAtTime(70, t);
    porta.frequency.linearRampToValueAtTime(110, t + 0.5);
    porta.frequency.linearRampToValueAtTime(60, t + 0.9);
    const range = c.createOscillator();
    range.frequency.value = 23;
    const rProf = c.createGain();
    rProf.gain.value = 30;
    range.connect(rProf);
    rProf.connect(porta.frequency);
    const fp = c.createBiquadFilter();
    fp.type = 'bandpass';
    fp.frequency.value = 1100;
    fp.Q.value = 9;
    porta.connect(fp);
    fp.connect(envelope(c, 0.3, 0.08, 0.5, t, 0.35));
    porta.start(t); range.start(t);
    porta.stop(t + 1); range.stop(t + 1);
    // O trovão: ruído grave, longo, que ronca.
    chiado(c, { pico: 0.5, dura: 1.6, filtro: 'lowpass', freq: 500, freqFim: 90, q: 0.7, em: t + 0.7, ataque: 0.03, taxa: 0.35 });
    chiado(c, { pico: 0.3, dura: 0.12, filtro: 'highpass', freq: 1500, em: t + 0.7 });
    // O uivo: sobe, segura tremendo, cai.
    const uivo = c.createOscillator();
    uivo.type = 'triangle';
    const u0 = t + 1.5;
    uivo.frequency.setValueAtTime(320, u0);
    uivo.frequency.exponentialRampToValueAtTime(720, u0 + 0.5);
    uivo.frequency.setValueAtTime(720, u0 + 1.1);
    uivo.frequency.exponentialRampToValueAtTime(420, u0 + 1.8);
    const uv = c.createOscillator();
    uv.frequency.value = 5.5;
    const uvp = c.createGain();
    uvp.gain.value = 14;
    uv.connect(uvp);
    uvp.connect(uivo.frequency);
    uivo.connect(envelope(c, 0.13, 0.35, 0.6, u0, 0.85));
    uivo.start(u0); uv.start(u0);
    uivo.stop(u0 + 1.9); uv.stop(u0 + 1.9);
  });
  tocarChefao(gemido);
}

/**
 * O tique da contagem, nos últimos segundos antes de ele chegar: um «toc» de
 * relógio; nos três últimos, mais agudo. Baixinho, como tudo do chefão.
 */
export function somTique(final: boolean): void {
  tocarChefao(c => {
    tom(c, { tipo: 'square', de: final ? 1320 : 880, para: final ? 1320 : 880, pico: 0.12, dura: 0.05 });
    chiado(c, { pico: 0.08, dura: 0.02, filtro: 'highpass', freq: 3000 });
  });
}

/** Ele cai: um acorde subindo em vitória, e o baque. */
export function somChefaoCai(): void {
  tocarChefao(c => {
    const t = c.currentTime;
    [261.6, 329.6, 392, 523.3].forEach((f, i) => {
      tom(c, { de: f, para: f, pico: 0.22, dura: 0.16, em: t + 0.1 + i * 0.11 });
    });
    tom(c, { tipo: 'triangle', de: 130, para: 40, pico: 0.5, dura: 0.3, em: t });
  });
}

// ── A trilha ────────────────────────────────────────────────────────────────

/**
 * A trilha em arquivo, se estiver na pasta do chefão (só no localhost de quem
 * a pôs lá). Sem ela — o normal —, toca a trilha sintetizada abaixo.
 */
export const ARQUIVO_DA_TRILHA = `${PASTA_DO_CHEFAO}trilha.mp3`;
/**
 * Onde a música começa no arquivo, em segundos: 1:25, na parte mais
 * conhecida (09/10/2026 — «começar em 01:25 para pegar a parte do Thriller»).
 * 85,1 s cai colado no bumbo de 85,2 s (medido no arquivo): entra no tempo.
 * Quando acaba, volta para cá.
 */
export const INICIO_DA_TRILHA_S = 85.1;
/** O volume do arquivo, de 0 a 1, antes do fator do chefão: fundo, não festa. */
const VOLUME_ARQUIVO = 0.2;
/** As trilhas em arquivo tocando agora (para o volume mudar na hora). */
const trilhasEmArquivo = new Set<HTMLAudioElement>();

/** 116 batidas por minuto, em semicolcheias. */
const SEMI = 60 / 116 / 4;
/** Quatro compassos: mi menor, mi menor, dó, ré. As fundamentais do baixo (Hz). */
const RAIZES = [82.41, 82.41, 65.41, 73.42] as const;
/** Os acordes, para os ataques e o arpejo da Fúria. */
const ACORDES = [
  [329.6, 392, 493.9], [329.6, 392, 493.9], [261.6, 329.6, 392], [293.7, 370, 440],
] as const;
/** O baixo de cada compasso, em semitons acima da fundamental (null = pausa). */
const LINHA_DO_BAIXO: readonly (number | null)[] = [0, null, 0, 12, null, 0, 10, null, 0, null, 7, null, 10, 12, null, 7];

const semitom = (f: number, s: number) => f * 2 ** (s / 12);

export interface Trilha {
  parar(): void;
  /** Na Fúria do Rei, entra o arpejo e o chimbal dobra. */
  furia(ligada: boolean): void;
}

/**
 * A trilha do chefão, enquanto ele dança. Programa meio segundo à frente de
 * cada vez, como se faz com WebAudio.
 */
export function tocarTrilha(): Trilha {
  let parado = false;
  let furia = false;
  let pararSintese: (() => void) | null = null;
  let audio: HTMLAudioElement | null = null;

  const sintese = () => {
    const c = contexto();
    if (!c || parado) return;
    let proximo = c.currentTime + 0.12;
    let passo = 0;
    const programar = () => {
      if (parado) return;
      escala = fatorDoChefao;
      try {
        while (proximo < c.currentTime + 0.5) {
          const compasso = Math.floor(passo / 16) % 4;
          const s = passo % 16;
          const raiz = RAIZES[compasso];
          const nota = LINHA_DO_BAIXO[s];
          if (nota !== null) tom(c, { tipo: 'square', de: semitom(raiz, nota), para: semitom(raiz, nota), pico: 0.16, dura: SEMI * 0.85, em: proximo });
          // Bumbo a cada tempo, caixa no 2 e no 4.
          if (s % 4 === 0) tom(c, { tipo: 'sine', de: 140, para: 42, pico: 0.3, dura: 0.11, em: proximo });
          if (s === 4 || s === 12) {
            chiado(c, { pico: 0.18, dura: 0.09, filtro: 'highpass', freq: 1400, em: proximo });
            tom(c, { tipo: 'triangle', de: 230, para: 160, pico: 0.1, dura: 0.06, em: proximo });
          }
          // Chimbal: colcheias (semicolcheias na Fúria), aberto no fim do compasso.
          if (s === 14) chiado(c, { pico: 0.07, dura: 0.14, filtro: 'highpass', freq: 6000, em: proximo });
          else if (s % 2 === 0 || furia) chiado(c, { pico: 0.05, dura: 0.025, filtro: 'highpass', freq: 7000, em: proximo });
          // Os ataques do acorde, no contratempo.
          if (s === 6 || s === 14) {
            for (const f of ACORDES[compasso]) tom(c, { tipo: 'triangle', de: f, para: f, pico: 0.05, dura: SEMI * 1.6, em: proximo });
          }
          // Na Fúria: o arpejo correndo uma oitava acima.
          if (furia) {
            const acorde = ACORDES[compasso];
            const f = acorde[s % 3] * (s % 6 < 3 ? 2 : 4);
            tom(c, { tipo: 'square', de: f, para: f, pico: 0.035, dura: SEMI * 0.7, em: proximo });
          }
          proximo += SEMI;
          passo += 1;
        }
      } catch { /* som é enfeite */ } finally { escala = 1; }
    };
    programar();
    const t = setInterval(programar, 150);
    pararSintese = () => clearInterval(t);
  };

  void fetch(ARQUIVO_DA_TRILHA, { method: 'HEAD' })
    .then(r => {
      if (parado) return;
      const tipo = r.headers.get('content-type') ?? '';
      if (!r.ok || !tipo.startsWith('audio/')) { sintese(); return; }
      audio = new Audio(`${ARQUIVO_DA_TRILHA}#t=${INICIO_DA_TRILHA_S}`);
      const pular = (a: HTMLAudioElement) => { if (a.currentTime < INICIO_DA_TRILHA_S - 0.5) a.currentTime = INICIO_DA_TRILHA_S; };
      // `#t=` já começa ali; o resto garante (nem todo navegador respeita) e faz o laço.
      audio.addEventListener('loadedmetadata', e => pular(e.currentTarget as HTMLAudioElement), { once: true });
      audio.addEventListener('ended', e => {
        const a = e.currentTarget as HTMLAudioElement;
        a.currentTime = INICIO_DA_TRILHA_S;
        void a.play().catch((): void => undefined);
      });
      audio.volume = VOLUME_ARQUIVO * fatorDoChefao;
      trilhasEmArquivo.add(audio);
      // Navegador sem clique ainda não deixa tocar: cai na síntese, que espera do mesmo jeito.
      const este = audio;
      void este.play().catch(() => {
        // Ainda sem clique na página: espera o primeiro e tenta de novo.
        const tentar = () => { if (!parado && audio === este) void este.play().catch((): void => undefined); };
        window.addEventListener('pointerdown', tentar, { once: true });
        window.addEventListener('keydown', tentar, { once: true });
      });
    })
    .catch(() => { if (!parado) sintese(); });

  return {
    parar() {
      parado = true;
      pararSintese?.();
      if (audio) { audio.pause(); trilhasEmArquivo.delete(audio); audio = null; }
    },
    furia(ligada) {
      furia = ligada;
      if (audio) audio.playbackRate = ligada ? 1.06 : 1;
    },
  };
}
