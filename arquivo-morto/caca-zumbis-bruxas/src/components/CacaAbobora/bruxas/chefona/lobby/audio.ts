/**
 * audio.ts — UM AudioContext para o lobby inteiro (a trilha e o tique).
 *
 * Cada AudioContext tem a sua thread de áudio: em computador fraco, dois ou
 * três abertos ao mesmo tempo já pesam. A trilha e o tique dividem este.
 */

let ctx: AudioContext | null = null;

/** O contexto do lobby (criado na primeira vez). `null` sem Web Audio. */
export function contextoDoLobby(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch((): void => undefined);
    return ctx;
  } catch {
    return null;
  }
}
