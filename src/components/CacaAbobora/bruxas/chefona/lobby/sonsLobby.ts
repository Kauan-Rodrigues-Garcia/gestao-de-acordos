/**
 * sonsLobby.ts — o tique da contagem no lobby da Bruxa do Pântano.
 *
 * É o MESMO som do `somTique` da caça (`../../../sons.ts`): um bipe quadrado
 * de 50 ms, 880 Hz nos segundos 10 a 4 e 1320 Hz nos 3 últimos, com um chiado
 * agudo de 20 ms. Mas lá ele passa pelo volume do chefão, que para o operador
 * é 12%: com a trilha do lobby subindo para 15%, o tique sumia debaixo dela.
 * Aqui ele toca no volume cheio do som (o que o super_admin já ouve).
 */
import { contextoDoLobby } from './audio';

let ruido: AudioBuffer | null = null;

function chiado(c: AudioContext, pico: number, dura: number): void {
  if (!ruido) {
    ruido = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i += 4) d.fill(Math.random() * 2 - 1, i, i + 4);
  }
  const f = c.createBufferSource();
  f.buffer = ruido;
  const filtro = c.createBiquadFilter();
  filtro.type = 'highpass';
  filtro.frequency.value = 3000;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(pico, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dura);
  f.connect(filtro).connect(g).connect(c.destination);
  f.start(t);
  f.stop(t + dura + 0.02);
}

/** O tique de um segundo da contagem; `final` = os 3 últimos (mais agudo). */
export function tiqueDaContagem(final: boolean): void {
  const c = contextoDoLobby();
  if (!c) return;
  try {
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = final ? 1320 : 880;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.07);
    chiado(c, 0.08, 0.02);
  } catch { /* som é enfeite */ }
}
