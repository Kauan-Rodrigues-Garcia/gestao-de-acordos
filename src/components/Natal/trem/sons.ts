/**
 * Os sons do trenzinho.
 *
 *   buzina — o arquivo `/audio/natal/trem-buzina.mp3` (freesound, «train horn
 *            fades»), com as buzinas já abaixadas no próprio arquivo: o som do
 *            trem chegando fica, a buzina vem bem de longe. Toca toda vez que
 *            o trem sai da estação (quem decide é a camada).
 *   sino   — o «dlim-dlim» da estação, sintetizado (Web Audio).
 *
 * O navegador só deixa tocar som depois de um clique ou tecla na página: antes
 * disso as chamadas não fazem nada. Ligado/desligado fica no `localStorage`
 * deste navegador (o sininho do aviso do trem).
 */
import { useSyncExternalStore } from 'react';

const CHAVE = 'natal:trem:sons';
const VOLUME = 0.16;
/** A buzina toca baixinho: é um detalhe, não um alarme. */
const VOLUME_BUZINA = 0.22;
const ARQUIVO_BUZINA = '/audio/natal/trem-buzina.mp3';

let ligados = (() => { try { return localStorage.getItem(CHAVE) !== 'off'; } catch { return true; } })();
const ouvintes = new Set<() => void>();

export function ligarSonsDoTrem(v: boolean) {
  ligados = v;
  try { localStorage.setItem(CHAVE, v ? 'on' : 'off'); } catch { /* modo privado */ }
  for (const f of ouvintes) f();
}

export function useSonsDoTrem(): boolean {
  return useSyncExternalStore(
    f => { ouvintes.add(f); return () => { ouvintes.delete(f); }; },
    () => ligados,
  );
}

let contexto: AudioContext | null = null;
let liberado = false;

/** O primeiro gesto da pessoa libera o som (regra do navegador). */
if (typeof window !== 'undefined') {
  const liberar = () => {
    liberado = true;
    if (contexto?.state === 'suspended') void contexto.resume();
    window.removeEventListener('pointerdown', liberar, true);
    window.removeEventListener('keydown', liberar, true);
  };
  window.addEventListener('pointerdown', liberar, true);
  window.addEventListener('keydown', liberar, true);
}

function ctx(): AudioContext | null {
  if (!ligados || !liberado || document.hidden) return null;
  if (!contexto) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    contexto = new C();
  }
  if (contexto.state === 'suspended') void contexto.resume();
  return contexto;
}

/** «Dlim-dlim» da estação. */
export function sino(vezes = 2) {
  const c = ctx();
  if (!c) return;
  const saida = c.createGain();
  saida.gain.value = VOLUME * 0.9;
  saida.connect(c.destination);
  for (let k = 0; k < vezes; k++) {
    const t = c.currentTime + 0.02 + k * 0.32;
    // Parciais de sino pequeno (fundamental em mi).
    for (const [mult, g, dec] of [[1, 0.5, 1.4], [2.76, 0.22, 0.8], [5.4, 0.12, 0.45], [8.93, 0.06, 0.25]] as const) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = 1318.5 * mult / 2;
      const g1 = c.createGain();
      g1.gain.setValueAtTime(0, t);
      g1.gain.linearRampToValueAtTime(g, t + 0.004);
      g1.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g1).connect(saida);
      o.start(t);
      o.stop(t + dec + 0.05);
    }
  }
}

let buzinaTocando: HTMLAudioElement | null = null;

/**
 * A buzina do arquivo, bem baixa. Não empilha: se já está tocando, não começa
 * outra. `teste` (o botão do `npm run dev`) toca mesmo com os sons desligados
 * e recomeça do zero.
 */
export function buzina(teste = false) {
  if (teste) { buzinaTocando?.pause(); buzinaTocando = null; liberado = true; }
  else if (!ligados || !liberado || document.hidden) return;
  if (buzinaTocando && !buzinaTocando.ended) return;
  const a = new Audio(ARQUIVO_BUZINA);
  a.volume = VOLUME_BUZINA;
  buzinaTocando = a;
  void a.play().catch(() => { /* o navegador recusou: fica sem buzina */ });
}
