/**
 * Os sons do sorteio ao vivo: sintetizados na hora (nada para baixar), baixos,
 * com mudo guardado no navegador. Usa o mesmo AudioContext da Corrida.
 */
import { destravarAudio } from '@/components/Corrida/nome';

const CHAVE_MUDO = 'sorteio-vale-mudo';
export const lerMudo = (): boolean => { try { return localStorage.getItem(CHAVE_MUDO) === '1'; } catch { return false; } };
export const gravarMudo = (v: boolean): void => { try { localStorage.setItem(CHAVE_MUDO, v ? '1' : '0'); } catch { /* sem localStorage */ } };

function nota(ctx: AudioContext, freq: number, inicio: number, dur: number, vol: number, tipo: OscillatorType = 'triangle'): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = tipo;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, inicio);
  g.gain.linearRampToValueAtTime(vol, inicio + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
  o.connect(g).connect(ctx.destination);
  o.start(inicio);
  o.stop(inicio + dur + 0.02);
}

export type Som = 'rolo' | 'conta' | 'vai' | 'ganhou';

export function tocar(som: Som): void {
  if (lerMudo()) return;
  const ctx = destravarAudio();
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  if (som === 'rolo') nota(ctx, 1200, t, 0.035, 0.035, 'square');
  else if (som === 'conta') nota(ctx, 660, t, 0.18, 0.12);
  else if (som === 'vai') { nota(ctx, 990, t, 0.12, 0.12); nota(ctx, 1320, t + 0.1, 0.3, 0.12); }
  else {
    [523, 659, 784, 1047].forEach((f, i) => nota(ctx, f, t + i * 0.11, 0.35, 0.13));
    nota(ctx, 1319, t + 0.48, 0.7, 0.1, 'sine');
  }
}
