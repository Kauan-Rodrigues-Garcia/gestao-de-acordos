/**
 * trilha.ts — os sons da Coisa (pedido de 29/10/2026: «verifique nas pastas
 * os sons dos efeitos sonoros, tanto balão estourando, ele informando que irá
 * flutuar; pegue os minutos exatos para encaixar a trilha sonora antes dele
 * aparecer, a música dele dançando, ele abrindo a boca»).
 *
 * Cada arquivo em `public/sons/coisa/` é um trecho cortado dos áudios que o
 * Cleber baixou (o tempo medido pela fala, com o whisper, e pelo volume):
 *
 *   ola        «IT 2 Sound Effect - HELLO»             0,00 a 7,50 s  o «hello»
 *              aos 0,25 s e o golpe da música aos 2,75 s, junto do estouro
 *              dos balões da abertura (2,9 s)
 *   balao      «Balloon POP Sound Effect»              4,05 a 4,75 s
 *   apresenta  «IT BEM VINDOS A DERRY»               68,85 a 77,75 s  «Permitam-me
 *              apresentar o inigualável Pennywise, um palhaço dançarino»; a
 *              última sílaba vai de 8,0 a 8,35 s do trecho (até 29/10 o corte
 *              era 76,95 s e comia o «-no»), abaixando nos últimos 0,35 s. A
 *              dança só começa depois de `FIM_DA_APRESENTACAO` (`cena.ts`)
 *   danca      «Pennywise Dance and The Dead Lights»  28,30 a 41,98 s  (pedido
 *              de 29/10: «0:29 a 42 segundos»): o golpe da dança cai aos
 *              28,33 s do original, por isso o corte começa ali e não no 0:29
 *              cheio; termina antes do golpe dos 42,00 s, abaixando nos
 *              últimos 0,35 s. Desde 29/10 («reduz o tempo da música com a
 *              dança, tá muito comprido») a dança em `cena.ts` usa só os
 *              primeiros `DURA_DA_DANCA` segundos, e a música abaixa quando
 *              ela para (`ACoisa.tsx`)
 *   flutua     «It 2017 we all float down here»        22,30 a 31,00 s  «You'll
 *              float down here. We'll float down here. Yes, we do.» até 5,8 s
 *              do trecho, e a risada até o fim
 *   luzes      «Pennywise Dance and The Dead Lights»  64,60 a 74,10 s  as luzes
 *              mortas, com as crianças flutuando
 *   risada     «IT Pennywise laugh sound effect»       0,15 a 5,00 s
 *   tema       «Soundtrack It (Theme Song - Epic Music)»  0 a 96,95 s  (pedido
 *              de 29/10: «no final fica sem música, extenda»): o original
 *              some aos 97 s (silêncio até 102,5 s). Os 33–49 s voltam iguais
 *              aos 81–97 s, 1,47× mais altos; então o fim desce até esse
 *              volume nos últimos 3 s, funde em 0,3 s no que antecede os
 *              48,95 s e o laço (`LACO_DO_TEMA`) volta para lá: a primeira
 *              vez toca do começo, depois repete 48,95–96,95 s sem buraco.
 *              Depois do fim há 1 s de folga (o começo do laço), para o
 *              `<audio>`, que pula atrasado
 *
 * Os trechos tocam pelo Web Audio, já decodificados (`prepararSonsDaCoisa`):
 * sem a espera de baixar e abrir o mp3 na hora, o som sai no quadro em que a
 * fase muda. Se o trecho ainda não chegou, cai no `<audio>` de antes.
 *
 * O som anda na velocidade do mural (o painel de teste), como as animações.
 * Tocar sem um clique antes na página pode ser barrado pelo navegador: aí
 * fica mudo, sem erro — o som é reforço.
 *
 * O volume geral (pedido de 29/10/2026: «uma opção de ajustar o som desde o
 * início da animação até o mural») passa por tudo: um ganho só no Web Audio
 * e a conta em cada `<audio>`. Fica guardado neste navegador
 * (`ControleDeSom.tsx`).
 */
import { useSyncExternalStore } from 'react';

export type SomDaCoisa = 'ola' | 'balao' | 'apresenta' | 'danca' | 'flutua' | 'luzes' | 'risada' | 'tema';

/**
 * A mixagem (29/10/2026: «faz uma correção dos sons e mixagem melhor»): o
 * ganho de cada trecho sai do volume medido dele (o RMS da metade mais alta,
 * em janelas de 0,4 s, decodificado no Chromium) até o alvo do papel dele:
 *
 *   trecho      medido   alvo    as falas na frente, a música da cena logo
 *   apresenta   −22,6    −20     atrás, os efeitos no meio e o tema do mural
 *   flutua      −16,8    −20     bem embaixo de tudo (ele toca o tempo todo
 *   danca       −18,8    −22     e abaixa sozinho quando outro som entra:
 *   luzes       −22,3    −22     `abaixarOTema`)
 *   ola         −14,9    −21
 *   balao       −16,3    −22
 *   risada      −12,5    −22
 *   tema        −12,1    −26
 */
const VOLUME: Readonly<Record<SomDaCoisa, number>> = {
  ola: 0.5,
  balao: 0.52,
  apresenta: 1.35,
  danca: 0.69,
  flutua: 0.69,
  luzes: 1.03,
  risada: 0.33,
  tema: 0.2,
};
/** Um trecho tocado antes do navegador liberar o som só sai se a liberação vier em até isto. */
const ATRASO_MAX_MS = 400;

/** Quanto dura a dança (a fase `dancando` em `cena.ts`): a metade do trecho, que tem 13,68 s. */
export const DURA_DA_DANCA = 7;

/** Do balão sair (a apresentação começar) até a fala acabar: antes disso, não dança. */
export const FIM_DA_APRESENTACAO = 8.45;

/** O laço do tema, em segundos do arquivo: chegou no fim, volta ao começo. */
export const LACO_DO_TEMA = { de: 48.95, ate: 96.95 } as const;

/** Um trecho tocando: dá para abaixar até calar. */
export interface Tocando {
  calar(ms: number): void;
}

const tocando = new Set<Tocando>();
/** O último de cada trecho e quando começou. */
const ultimo = new Map<SomDaCoisa, { som: Tocando; em: number }>();
/** O mesmo trecho duas vezes em menos que isso é um só (o StrictMode monta duas vezes). */
const REPETIDO_MS = 150;

let contexto: AudioContext | null = null;
/**
 * A saída: todo trecho entra no compressor (que segura os picos quando dois
 * se encontram, como os estouros em cima do «hello») e depois no volume
 * geral, já no fim, para o compressor trabalhar igual em qualquer volume.
 */
let mestre: GainNode | null = null;
let entrada: AudioNode | null = null;
/** O tema tocando agora, para abaixar quando outro som entra. */
let temaNoAr: { ganho: GainNode; vol: number } | null = null;
const prontos = new Map<SomDaCoisa, AudioBuffer>();

// ── O volume geral ──────────────────────────────────────────────────────────

/** A chave mudou em 29/10/2026 com o padrão novo: quem mexeu antes volta para 25%. */
const CHAVE_VOLUME = 'portal-outubro:volume:2';
/** O volume de quem nunca mexeu (pedido de 29/10/2026: «o volume padrão agora será 25%»). */
export const VOLUME_PADRAO = 0.25;

function lerVolume(): number {
  try {
    const cru = localStorage.getItem(CHAVE_VOLUME);
    const n = Number(cru);
    return cru === null || !Number.isFinite(n) ? VOLUME_PADRAO : Math.max(0, Math.min(1, n));
  } catch {
    return VOLUME_PADRAO;
  }
}

let volume = typeof window === 'undefined' ? VOLUME_PADRAO : lerVolume();
const ouvintesDoVolume = new Set<() => void>();
/** Os `<audio>` tocando, com o volume de cada um antes do geral. */
const audios = new Map<HTMLAudioElement, number>();

export function volumeDoPortal(): number {
  return volume;
}

/** De 0 a 1; vale na hora para o que já está tocando. */
export function mudarVolumeDoPortal(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(CHAVE_VOLUME, String(volume)); } catch { /* sem armazenamento: vale até fechar */ }
  if (mestre && contexto) mestre.gain.setTargetAtTime(volume, contexto.currentTime, 0.03);
  for (const [a, base] of audios) a.volume = Math.min(1, base * volume);
  for (const o of ouvintesDoVolume) o();
}

export function useVolumeDoPortal(): number {
  return useSyncExternalStore(o => { ouvintesDoVolume.add(o); return () => { ouvintesDoVolume.delete(o); }; }, () => volume, () => VOLUME_PADRAO);
}
/** O download de cada trecho (resolve decodificado ou não). */
const baixando = new Map<SomDaCoisa, Promise<void>>();

function arquivo(som: SomDaCoisa): string {
  return `/sons/coisa/${som}.mp3`;
}

function oContexto(): AudioContext | null {
  if (contexto) return contexto;
  const Ctx = typeof window === 'undefined' ? undefined
    : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try { contexto = new Ctx(); } catch { return null; }
  mestre = contexto.createGain();
  mestre.gain.value = volume;
  mestre.connect(contexto.destination);
  try {
    const comp = contexto.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    comp.connect(mestre);
    entrada = comp;
  } catch {
    entrada = mestre;
  }
  return contexto;
}

/**
 * Destrava o som do navegador dentro de um clique (o «Participar»): a
 * revelação começa dois minutos depois, sem clique nenhum, e precisa dele já
 * liberado. Também começa a baixar os trechos.
 */
export function destravarSom(): void {
  const ctx = oContexto();
  if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
  void prepararSonsDaCoisa();
}

/** Abaixa o tema enquanto outro som toca (`ms`), e ele volta devagar. */
function abaixarOTema(ctx: AudioContext, ms: number) {
  if (!temaNoAr) return;
  const { ganho, vol } = temaNoAr, agora = ctx.currentTime;
  ganho.gain.cancelScheduledValues(agora);
  ganho.gain.setValueAtTime(ganho.gain.value, agora);
  ganho.gain.setTargetAtTime(vol * 0.4, agora, 0.06);
  ganho.gain.setTargetAtTime(vol, agora + ms / 1000, 0.45);
}

/**
 * Baixa e decodifica os trechos antes da hora (a abertura e o mural chamam);
 * resolve quando todos chegaram (ou falharam: aí tocam pelo `<audio>`).
 */
export function prepararSonsDaCoisa(): Promise<void> {
  const ctx = oContexto();
  if (!ctx) return Promise.resolve();
  return Promise.all((Object.keys(VOLUME) as SomDaCoisa[]).map(som => {
    const indo = baixando.get(som);
    if (indo) return indo;
    const p = fetch(arquivo(som))
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then(dados => ctx.decodeAudioData(dados))
      .then(buf => { prontos.set(som, buf); })
      .catch(() => { baixando.delete(som); /* tenta de novo na próxima vez */ });
    baixando.set(som, p);
    return p;
  })).then(() => {});
}

/**
 * Pelo Web Audio: começa na hora, e o laço emenda sem buraco. Com o som
 * ainda travado pelo navegador, o trecho só sai se destravar logo
 * (`ATRASO_MAX_MS`); senão fica mudo. Antes, os trechos pedidos com o som
 * travado ficavam na fila e saíam todos juntos no primeiro clique.
 */
function tocarDecodificado(ctx: AudioContext, buf: AudioBuffer, vol: number, v: number, laco: boolean): Tocando {
  const fonte = ctx.createBufferSource();
  fonte.buffer = buf;
  fonte.loop = laco;
  if (laco) { fonte.loopStart = LACO_DO_TEMA.de; fonte.loopEnd = LACO_DO_TEMA.ate; }
  const rate = Math.max(0.5, Math.min(4, v));
  fonte.playbackRate.value = rate;
  const ganho = ctx.createGain();
  ganho.gain.value = vol;
  fonte.connect(ganho).connect(entrada ?? ctx.destination);
  let calado = false, comecou = false;
  const som: Tocando = {
    calar(ms) {
      calado = true;
      tocando.delete(som);
      if (temaNoAr?.ganho === ganho) temaNoAr = null;
      if (!comecou) return;
      const agora = ctx.currentTime, s = Math.max(0.01, ms / 1000);
      ganho.gain.cancelScheduledValues(agora);
      ganho.gain.setValueAtTime(ganho.gain.value, agora);
      ganho.gain.linearRampToValueAtTime(0, agora + s);
      try { fonte.stop(agora + s); } catch { /* já parou */ }
    },
  };
  fonte.onended = () => { tocando.delete(som); if (temaNoAr?.ganho === ganho) temaNoAr = null; };
  const comecar = () => {
    if (calado) return;
    comecou = true;
    if (laco) temaNoAr = { ganho, vol };
    else abaixarOTema(ctx, (buf.duration / rate) * 1000);
    try { fonte.start(); } catch { tocando.delete(som); }
  };
  if (ctx.state === 'running') comecar();
  else {
    const pedido = performance.now();
    ctx.resume().then(
      () => { if (laco || performance.now() - pedido < ATRASO_MAX_MS) comecar(); else som.calar(0); },
      () => som.calar(0),
    );
  }
  return som;
}

/** Pelo `<audio>`, quando o trecho ainda não foi decodificado. */
function tocarPeloAudio(som: SomDaCoisa, vol: number, v: number, laco: boolean): Tocando {
  const a = new Audio(arquivo(som));
  a.volume = Math.min(1, vol * volume);
  audios.set(a, vol);
  a.playbackRate = Math.max(0.5, Math.min(4, v));
  // O `<audio>` não tem início de laço: o `timeupdate` (a cada ~0,25 s) pula
  // de volta, e a folga depois do fim cobre o atraso.
  const pular = () => {
    if (a.currentTime >= LACO_DO_TEMA.ate) a.currentTime -= LACO_DO_TEMA.ate - LACO_DO_TEMA.de;
  };
  if (laco) {
    a.addEventListener('timeupdate', pular);
    // Passou da folga (aba em segundo plano): retoma do começo do laço.
    a.addEventListener('ended', () => {
      if (!tocando.has(t)) return;
      a.currentTime = LACO_DO_TEMA.de;
      void a.play().catch(() => tocando.delete(t));
    });
  }
  const t: Tocando = {
    calar(ms) {
      tocando.delete(t);
      audios.delete(a);
      const de = a.volume;
      const comeco = performance.now();
      const id = window.setInterval(() => {
        const k = Math.min(1, (performance.now() - comeco) / Math.max(1, ms));
        a.volume = de * (1 - k);
        if (k >= 1) { window.clearInterval(id); a.pause(); }
      }, 40);
    },
  };
  if (!laco) a.addEventListener('ended', () => { tocando.delete(t); audios.delete(a); }, { once: true });
  void a.play().catch(() => tocando.delete(t));
  return t;
}

/** Toca um trecho do começo (o `tema` fica em laço até calar); devolve para calar depois. */
export function tocarSomDaCoisa(som: SomDaCoisa, v = 1, ganho = 1): Tocando | null {
  if (typeof Audio === 'undefined') return null;
  const antes = ultimo.get(som);
  if (antes && performance.now() - antes.em < REPETIDO_MS) return antes.som;
  const vol = Math.max(0, Math.min(1.5, VOLUME[som] * ganho));
  const laco = som === 'tema';
  try {
    const buf = prontos.get(som);
    const ctx = contexto;
    const t = buf && ctx ? tocarDecodificado(ctx, buf, vol, v, laco) : tocarPeloAudio(som, vol, v, laco);
    ultimo.set(som, { som: t, em: performance.now() });
    tocando.add(t);
    return t;
  } catch {
    return null;
  }
}

/** Abaixa até calar, em `ms`. */
export function calarSom(t: Tocando | null | undefined, ms = 400): void {
  t?.calar(ms);
}

/** Cala o último deste trecho, se ainda estiver tocando. */
export function calarSomDaCoisa(som: SomDaCoisa, ms = 400): void {
  const t = ultimo.get(som)?.som;
  if (t && tocando.has(t)) t.calar(ms);
}

/**
 * Uma bolha estourando (pedido de 29/10/2026: o F do player do mural),
 * feita na hora: um «plop» com o tom subindo, cada vez num tom, e o estalo.
 */
export function tocarBolha(): void {
  const ctx = oContexto();
  const saida = entrada ?? mestre;
  if (!ctx || !saida) return;
  // A bolha vem de um clique ou de uma tecla: o som já pode tocar.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  try {
    abaixarOTema(ctx, 160);
    const t = ctx.currentTime, tom = 380 + Math.random() * 260;
    const osc = ctx.createOscillator(), ganho = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(tom, t);
    osc.frequency.exponentialRampToValueAtTime(tom * 3.2, t + 0.07);
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(0.35, t + 0.006);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(ganho).connect(saida);
    osc.start(t);
    osc.stop(t + 0.15);
    // O estalo: um chiado curtinho, só nos agudos.
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const estalo = ctx.createBufferSource(), agudo = ctx.createBiquadFilter(), ganhoDoEstalo = ctx.createGain();
    estalo.buffer = buf;
    agudo.type = 'highpass';
    agudo.frequency.value = 2200;
    ganhoDoEstalo.gain.value = 0.12;
    estalo.connect(agudo).connect(ganhoDoEstalo).connect(saida);
    estalo.start(t);
  } catch { /* o som é reforço */ }
}

/** Cala tudo o que a Coisa está tocando (a tela fechou). */
export function calarSonsDaCoisa(ms = 300): void {
  for (const t of [...tocando]) t.calar(ms);
}
