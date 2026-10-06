/**
 * sirene.ts — a viatura chegando lá embaixo, feita na hora (Web Audio).
 *
 * A sirene «wail» subindo e descendo, longe e abafada no começo (filtro
 * fechado, volume baixo), abrindo conforme chega; ecoa entre os prédios. Quando
 * a viatura para, o policial corta a sirene: o tom despenca e some — as luzes
 * continuam piscando em silêncio, como nas viaturas paradas dos filmes.
 *
 * Quem chama passa o volume (o do Som ambiente; zero com a música pausada).
 */
import { contextoDeAudio } from './audio';

/** Toca a chegada: `chegadaS` segundos até a viatura parar e cortar a sirene. */
export function sirene(chegadaS: number, volume: number): void {
  if (volume <= 0) return;
  const ctx = contextoDeAudio();
  if (!ctx) return;
  void ctx.resume();
  const t0 = ctx.currentTime + 0.05, corta = t0 + chegadaS, fim = corta + 0.8;

  // Saída: de longe para perto, vindo da esquerda (a rua embaixo da janela).
  const saida = ctx.createGain();
  saida.gain.setValueAtTime(0.0001, t0);
  saida.gain.exponentialRampToValueAtTime(volume * 0.12, t0 + chegadaS * 0.3);
  saida.gain.exponentialRampToValueAtTime(volume, corta - 0.3);
  saida.gain.setValueAtTime(volume, corta);
  saida.gain.exponentialRampToValueAtTime(0.0001, fim);
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(-0.8, t0);
  pan.pan.linearRampToValueAtTime(-0.25, corta);
  saida.connect(pan).connect(ctx.destination);

  // O eco entre os prédios: uma volta curta, abafada.
  const atraso = ctx.createDelay(1);
  atraso.delayTime.value = 0.27;
  const volta = ctx.createGain();
  volta.gain.value = 0.3;
  const abafa = ctx.createBiquadFilter();
  abafa.type = 'lowpass';
  abafa.frequency.value = 1600;
  const eco = ctx.createGain();
  eco.gain.value = 0.4;
  saida.connect(atraso).connect(abafa).connect(volta).connect(atraso);
  abafa.connect(eco).connect(pan);

  // Longe, só o meio da sirene passa; perto, ela abre.
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.Q.value = 0.8;
  filtro.frequency.setValueAtTime(700, t0);
  filtro.frequency.exponentialRampToValueAtTime(3200, corta);
  filtro.connect(saida);

  // O «wail»: sobe em 1,4 s, desce em 1,6 s; no corte, despenca.
  const tons = ([['sawtooth', 0.16, 0], ['triangle', 0.5, 7]] as const).map(([tipo, ganho, desafina]) => {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.detune.value = desafina;
    o.frequency.setValueAtTime(680, t0);
    for (let t = t0, sobe = true; t < corta; sobe = !sobe) {
      t = Math.min(corta, t + (sobe ? 1.4 : 1.6));
      o.frequency.linearRampToValueAtTime(sobe ? 1450 : 680, t);
    }
    o.frequency.exponentialRampToValueAtTime(240, fim);
    const g = ctx.createGain();
    g.gain.value = ganho;
    o.connect(g).connect(filtro);
    return o;
  });
  for (const o of tons) { o.start(t0); o.stop(fim + 0.05); }
  // O laço do eco não se desliga sozinho: desfaz depois que a cauda morreu.
  window.setTimeout(() => { saida.disconnect(); atraso.disconnect(); abafa.disconnect(); volta.disconnect(); eco.disconnect(); },
    (fim - ctx.currentTime + 3) * 1000);
}
