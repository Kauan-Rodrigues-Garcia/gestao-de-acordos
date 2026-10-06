/**
 * ronco.ts — o motor do Batmóvel passando, feito na hora (Web Audio).
 *
 * Sem arquivo de som: três osciladores graves (o motor), um chiado filtrado (o
 * escapamento) e um tremor rápido (os cilindros), saturados. Vem da direita,
 * cresce, passa no meio (o tom cai, como carro que passa) e some à esquerda.
 *
 * Quem chama passa o volume (o do Som ambiente; zero com a música pausada).
 */
import { contextoDeAudio } from './audio';

/** Toca o ronco por `duracaoMs` (o tempo da travessia na tela), no `volume` (0 a 1). */
export function roncar(duracaoMs: number, volume: number): void {
  if (volume <= 0) return;
  const ctx = contextoDeAudio();
  if (!ctx) return;
  void ctx.resume();
  const t0 = ctx.currentTime + 0.05, T = duracaoMs / 1000, meio = t0 + T * 0.5, fim = t0 + T + 0.6;

  // Saída: cresce chegando, pico no meio, some indo embora — e anda da direita para a esquerda.
  const saida = ctx.createGain();
  saida.gain.setValueAtTime(0.0001, t0);
  saida.gain.exponentialRampToValueAtTime(volume * 0.3, t0 + T * 0.3);
  saida.gain.exponentialRampToValueAtTime(volume, meio);
  saida.gain.exponentialRampToValueAtTime(volume * 0.25, t0 + T * 0.8);
  saida.gain.exponentialRampToValueAtTime(0.0001, fim);
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(0.9, t0);
  pan.pan.linearRampToValueAtTime(-0.9, t0 + T);
  saida.connect(pan).connect(ctx.destination);

  // Abre o filtro quando ele está perto: o grave vira rugido.
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.Q.value = 3;
  filtro.frequency.setValueAtTime(240, t0);
  filtro.frequency.exponentialRampToValueAtTime(1300, meio);
  filtro.frequency.exponentialRampToValueAtTime(320, fim);
  filtro.connect(saida);

  const satura = ctx.createWaveShaper();
  const curva = new Float32Array(1024);
  for (let i = 0; i < curva.length; i++) { const x = (i / (curva.length - 1)) * 2 - 1; curva[i] = Math.tanh(x * 5); }
  satura.curve = curva;
  satura.connect(filtro);

  // Os cilindros: o volume do motor treme rápido.
  const tremor = ctx.createGain();
  tremor.gain.value = 0.65;
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(16, t0);
  lfo.frequency.linearRampToValueAtTime(22, meio);
  lfo.frequency.linearRampToValueAtTime(14, fim);
  const fundoLfo = ctx.createGain();
  fundoLfo.gain.value = 0.35;
  lfo.connect(fundoLfo).connect(tremor.gain);
  tremor.connect(satura);

  // O motor: a rotação sobe chegando e cai quando passa (o efeito do carro que passa).
  const motores = ([[1, 'sawtooth', 0.55], [2, 'square', 0.22], [0.5, 'sine', 0.7]] as const).map(([mult, tipo, ganho]) => {
    const o = ctx.createOscillator();
    o.type = tipo;
    const f = 41 * mult;
    o.frequency.setValueAtTime(f * 0.95, t0);
    o.frequency.exponentialRampToValueAtTime(f * 1.14, meio - 0.05);
    o.frequency.exponentialRampToValueAtTime(f * 0.86, meio + 0.25);
    o.frequency.exponentialRampToValueAtTime(f * 0.8, fim);
    const g = ctx.createGain();
    g.gain.value = ganho;
    o.connect(g).connect(tremor);
    return o;
  });

  // O escapamento: chiado grave.
  const ruido = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const dados = buf.getChannelData(0);
  for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
  ruido.buffer = buf;
  ruido.loop = true;
  const banda = ctx.createBiquadFilter();
  banda.type = 'bandpass';
  banda.frequency.value = 110;
  banda.Q.value = 0.7;
  const ganhoRuido = ctx.createGain();
  ganhoRuido.gain.value = 0.5;
  ruido.connect(banda).connect(ganhoRuido).connect(tremor);

  for (const n of [...motores, lfo, ruido]) { n.start(t0); n.stop(fim); }
  // Os nós se desligam sozinhos ao parar; o contexto é compartilhado e fica.
}
