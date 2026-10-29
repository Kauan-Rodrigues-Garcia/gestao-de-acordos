/**
 * som.ts — o som da sirene, feito na hora pelo navegador (Web Audio).
 *
 * Nenhum arquivo de áudio: dois osciladores (dente de serra e quadrada, um
 * pouco desafinados entre si) com a altura subindo e descendo, um pouco de
 * distorção e um filtro, como as sirenes eletrônicas de viatura. Primeiro o
 * «uuuu-iiii» lento (wail) e, na segunda metade, o rápido (yelp). Sem
 * download e sem direito autoral de terceiros.
 *
 * ## O navegador só deixa tocar depois de um clique
 *
 * Som sem gesto da pessoa é bloqueado. Por isso o contexto de áudio é
 * destravado no primeiro clique ou tecla em qualquer lugar do app (`destravar`)
 * e fica vivo: daí em diante a sirene toca sozinha, pelo timer. Quem abriu o
 * app e ainda não clicou em nada vê a luz, sem som.
 */

let contexto: AudioContext | null = null;

function criar(): AudioContext | null {
  if (contexto) return contexto;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try { contexto = new Ctor(); } catch { contexto = null; }
  return contexto;
}

let ouvindo = false;

/** Destrava o áudio no primeiro clique ou tecla (chamar uma vez, ao montar). */
export function destravarNoPrimeiroGesto(): void {
  if (ouvindo || typeof window === 'undefined') return;
  ouvindo = true;
  const destravar = () => {
    const ctx = criar();
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch((): void => undefined);
    if (ctx?.state === 'running') {
      window.removeEventListener('pointerdown', destravar, true);
      window.removeEventListener('keydown', destravar, true);
    }
  };
  window.addEventListener('pointerdown', destravar, true);
  window.addEventListener('keydown', destravar, true);
}

export function somLiberado(): boolean {
  return contexto?.state === 'running';
}

const GRAVE = 640;
const AGUDO = 1480;

/** O volume da primeira versão (29/10/2026), que conta como 100%. */
const VOLUME_CHEIO = 0.22;
/** A sirene toca a 50% (pedido do Kauan, 29/10/2026). */
export const VOLUME_DA_SIRENE = 0.5;

/**
 * Toca a sirene por `duracaoMs`. Devolve a função que para antes da hora.
 * Sem áudio liberado, não faz nada (e devolve uma função vazia).
 */
export function tocarSom(duracaoMs: number, volume = VOLUME_CHEIO * VOLUME_DA_SIRENE): () => void {
  const ctx = criar();
  if (!ctx || ctx.state !== 'running') return () => undefined;

  const t0 = ctx.currentTime + 0.02;
  const fim = t0 + duracaoMs / 1000;

  const saida = ctx.createGain();
  saida.gain.setValueAtTime(0, t0);
  saida.gain.linearRampToValueAtTime(volume, t0 + 0.25);
  saida.gain.setValueAtTime(volume, Math.max(t0 + 0.25, fim - 0.4));
  saida.gain.linearRampToValueAtTime(0, fim);

  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = 3200;
  filtro.Q.value = 0.8;

  // Um pouco de saturação: o alto-falante de viatura não é limpo.
  const distorcao = ctx.createWaveShaper();
  const curva = new Float32Array(1024);
  for (let i = 0; i < curva.length; i++) {
    const x = (i / (curva.length - 1)) * 2 - 1;
    curva[i] = Math.tanh(2.2 * x);
  }
  distorcao.curve = curva;

  distorcao.connect(filtro).connect(saida).connect(ctx.destination);

  const oscs = (['sawtooth', 'square'] as OscillatorType[]).map((tipo, i) => {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.detune.value = i === 0 ? 0 : 7;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.55 : 0.3;
    o.connect(g).connect(distorcao);
    return o;
  });

  // A altura: wail (sobe 1,1 s, desce 1,1 s) na primeira metade; yelp (0,32 s) depois.
  const meio = t0 + (fim - t0) / 2;
  for (const o of oscs) {
    const f = o.frequency;
    f.setValueAtTime(GRAVE, t0);
    let t = t0;
    while (t < meio) {
      f.linearRampToValueAtTime(AGUDO, t + 1.1);
      f.linearRampToValueAtTime(GRAVE, t + 2.2);
      t += 2.2;
    }
    while (t < fim) {
      f.linearRampToValueAtTime(AGUDO, t + 0.16);
      f.linearRampToValueAtTime(GRAVE, t + 0.32);
      t += 0.32;
    }
    o.start(t0);
    o.stop(fim + 0.05);
  }

  let parado = false;
  return () => {
    if (parado) return;
    parado = true;
    const agora = ctx.currentTime;
    saida.gain.cancelScheduledValues(agora);
    saida.gain.setValueAtTime(saida.gain.value, agora);
    saida.gain.linearRampToValueAtTime(0, agora + 0.12);
    for (const o of oscs) { try { o.stop(agora + 0.15); } catch { /* já parou */ } }
  };
}
