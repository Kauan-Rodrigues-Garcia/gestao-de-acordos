/**
 * som.ts — os sons do Bingo, sintetizados (Web Audio), sem arquivo nenhum.
 *
 * Mesmo princípio de `lib/som-comemoracao.ts`: navegador que bloqueia áudio
 * sem clique simplesmente fica em silêncio — nunca derruba a tela.
 */

let contexto: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    if (!contexto) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      contexto = new C();
    }
    if (contexto.state === 'suspended') void contexto.resume().catch(() => {});
    return contexto;
  } catch {
    return null;
  }
}

function nota(c: AudioContext, freq: number, inicio: number, dur: number, volume: number, forma: OscillatorType = 'sine') {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = forma;
  o.frequency.setValueAtTime(freq, inicio);
  g.gain.setValueAtTime(0.0001, inicio);
  g.gain.exponentialRampToValueAtTime(volume, inicio + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
  o.connect(g).connect(c.destination);
  o.start(inicio);
  o.stop(inicio + dur + 0.05);
}

/** O «plim» da pedra nova, baixinho (é call center). */
export function tocarPlim(volume = 0.12): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  nota(c, 1318.5, t, 0.25, volume, 'triangle');
  nota(c, 1975.5, t + 0.09, 0.35, volume * 0.8, 'triangle');
}

/** O globo girando: um chocalho de notas curtas que acelera. */
export function tocarGlobo(volume = 0.08, segundos = 2.2): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  let passo = 0.11;
  for (let x = 0; x < segundos; x += passo) {
    nota(c, 300 + Math.random() * 500, t + x, 0.06, volume, 'square');
    passo = Math.max(0.045, passo * 0.94);
  }
}

/** A bola saiu. */
export function tocarSaiu(volume = 0.18): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => nota(c, f, t + i * 0.08, 0.3, volume, 'triangle'));
}

/** A fanfarra da vitória. */
export function tocarFanfarra(volume = 0.2): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  const melodia: [number, number, number][] = [
    [523.25, 0, 0.18], [523.25, 0.2, 0.18], [523.25, 0.4, 0.18], [659.25, 0.6, 0.5],
    [587.33, 1.15, 0.18], [659.25, 1.35, 0.18], [783.99, 1.55, 0.9],
  ];
  for (const [f, quando, dur] of melodia) {
    nota(c, f, t + quando, dur, volume, 'square');
    nota(c, f / 2, t + quando, dur, volume * 0.5, 'triangle');
  }
}

/** O grito de alguém: dois toques de alerta. */
export function tocarGrito(volume = 0.16): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime;
  nota(c, 880, t, 0.15, volume, 'sawtooth');
  nota(c, 1174.7, t + 0.17, 0.25, volume, 'sawtooth');
}
