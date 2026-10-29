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
 *   danca      «Pennywise Dance and The Dead Lights»  23,95 a 31,35 s  o golpe da
 *              dança aos 24,0 s do original; o miolo forte vai até 30,4 s
 *   flutua     «It 2017 we all float down here»        22,30 a 31,00 s  «You'll
 *              float down here. We'll float down here. Yes, we do.» até 5,8 s
 *              do trecho, e a risada até o fim
 *   luzes      «Pennywise Dance and The Dead Lights»  64,60 a 74,10 s  as luzes
 *              mortas, com as crianças flutuando
 *   risada     «IT Pennywise laugh sound effect»       0,15 a 5,00 s
 *
 * O som anda na velocidade do mural (o painel de teste), como as animações.
 * Tocar sem um clique antes na página pode ser barrado pelo navegador: aí
 * fica mudo, sem erro — o som é reforço.
 */

export type SomDaCoisa = 'ola' | 'balao' | 'apresenta' | 'danca' | 'flutua' | 'luzes' | 'risada';

const VOLUME: Readonly<Record<SomDaCoisa, number>> = {
  ola: 0.75,
  balao: 0.9,
  apresenta: 1,
  danca: 0.8,
  flutua: 1,
  luzes: 0.85,
  risada: 0.9,
};

const tocando = new Set<HTMLAudioElement>();
/** O último áudio de cada trecho e quando começou. */
const ultimo = new Map<SomDaCoisa, { audio: HTMLAudioElement; em: number }>();
/** O mesmo trecho duas vezes em menos que isso é um só (o StrictMode monta duas vezes). */
const REPETIDO_MS = 150;

function arquivo(som: SomDaCoisa): string {
  return `/sons/coisa/${som}.mp3`;
}

/** Baixa os trechos antes da hora (a abertura chama: a Coisa vem logo depois). */
export function prepararSonsDaCoisa(): void {
  if (typeof Audio === 'undefined') return;
  for (const som of Object.keys(VOLUME) as SomDaCoisa[]) {
    try {
      const a = new Audio(arquivo(som));
      a.preload = 'auto';
    } catch { /* sem áudio, segue mudo */ }
  }
}

/** Toca um trecho do começo; devolve o áudio para calar depois. */
export function tocarSomDaCoisa(som: SomDaCoisa, v = 1, volume = 1): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  const antes = ultimo.get(som);
  if (antes && performance.now() - antes.em < REPETIDO_MS) return antes.audio;
  try {
    const a = new Audio(arquivo(som));
    ultimo.set(som, { audio: a, em: performance.now() });
    a.volume = Math.max(0, Math.min(1, VOLUME[som] * volume));
    a.playbackRate = Math.max(0.5, Math.min(4, v));
    tocando.add(a);
    a.addEventListener('ended', () => tocando.delete(a), { once: true });
    void a.play().catch(() => tocando.delete(a));
    return a;
  } catch {
    return null;
  }
}

/** Abaixa até calar, em `ms`. */
export function calarSom(a: HTMLAudioElement | null | undefined, ms = 400): void {
  if (!a) return;
  const de = a.volume;
  const comeco = performance.now();
  const id = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - comeco) / Math.max(1, ms));
    a.volume = de * (1 - k);
    if (k >= 1) {
      window.clearInterval(id);
      a.pause();
      tocando.delete(a);
    }
  }, 40);
}

/** Cala o último deste trecho, se ainda estiver tocando. */
export function calarSomDaCoisa(som: SomDaCoisa, ms = 400): void {
  const a = ultimo.get(som)?.audio;
  if (a && tocando.has(a)) calarSom(a, ms);
}

/** Cala tudo o que a Coisa está tocando (a tela fechou). */
export function calarSonsDaCoisa(ms = 300): void {
  for (const a of [...tocando]) calarSom(a, ms);
}
