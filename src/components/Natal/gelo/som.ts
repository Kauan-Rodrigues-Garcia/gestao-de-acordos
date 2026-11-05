/**
 * O som do bloco de gelo: a música passando por um filtro (abafada, como
 * ouvida através do gelo) e um eco que se repete, também abafado.
 *
 *   música → passa-baixa ─┬─ seco ──────────────────────┬→ volume → análise → saída
 *                         └→ atraso ⇄ (passa-baixa, volta) → eco ┘
 *
 * Enquanto toca, o filtro vai ABRINDO devagar (o gelo cedendo enquanto se
 * escuta). A análise dá o grave a cada quadro, para o bloco pulsar.
 *
 * O arquivo é um trecho da música que já começa nos 19 s dela (`public/audio/
 * natal/dingo-bell.mp3`, 75 s). Como o resto da mídia do Natal, ele fica FORA
 * do git — precisa ir para o deploy à parte.
 */
import { abaixarRadio } from '../musica';
import type { SomDoGelo } from './degelo';

const ARQUIVO = '/audio/natal/dingo-bell.mp3';
/** O volume da música (o gelo já tira um tanto, abafando). */
const VOLUME = 0.42;
const ENTRA_S = 0.9;
const SAI_S = 0.7;
/** Em quantos segundos o filtro abre enquanto toca, e até quanto. */
const ABRE_EM_S = 28;
const ABRE_ATE = 1.9;

interface Motor {
  ctx: AudioContext;
  audio: HTMLAudioElement;
  filtro: BiquadFilterNode;
  seco: GainNode;
  eco: GainNode;
  volta: GainNode;
  mestre: GainNode;
  analise: AnalyserNode;
  graves: Uint8Array<ArrayBuffer>;
}

let motor: Motor | null = null;
let vez = 0;
let aoAcabar: (() => void) | null = null;

function criarMotor(): Motor | null {
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  let ctx: AudioContext;
  try { ctx = new C(); } catch { return null; }
  const audio = new Audio(ARQUIVO);
  audio.preload = 'auto';
  const fonte = ctx.createMediaElementSource(audio);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.Q.value = 0.9;
  const seco = ctx.createGain();
  const atraso = ctx.createDelay(1);
  atraso.delayTime.value = 0.27;
  const filtroDoEco = ctx.createBiquadFilter();
  filtroDoEco.type = 'lowpass';
  filtroDoEco.frequency.value = 1600;
  const volta = ctx.createGain();
  const eco = ctx.createGain();
  const mestre = ctx.createGain();
  mestre.gain.value = 0;
  const analise = ctx.createAnalyser();
  analise.fftSize = 256;
  analise.smoothingTimeConstant = 0.72;

  fonte.connect(filtro);
  filtro.connect(seco).connect(mestre);
  filtro.connect(atraso);
  atraso.connect(filtroDoEco);
  filtroDoEco.connect(volta).connect(atraso);
  filtroDoEco.connect(eco).connect(mestre);
  mestre.connect(analise).connect(ctx.destination);

  audio.addEventListener('ended', () => { abaixarRadio(1); aoAcabar?.(); });
  return { ctx, audio, filtro, seco, eco, volta, mestre, analise, graves: new Uint8Array(new ArrayBuffer(analise.frequencyBinCount)) };
}

export type ComoFoi = 'tocando' | 'bloqueado' | 'sem-som';

/**
 * Toca do começo do trecho, com o som do gelo de hoje. `bloqueado`: o
 * navegador ainda não deixou tocar (falta um clique na página).
 */
export async function tocarDoGelo(som: SomDoGelo, acabou: () => void): Promise<ComoFoi> {
  motor ??= criarMotor();
  const m = motor;
  if (!m) return 'sem-som';
  const minha = ++vez;
  aoAcabar = acabou;
  try { await m.ctx.resume(); } catch { /* segue: confere o estado abaixo */ }
  if (m.ctx.state !== 'running') return 'bloqueado';
  const t = m.ctx.currentTime;
  m.filtro.frequency.cancelScheduledValues(t);
  m.filtro.frequency.setValueAtTime(som.corte, t);
  m.filtro.frequency.linearRampToValueAtTime(Math.min(18_000, som.corte * ABRE_ATE), t + ABRE_EM_S);
  m.eco.gain.setValueAtTime(som.eco, t);
  m.volta.gain.setValueAtTime(som.repeticao, t);
  m.seco.gain.setValueAtTime(1 - som.eco * 0.35, t);
  m.audio.currentTime = 0;
  try { await m.audio.play(); } catch { return 'bloqueado'; }
  if (minha !== vez) return 'tocando';
  m.mestre.gain.cancelScheduledValues(t);
  m.mestre.gain.setValueAtTime(m.mestre.gain.value, t);
  m.mestre.gain.linearRampToValueAtTime(VOLUME, t + ENTRA_S);
  abaixarRadio(0.15);
  return 'tocando';
}

/** Some aos poucos e para. */
export function pararDoGelo() {
  const m = motor;
  if (!m) return;
  const minha = ++vez;
  aoAcabar = null;
  const t = m.ctx.currentTime;
  m.mestre.gain.cancelScheduledValues(t);
  m.mestre.gain.setValueAtTime(m.mestre.gain.value, t);
  m.mestre.gain.linearRampToValueAtTime(0, t + SAI_S);
  abaixarRadio(1);
  window.setTimeout(() => { if (minha === vez) m.audio.pause(); }, SAI_S * 1000 + 60);
}

/** O grave de agora (0 a 1), para o bloco pulsar com a música. */
export function graveAgora(): number {
  const m = motor;
  if (!m) return 0;
  m.analise.getByteFrequencyData(m.graves);
  // As primeiras faixas (até ~700 Hz): o bumbo do funk.
  const g = m.graves;
  return (g[1] + g[2] + g[3] + g[4]) / (4 * 255);
}
