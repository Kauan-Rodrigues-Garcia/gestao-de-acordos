/**
 * audio.ts — um contexto de áudio só para os sons do modo Batman (chuva,
 * trovão, ronco do Batmóvel). Criar um por som custa caro e o navegador limita
 * quantos podem existir ao mesmo tempo; os nós de cada som se desligam sozinhos
 * quando terminam.
 */
type ComWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
let ctx: AudioContext | null = null;

/** O contexto compartilhado (criado na primeira vez); `null` se o navegador não tem Web Audio. */
export function contextoDeAudio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as ComWebkit).webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { return null; }
  return ctx;
}
