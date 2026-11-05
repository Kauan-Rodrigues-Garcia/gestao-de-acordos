/**
 * Os sons da cesta de Natal, sintetizados (Web Audio, sem arquivo).
 *
 *   somDaCesta — o «chuá» da rede e um sininho em arpejo (dó-mi-sol-dó) que
 *                sobe um degrau da escala a cada cesta, para dar a sensação de
 *                sequência; depois da oitava, recomeça.
 *   somDoAro   — um «tim» curtinho e baixo quando a bola bate no aro.
 *
 * O navegador só toca depois de um gesto: `prepararSomDaCesta` é chamado no
 * aperto da bola, que é um gesto de verdade.
 */

let contexto: AudioContext | null = null;
const VOLUME = 0.2;
const ESCALA = [0, 2, 4, 5, 7, 9, 11, 12];

function ctx(): AudioContext | null {
  if (typeof window === 'undefined' || document.hidden) return null;
  if (!contexto) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    try { contexto = new C(); } catch { return null; }
  }
  if (contexto.state === 'suspended') void contexto.resume();
  return contexto;
}

export function prepararSomDaCesta() { ctx(); }

/** Um sino pequeno: a fundamental e duas parciais que somem antes. */
function sininho(c: AudioContext, saida: AudioNode, freq: number, t: number, dura: number, volume: number) {
  for (const [mult, g, dec] of [[1, 1, dura], [2, 0.22, dura * 0.45], [3.01, 0.08, dura * 0.25]] as const) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(volume * g, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(env).connect(saida);
    o.start(t);
    o.stop(t + dec + 0.05);
  }
}

/** A cesta: `acerto` é qual cesta foi (1, 2, 3…), para o arpejo ir subindo. */
export function somDaCesta(acerto: number) {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + 0.01;
  const saida = c.createGain();
  saida.gain.value = VOLUME;
  saida.connect(c.destination);

  // O «chuá» da rede: ruído passando por um filtro que desce.
  const n = Math.floor(c.sampleRate * 0.26);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const ruido = c.createBufferSource();
  ruido.buffer = buf;
  const filtro = c.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = 0.9;
  filtro.frequency.setValueAtTime(2600, t0);
  filtro.frequency.exponentialRampToValueAtTime(900, t0 + 0.22);
  const gr = c.createGain();
  gr.gain.setValueAtTime(0.0001, t0);
  gr.gain.exponentialRampToValueAtTime(0.32, t0 + 0.02);
  gr.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
  ruido.connect(filtro).connect(gr).connect(saida);
  ruido.start(t0);
  ruido.stop(t0 + 0.27);

  // O sininho: dó-mi-sol-dó, a partir do degrau desta cesta.
  const base = 1046.5 * Math.pow(2, ESCALA[(Math.max(1, acerto) - 1) % ESCALA.length] / 12);
  [1, 1.2599, 1.4983, 2].forEach((m, i) => {
    sininho(c, saida, base * m, t0 + 0.07 + i * 0.075, i === 3 ? 1.3 : 0.7, i === 3 ? 0.42 : 0.32);
  });
}

/** O boneco pegou a bola: um «bup-bip» fofinho, subindo. */
export function somDoBonecoPegando() {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + 0.005;
  const saida = c.createGain();
  saida.gain.value = VOLUME * 0.9;
  saida.connect(c.destination);
  [[523.25, 0], [783.99, 0.07]].forEach(([freq, atraso]) => {
    const t = t0 + atraso;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 0.85, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.04);
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(env).connect(saida);
    o.start(t);
    o.stop(t + 0.2);
  });
}

/** O boneco arremessou: um «fiuu» de ar subindo, bem baixinho. */
export function somDoArremessoDoBoneco() {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + 0.005;
  const n = Math.floor(c.sampleRate * 0.3);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const ruido = c.createBufferSource();
  ruido.buffer = buf;
  const filtro = c.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = 2.2;
  filtro.frequency.setValueAtTime(500, t0);
  filtro.frequency.exponentialRampToValueAtTime(2600, t0 + 0.26);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(VOLUME * 1.1, t0 + 0.09);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.29);
  ruido.connect(filtro).connect(env).connect(c.destination);
  ruido.start(t0);
  ruido.stop(t0 + 0.31);
}

/** A bola bateu no aro: um «tim» mais forte quanto mais forte a batida. */
export function somDoAro(forca: number) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const saida = c.createGain();
  saida.gain.value = VOLUME * Math.min(0.7, forca / 1400);
  saida.connect(c.destination);
  for (const [freq, dec] of [[1760, 0.16], [2794, 0.09]] as const) {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const env = c.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(env).connect(saida);
    o.start(t);
    o.stop(t + dec + 0.03);
  }
}
