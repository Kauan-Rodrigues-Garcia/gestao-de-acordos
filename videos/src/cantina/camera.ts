// A câmera dos vídeos curtos (cópia da de `pix-automatico`, que ainda está
// fora da main): uma lista de enquadramentos com o frame em que cada um
// termina de chegar. Entre um e outro, a curva de ida e volta.
// Tudo em coordenadas do app (1600×874), como o cursor.

import { APP_A, APP_L, ESCALA_JANELA, BARRA_NAV, JANELA } from '../app/layout';
import { ms, SUAVE_IDA_VOLTA } from '../movimento';

export type Camera = { f: number; z: number; x: number; y: number; durMs: number };
export type Quadro = { z: number; x: number; y: number };

export const GERAL: Quadro = { z: 1, x: APP_L / 2, y: APP_A / 2 };

export function cameraEm(frame: number, chaves: Camera[]): Quadro {
  let atual = { z: chaves[0].z, x: chaves[0].x, y: chaves[0].y };
  for (let i = 1; i < chaves.length; i++) {
    const k = chaves[i];
    const dur = ms(k.durMs);
    if (frame <= k.f - dur) break;
    const p = SUAVE_IDA_VOLTA(Math.min(1, (frame - (k.f - dur)) / dur));
    atual = { z: atual.z + (k.z - atual.z) * p, x: atual.x + (k.x - atual.x) * p, y: atual.y + (k.y - atual.y) * p };
    if (frame < k.f) break;
  }
  const meiaL = APP_L / 2 / atual.z;
  const meiaA = APP_A / 2 / atual.z;
  return { z: atual.z, x: Math.min(APP_L - meiaL, Math.max(meiaL, atual.x)), y: Math.min(APP_A - meiaA, Math.max(meiaA, atual.y)) };
}

/** Aproxima até o retângulo caber na tela, com folga. */
export function enquadra(r: { x: number; y: number; l: number; a: number }, folga = 36, zMax = 1.5): Quadro {
  const z = Math.max(1, Math.min(zMax, APP_L / (r.l + 2 * folga), APP_A / (r.a + 2 * folga)));
  return { z, x: r.x + r.l / 2, y: r.y + r.a / 2 };
}

/** Um ponto do app, com a câmera aplicada, em pixels da tela do vídeo (1920×1080). */
export function naTela(p: { x: number; y: number }, cam: Quadro) {
  return {
    x: JANELA.x + ESCALA_JANELA * (APP_L / 2 + (p.x - cam.x) * cam.z),
    y: JANELA.y + BARRA_NAV + ESCALA_JANELA * (APP_A / 2 + (p.y - cam.y) * cam.z),
  };
}
