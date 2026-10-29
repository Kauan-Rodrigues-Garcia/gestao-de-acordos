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
 *   apresenta  «IT BEM VINDOS A DERRY»               68,85 a 76,95 s  «Permitam-me
 *              apresentar o inigualável Pennywise, um palhaço dançarino»; a
 *              última palavra acaba aos 7,85 s do trecho, quando ela começa a
 *              dançar (`cena.ts` mede o balão por isso)
 *   danca      «Pennywise Dance and The Dead Lights»  28,30 a 41,98 s  (pedido
 *              de 29/10: «0:29 a 42 segundos»): o golpe da dança cai aos
 *              28,33 s do original, por isso o corte começa ali e não no 0:29
 *              cheio; termina antes do golpe dos 42,00 s, abaixando nos
 *              últimos 0,35 s. A dança em `cena.ts` dura o trecho inteiro
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
 */

export type SomDaCoisa = 'ola' | 'balao' | 'apresenta' | 'danca' | 'flutua' | 'luzes' | 'risada' | 'tema';

const VOLUME: Readonly<Record<SomDaCoisa, number>> = {
  ola: 0.75,
  balao: 0.9,
  apresenta: 1,
  danca: 0.8,
  flutua: 1,
  luzes: 0.85,
  risada: 0.9,
  tema: 0.45,
};

/** Quanto dura o trecho da dança (a fase `dancando` em `cena.ts` dura isso). */
export const DURA_DA_DANCA = 13.68;

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
const prontos = new Map<SomDaCoisa, AudioBuffer>();
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
  return contexto;
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

/** Pelo Web Audio: começa na hora, e o laço emenda sem buraco. */
function tocarDecodificado(ctx: AudioContext, buf: AudioBuffer, vol: number, v: number, laco: boolean): Tocando {
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  const fonte = ctx.createBufferSource();
  fonte.buffer = buf;
  fonte.loop = laco;
  if (laco) { fonte.loopStart = LACO_DO_TEMA.de; fonte.loopEnd = LACO_DO_TEMA.ate; }
  fonte.playbackRate.value = Math.max(0.5, Math.min(4, v));
  const ganho = ctx.createGain();
  ganho.gain.value = vol;
  fonte.connect(ganho).connect(ctx.destination);
  const som: Tocando = {
    calar(ms) {
      const agora = ctx.currentTime, s = Math.max(0.01, ms / 1000);
      ganho.gain.cancelScheduledValues(agora);
      ganho.gain.setValueAtTime(ganho.gain.value, agora);
      ganho.gain.linearRampToValueAtTime(0, agora + s);
      try { fonte.stop(agora + s); } catch { /* já parou */ }
      tocando.delete(som);
    },
  };
  fonte.onended = () => tocando.delete(som);
  fonte.start();
  return som;
}

/** Pelo `<audio>`, quando o trecho ainda não foi decodificado. */
function tocarPeloAudio(som: SomDaCoisa, vol: number, v: number, laco: boolean): Tocando {
  const a = new Audio(arquivo(som));
  a.volume = vol;
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
      const de = a.volume;
      const comeco = performance.now();
      const id = window.setInterval(() => {
        const k = Math.min(1, (performance.now() - comeco) / Math.max(1, ms));
        a.volume = de * (1 - k);
        if (k >= 1) { window.clearInterval(id); a.pause(); }
      }, 40);
    },
  };
  if (!laco) a.addEventListener('ended', () => tocando.delete(t), { once: true });
  void a.play().catch(() => tocando.delete(t));
  return t;
}

/** Toca um trecho do começo (o `tema` fica em laço até calar); devolve para calar depois. */
export function tocarSomDaCoisa(som: SomDaCoisa, v = 1, volume = 1): Tocando | null {
  if (typeof Audio === 'undefined') return null;
  const antes = ultimo.get(som);
  if (antes && performance.now() - antes.em < REPETIDO_MS) return antes.som;
  const vol = Math.max(0, Math.min(1, VOLUME[som] * volume));
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

/** Cala tudo o que a Coisa está tocando (a tela fechou). */
export function calarSonsDaCoisa(ms = 300): void {
  for (const t of [...tocando]) t.calar(ms);
}
